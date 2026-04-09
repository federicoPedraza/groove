fn list_process_snapshot_rows() -> Result<(Vec<ProcessSnapshotRow>, Option<String>), String> {
    use crate::backend::common::platform_env::{self, Platform};

    let raw = platform_env::list_process_snapshot_raw()?;

    let mut rows = Vec::new();
    match Platform::current() {
        Platform::Windows => {
            for line in raw.stdout.lines().map(str::trim).filter(|l| !l.is_empty()) {
                if line.starts_with("\"ProcessId\"") {
                    continue;
                }

                let columns = diagnostics::parse_basic_csv_line(line);
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
        }
        Platform::Linux | Platform::MacOS => {
            for raw_line in raw.stdout.lines() {
                let trimmed = raw_line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                let mut tokens = trimmed.split_whitespace();
                let Some(pid_token) = tokens.next() else { continue };
                let Some(ppid_token) = tokens.next() else { continue };
                let Some(process_name) = tokens.next() else { continue };

                let Some(pid) = pid_token.parse::<i32>().ok() else { continue };
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
        }
    }

    Ok((rows, raw.warning))
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

fn get_msot_consuming_programs_output() -> Result<String, String> {
    crate::backend::common::platform_env::top_memory_consumers()
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

fn read_linux_cpu_usage_percent() -> Option<f64> {
    crate::backend::common::platform_env::read_cpu_usage_percent()
}

fn read_linux_ram_usage() -> Option<(u64, u64, f64)> {
    crate::backend::common::platform_env::read_ram_usage()
}

fn read_linux_swap_usage() -> Option<(u64, u64, f64)> {
    crate::backend::common::platform_env::read_swap_usage()
}

fn read_linux_disk_usage(path: &Path) -> Option<(u64, u64, f64)> {
    crate::backend::common::platform_env::read_disk_usage(path)
}

fn collect_system_overview() -> DiagnosticsSystemOverview {
    let platform = crate::backend::common::platform_env::Platform::current().to_string();
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
