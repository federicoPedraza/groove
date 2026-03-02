#[cfg(target_os = "windows")]
fn parse_basic_csv_line(raw: &str) -> Vec<String> {
    diagnostics::parse_basic_csv_line(raw)
}

#[cfg(target_os = "windows")]
fn list_process_snapshot_rows() -> Result<(Vec<ProcessSnapshotRow>, Option<String>), String> {
    let command = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Csv -NoTypeInformation";
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", command])
        .output()
        .or_else(|_| {
            Command::new("pwsh")
                .args(["-NoProfile", "-Command", command])
                .output()
        })
        .map_err(|error| format!("Failed to execute PowerShell process query: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "PowerShell process query failed while listing processes.".to_string()
        } else {
            format!("PowerShell process query failed: {stderr}")
        });
    }

    let mut rows = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        if line.starts_with("\"ProcessId\"") {
            continue;
        }

        let columns = parse_basic_csv_line(line);
        if columns.len() < 4 {
            continue;
        }

        let Some(pid) = columns[0].trim().parse::<i32>().ok() else {
            continue;
        };
        let ppid = columns[1].trim().parse::<i32>().ok();
        let process_name = columns[2].trim().to_string();
        let command_line = columns[3].trim().to_string();

        rows.push(ProcessSnapshotRow {
            pid,
            ppid,
            process_name: if process_name.is_empty() {
                None
            } else {
                Some(process_name.clone())
            },
            command: if command_line.is_empty() {
                process_name
            } else {
                command_line
            },
        });
    }

    Ok((
        rows,
        Some(
            "Using PowerShell process snapshots for best-effort detection on Windows.".to_string(),
        ),
    ))
}

#[cfg(not(target_os = "windows"))]
fn list_process_snapshot_rows() -> Result<(Vec<ProcessSnapshotRow>, Option<String>), String> {
    let output = Command::new("ps")
        .args(["-eo", "pid=,ppid=,comm=,args="])
        .output()
        .map_err(|error| format!("Failed to execute ps: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "ps failed while listing processes.".to_string()
        } else {
            format!("ps failed: {stderr}")
        });
    }

    let mut rows = Vec::new();
    for raw in String::from_utf8_lossy(&output.stdout).lines() {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }

        let mut tokens = trimmed.split_whitespace();
        let Some(pid_token) = tokens.next() else {
            continue;
        };
        let Some(ppid_token) = tokens.next() else {
            continue;
        };
        let Some(process_name) = tokens.next() else {
            continue;
        };

        let Some(pid) = pid_token.parse::<i32>().ok() else {
            continue;
        };
        let ppid = ppid_token.parse::<i32>().ok();

        let command = tokens.collect::<Vec<_>>().join(" ");

        rows.push(ProcessSnapshotRow {
            pid,
            ppid,
            process_name: Some(process_name.to_string()),
            command: if command.is_empty() {
                process_name.to_string()
            } else {
                command
            },
        });
    }

    Ok((rows, None))
}

fn list_opencode_process_rows() -> Result<Vec<DiagnosticsProcessRow>, String> {
    let (snapshot_rows, _warning) = list_process_snapshot_rows()?;
    let mut rows = snapshot_rows
        .into_iter()
        .filter(|row| is_worktree_opencode_process(row.process_name.as_deref(), &row.command))
        .map(|row| DiagnosticsProcessRow {
            pid: row.pid,
            process_name: row.process_name.unwrap_or_else(|| "unknown".to_string()),
            command: row.command,
        })
        .collect::<Vec<_>>();

    rows.sort_by(|left, right| left.pid.cmp(&right.pid));
    Ok(rows)
}

fn list_non_worktree_opencode_process_rows() -> Result<Vec<DiagnosticsProcessRow>, String> {
    let (snapshot_rows, _warning) = list_process_snapshot_rows()?;
    let mut rows = snapshot_rows
        .into_iter()
        .filter(|row| {
            is_opencode_process(row.process_name.as_deref(), &row.command)
                && !command_mentions_worktrees(&row.command)
        })
        .map(|row| DiagnosticsProcessRow {
            pid: row.pid,
            process_name: row.process_name.unwrap_or_else(|| "unknown".to_string()),
            command: row.command,
        })
        .collect::<Vec<_>>();

    rows.sort_by(|left, right| left.pid.cmp(&right.pid));
    Ok(rows)
}

fn list_worktree_node_app_rows() -> Result<(Vec<DiagnosticsNodeAppRow>, Option<String>), String> {
    let (snapshot_rows, warning) = list_process_snapshot_rows()?;
    let mut rows = snapshot_rows
        .into_iter()
        .filter(|row| is_worktree_node_process(row.process_name.as_deref(), &row.command))
        .filter_map(|row| {
            let ppid = row.ppid?;
            Some(DiagnosticsNodeAppRow {
                pid: row.pid,
                ppid,
                cmd: row.command,
            })
        })
        .collect::<Vec<_>>();

    rows.sort_by(|left, right| left.pid.cmp(&right.pid));
    Ok((rows, warning))
}

fn resolve_node_app_pids_for_worktree(worktree_path: &Path) -> Vec<i32> {
    let Ok((snapshot_rows, _warning)) = list_process_snapshot_rows() else {
        return Vec::new();
    };

    let mut pids = snapshot_rows
        .into_iter()
        .filter(|row| {
            is_worktree_node_process(row.process_name.as_deref(), &row.command)
                && (command_mentions_worktree_path(&row.command, worktree_path)
                    || command_mentions_worktree_name(&row.command, worktree_path))
        })
        .map(|row| row.pid)
        .collect::<Vec<_>>();

    pids.sort_unstable();
    pids.dedup();
    pids
}

#[cfg(target_os = "windows")]
fn get_msot_consuming_programs_output() -> Result<String, String> {
    Err("This command is only supported on Unix-like systems.".to_string())
}

#[cfg(not(target_os = "windows"))]
fn get_msot_consuming_programs_output() -> Result<String, String> {
    let command = r#"ps -eo comm,rss --sort=-rss | awk '{arr[$1]+=$2} END {for (i in arr) printf "%-25s %.1f MB\n", i, arr[i]/1024}' | sort -k2 -nr | head"#;
    let output = Command::new("sh")
        .args(["-c", command])
        .output()
        .map_err(|error| format!("Failed to execute memory usage query: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Memory usage query failed with a non-zero exit status.".to_string()
        } else {
            format!("Memory usage query failed: {stderr}")
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn clamp_percentage(value: f64) -> f64 {
    value.clamp(0.0, 100.0)
}

fn resolve_hostname() -> Option<String> {
    if let Ok(hostname) = std::env::var("HOSTNAME") {
        let trimmed = hostname.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Ok(hostname) = std::env::var("COMPUTERNAME") {
        let trimmed = hostname.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    let output = Command::new("hostname").output().ok()?;
    if !output.status.success() {
        return None;
    }

    let hostname = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if hostname.is_empty() {
        None
    } else {
        Some(hostname)
    }
}

fn resolve_cpu_cores() -> Option<u32> {
    let parallelism = std::thread::available_parallelism().ok()?.get();
    u32::try_from(parallelism).ok()
}

#[cfg(target_os = "linux")]
fn read_linux_cpu_ticks() -> Option<(u64, u64)> {
    let stat = fs::read_to_string("/proc/stat").ok()?;
    let mut lines = stat.lines();
    let first_line = lines.next()?;
    let mut tokens = first_line.split_whitespace();
    if tokens.next()? != "cpu" {
        return None;
    }

    let user = tokens.next()?.parse::<u64>().ok()?;
    let nice = tokens.next()?.parse::<u64>().ok()?;
    let system = tokens.next()?.parse::<u64>().ok()?;
    let idle = tokens.next()?.parse::<u64>().ok()?;
    let iowait = tokens
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let irq = tokens
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let softirq = tokens
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let steal = tokens
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);

    let idle_all = idle.saturating_add(iowait);
    let non_idle = user
        .saturating_add(nice)
        .saturating_add(system)
        .saturating_add(irq)
        .saturating_add(softirq)
        .saturating_add(steal);

    Some((idle_all, idle_all.saturating_add(non_idle)))
}

#[cfg(target_os = "linux")]
fn read_linux_cpu_usage_percent() -> Option<f64> {
    let (first_idle, first_total) = read_linux_cpu_ticks()?;
    thread::sleep(Duration::from_millis(160));
    let (second_idle, second_total) = read_linux_cpu_ticks()?;

    let total_delta = second_total.saturating_sub(first_total);
    if total_delta == 0 {
        return None;
    }

    let idle_delta = second_idle.saturating_sub(first_idle);
    let used_delta = total_delta.saturating_sub(idle_delta);
    Some(clamp_percentage((used_delta as f64 / total_delta as f64) * 100.0))
}

#[cfg(target_os = "macos")]
fn read_linux_cpu_usage_percent() -> Option<f64> {
    let output = Command::new("top")
        .args(["-l", "2", "-n", "0", "-s", "0"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut cpu_idle: Option<f64> = None;
    let mut line_count = 0;
    for line in stdout.lines() {
        if line.starts_with("CPU usage:") {
            line_count += 1;
            if line_count == 2 {
                for part in line.split(',') {
                    let trimmed = part.trim();
                    if trimmed.ends_with("% idle") {
                        cpu_idle = trimmed
                            .trim_end_matches("% idle")
                            .trim()
                            .parse::<f64>()
                            .ok();
                        break;
                    }
                }
                break;
            }
        }
    }

    let idle = cpu_idle?;
    let usage = 100.0 - idle;
    Some(clamp_percentage(usage))
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn read_linux_cpu_usage_percent() -> Option<f64> {
    None
}

#[cfg(target_os = "linux")]
fn read_linux_ram_usage() -> Option<(u64, u64, f64)> {
    let meminfo = fs::read_to_string("/proc/meminfo").ok()?;
    let mut total_kib: Option<u64> = None;
    let mut available_kib: Option<u64> = None;

    for line in meminfo.lines() {
        if line.starts_with("MemTotal:") {
            total_kib = line
                .split_whitespace()
                .nth(1)
                .and_then(|value| value.parse::<u64>().ok());
        } else if line.starts_with("MemAvailable:") {
            available_kib = line
                .split_whitespace()
                .nth(1)
                .and_then(|value| value.parse::<u64>().ok());
        }

        if total_kib.is_some() && available_kib.is_some() {
            break;
        }
    }

    let total_bytes = total_kib?.saturating_mul(1024);
    let available_bytes = available_kib?.saturating_mul(1024);
    let used_bytes = total_bytes.saturating_sub(available_bytes);
    if total_bytes == 0 {
        return None;
    }

    let usage_percent = clamp_percentage((used_bytes as f64 / total_bytes as f64) * 100.0);
    Some((total_bytes, used_bytes, usage_percent))
}

#[cfg(target_os = "linux")]
fn read_linux_swap_usage() -> Option<(u64, u64, f64)> {
    let meminfo = fs::read_to_string("/proc/meminfo").ok()?;
    let mut total_kib: Option<u64> = None;
    let mut free_kib: Option<u64> = None;

    for line in meminfo.lines() {
        if line.starts_with("SwapTotal:") {
            total_kib = line
                .split_whitespace()
                .nth(1)
                .and_then(|value| value.parse::<u64>().ok());
        } else if line.starts_with("SwapFree:") {
            free_kib = line
                .split_whitespace()
                .nth(1)
                .and_then(|value| value.parse::<u64>().ok());
        }

        if total_kib.is_some() && free_kib.is_some() {
            break;
        }
    }

    let total_bytes = total_kib?.saturating_mul(1024);
    let free_bytes = free_kib?.saturating_mul(1024);
    if total_bytes == 0 {
        return Some((0, 0, 0.0));
    }

    let used_bytes = total_bytes.saturating_sub(free_bytes);
    let usage_percent = clamp_percentage((used_bytes as f64 / total_bytes as f64) * 100.0);
    Some((total_bytes, used_bytes, usage_percent))
}

#[cfg(target_os = "macos")]
fn read_linux_swap_usage() -> Option<(u64, u64, f64)> {
    let output = Command::new("sysctl")
        .args(["vm.swapusage"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut total_mb: Option<f64> = None;
    let mut used_mb: Option<f64> = None;

    for part in stdout.split_whitespace() {
        if let Some(value_str) = part.strip_suffix('M') {
            if total_mb.is_none() {
                total_mb = value_str.parse::<f64>().ok();
            } else if used_mb.is_none() {
                used_mb = value_str.parse::<f64>().ok();
                break;
            }
        }
    }

    let total_mb_val = total_mb?;
    let used_mb_val = used_mb?;
    let total_bytes = (total_mb_val * 1024.0 * 1024.0) as u64;
    let used_bytes = (used_mb_val * 1024.0 * 1024.0) as u64;

    if total_bytes == 0 {
        return Some((0, 0, 0.0));
    }

    let usage_percent = clamp_percentage((used_bytes as f64 / total_bytes as f64) * 100.0);
    Some((total_bytes, used_bytes, usage_percent))
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn read_linux_swap_usage() -> Option<(u64, u64, f64)> {
    None
}

#[cfg(target_os = "macos")]
fn read_linux_ram_usage() -> Option<(u64, u64, f64)> {
    let output = Command::new("vm_stat").output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut page_size: u64 = 4096;
    let mut pages_active: Option<u64> = None;
    let mut pages_inactive: Option<u64> = None;
    let mut pages_speculative: Option<u64> = None;
    let mut pages_wired: Option<u64> = None;
    let mut pages_compressed: Option<u64> = None;

    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("page size of ") {
            if let Some(size_str) = trimmed.strip_prefix("page size of ") {
                if let Some(size) = size_str.split_whitespace().next() {
                    page_size = size.parse::<u64>().unwrap_or(4096);
                }
            }
        } else if trimmed.starts_with("Pages active:") {
            pages_active = trimmed
                .split(':')
                .nth(1)?
                .trim()
                .trim_end_matches('.')
                .parse::<u64>()
                .ok();
        } else if trimmed.starts_with("Pages inactive:") {
            pages_inactive = trimmed
                .split(':')
                .nth(1)?
                .trim()
                .trim_end_matches('.')
                .parse::<u64>()
                .ok();
        } else if trimmed.starts_with("Pages speculative:") {
            pages_speculative = trimmed
                .split(':')
                .nth(1)?
                .trim()
                .trim_end_matches('.')
                .parse::<u64>()
                .ok();
        } else if trimmed.starts_with("Pages wired down:") {
            pages_wired = trimmed
                .split(':')
                .nth(1)?
                .trim()
                .trim_end_matches('.')
                .parse::<u64>()
                .ok();
        } else if trimmed.starts_with("Pages occupied by compressor:") {
            pages_compressed = trimmed
                .split(':')
                .nth(1)?
                .trim()
                .trim_end_matches('.')
                .parse::<u64>()
                .ok();
        }
    }

    let output_sysctl = Command::new("sysctl")
        .args(["hw.memsize"])
        .output()
        .ok()?;
    if !output_sysctl.status.success() {
        return None;
    }

    let sysctl_stdout = String::from_utf8_lossy(&output_sysctl.stdout);
    let total_bytes = sysctl_stdout
        .split(':')
        .nth(1)?
        .trim()
        .parse::<u64>()
        .ok()?;

    let active = pages_active.unwrap_or(0);
    let wired = pages_wired.unwrap_or(0);
    let compressed = pages_compressed.unwrap_or(0);
    let inactive = pages_inactive.unwrap_or(0);
    let speculative = pages_speculative.unwrap_or(0);

    let used_pages = active
        .saturating_add(wired)
        .saturating_add(compressed)
        .saturating_add(inactive.saturating_sub(speculative));
    let used_bytes = used_pages.saturating_mul(page_size);

    if total_bytes == 0 {
        return None;
    }

    let usage_percent = clamp_percentage((used_bytes as f64 / total_bytes as f64) * 100.0);
    Some((total_bytes, used_bytes, usage_percent))
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn read_linux_ram_usage() -> Option<(u64, u64, f64)> {
    None
}

#[cfg(target_os = "linux")]
fn read_linux_disk_usage(path: &Path) -> Option<(u64, u64, f64)> {
    let output = Command::new("df")
        .args(["-kP", &path.display().to_string()])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let data_line = stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .nth(1)?;
    let columns = data_line.split_whitespace().collect::<Vec<_>>();
    if columns.len() < 6 {
        return None;
    }

    let total_kib = columns.get(1)?.parse::<u64>().ok()?;
    let used_kib = columns.get(2)?.parse::<u64>().ok()?;
    let usage_percent = columns
        .get(4)?
        .trim_end_matches('%')
        .parse::<f64>()
        .ok()
        .map(clamp_percentage)
        .unwrap_or_else(|| {
            if total_kib == 0 {
                0.0
            } else {
                clamp_percentage((used_kib as f64 / total_kib as f64) * 100.0)
            }
        });

    Some((
        total_kib.saturating_mul(1024),
        used_kib.saturating_mul(1024),
        usage_percent,
    ))
}

#[cfg(target_os = "macos")]
fn read_linux_disk_usage(path: &Path) -> Option<(u64, u64, f64)> {
    let output = Command::new("df")
        .args(["-k", &path.display().to_string()])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let data_line = stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .nth(1)?;
    let columns = data_line.split_whitespace().collect::<Vec<_>>();
    if columns.len() < 5 {
        return None;
    }

    let total_kib = columns.get(1)?.parse::<u64>().ok()?;
    let used_kib = columns.get(2)?.parse::<u64>().ok()?;
    let usage_percent = columns
        .get(4)?
        .trim_end_matches('%')
        .parse::<f64>()
        .ok()
        .map(clamp_percentage)
        .unwrap_or_else(|| {
            if total_kib == 0 {
                0.0
            } else {
                clamp_percentage((used_kib as f64 / total_kib as f64) * 100.0)
            }
        });

    Some((
        total_kib.saturating_mul(1024),
        used_kib.saturating_mul(1024),
        usage_percent,
    ))
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn read_linux_disk_usage(_path: &Path) -> Option<(u64, u64, f64)> {
    None
}

fn collect_system_overview() -> DiagnosticsSystemOverview {
    let platform = std::env::consts::OS.to_string();
    let hostname = resolve_hostname();
    let cpu_cores = resolve_cpu_cores();
    let cpu_usage_percent = read_linux_cpu_usage_percent();

    let (ram_total_bytes, ram_used_bytes, ram_usage_percent) =
        if let Some((total, used, usage_percent)) = read_linux_ram_usage() {
            (Some(total), Some(used), Some(usage_percent))
        } else {
            (None, None, None)
        };

    let (swap_total_bytes, swap_used_bytes, swap_usage_percent) =
        if let Some((total, used, usage_percent)) = read_linux_swap_usage() {
            (Some(total), Some(used), Some(usage_percent))
        } else {
            (None, None, None)
        };

    let disk_target = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"));
    let (disk_total_bytes, disk_used_bytes, disk_usage_percent) =
        if let Some((total, used, usage_percent)) = read_linux_disk_usage(&disk_target) {
            (Some(total), Some(used), Some(usage_percent))
        } else {
            (None, None, None)
        };

    DiagnosticsSystemOverview {
        cpu_usage_percent,
        cpu_cores,
        ram_total_bytes,
        ram_used_bytes,
        ram_usage_percent,
        swap_total_bytes,
        swap_used_bytes,
        swap_usage_percent,
        disk_total_bytes,
        disk_used_bytes,
        disk_usage_percent,
        platform,
        hostname,
    }
}

