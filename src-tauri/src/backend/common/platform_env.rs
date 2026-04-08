use std::path::Path;
use std::process::Command;

// ---------------------------------------------------------------------------
// Platform identity
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum Platform {
    Linux,
    MacOS,
    Windows,
}

impl Platform {
    pub fn current() -> Self {
        #[cfg(target_os = "linux")]
        { Platform::Linux }
        #[cfg(target_os = "macos")]
        { Platform::MacOS }
        #[cfg(target_os = "windows")]
        { Platform::Windows }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Platform::Linux => "linux",
            Platform::MacOS => "macos",
            Platform::Windows => "windows",
        }
    }
}

impl std::fmt::Display for Platform {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

// ---------------------------------------------------------------------------
// 1. Open URL in default browser
// ---------------------------------------------------------------------------

pub fn open_url_in_browser(url: &str, cwd: &Path) -> Result<(), String> {
    let (program, args) = match Platform::current() {
        Platform::Linux => ("xdg-open", vec![url.to_string()]),
        Platform::MacOS => ("open", vec![url.to_string()]),
        Platform::Windows => (
            "cmd",
            vec![
                "/C".to_string(),
                "start".to_string(),
                String::new(),
                url.to_string(),
            ],
        ),
    };

    Command::new(program)
        .args(&args)
        .current_dir(cwd)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to open URL with {program}: {error}"))
}

// ---------------------------------------------------------------------------
// 2. Process termination
// ---------------------------------------------------------------------------

pub struct KillResult {
    pub success: bool,
    pub stderr: String,
}

/// Send a graceful termination signal to a process (SIGTERM / taskkill).
pub fn kill_process_graceful(pid: i32) -> Result<KillResult, String> {
    match Platform::current() {
        Platform::Linux | Platform::MacOS => kill_unix("-TERM", &pid.to_string()),
        Platform::Windows => run_taskkill(&["/PID", &pid.to_string(), "/T"]),
    }
}

/// Send a forceful termination signal (SIGKILL / taskkill /F).
pub fn kill_process_force(pid: i32) -> Result<KillResult, String> {
    match Platform::current() {
        Platform::Linux | Platform::MacOS => kill_unix("-KILL", &pid.to_string()),
        Platform::Windows => run_taskkill(&["/F", "/PID", &pid.to_string(), "/T"]),
    }
}

/// Send an arbitrary signal on Unix. On Windows this is a no-op that returns success.
pub fn kill_signal(signal: &str, target: &str) -> Result<KillResult, String> {
    match Platform::current() {
        Platform::Linux | Platform::MacOS => kill_unix(signal, target),
        Platform::Windows => Ok(KillResult {
            success: true,
            stderr: String::new(),
        }),
    }
}

fn kill_unix(signal: &str, target: &str) -> Result<KillResult, String> {
    let output = Command::new("kill")
        .args([signal, "--", target])
        .output()
        .map_err(|error| format!("Failed to execute kill {signal} for {target}: {error}"))?;
    Ok(KillResult {
        success: output.status.success(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

fn run_taskkill(args: &[&str]) -> Result<KillResult, String> {
    let output = Command::new("taskkill")
        .args(args)
        .output()
        .map_err(|error| format!("Failed to execute taskkill: {error}"))?;
    Ok(KillResult {
        success: output.status.success(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

// ---------------------------------------------------------------------------
// 3. Process snapshot listing
// ---------------------------------------------------------------------------

pub struct ProcessSnapshotOutput {
    pub stdout: String,
    pub warning: Option<String>,
}

/// Run the platform-specific process listing command and return raw stdout.
pub fn list_process_snapshot_raw() -> Result<ProcessSnapshotOutput, String> {
    match Platform::current() {
        Platform::Windows => list_process_snapshot_windows(),
        Platform::Linux | Platform::MacOS => list_process_snapshot_unix(),
    }
}

fn list_process_snapshot_unix() -> Result<ProcessSnapshotOutput, String> {
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

    Ok(ProcessSnapshotOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        warning: None,
    })
}

fn list_process_snapshot_windows() -> Result<ProcessSnapshotOutput, String> {
    let command = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Csv -NoTypeInformation";
    let stdout = run_powershell_query(command)?;

    Ok(ProcessSnapshotOutput {
        stdout,
        warning: Some(
            "Using PowerShell process snapshots for best-effort detection on Windows.".to_string(),
        ),
    })
}

// ---------------------------------------------------------------------------
// 4. Memory-consuming programs
// ---------------------------------------------------------------------------

pub fn top_memory_consumers() -> Result<String, String> {
    match Platform::current() {
        Platform::Linux | Platform::MacOS => {
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
        Platform::Windows => top_memory_consumers_windows(),
    }
}

fn top_memory_consumers_windows() -> Result<String, String> {
    let command = r#"Get-Process | Group-Object -Property ProcessName | ForEach-Object { $name = $_.Name; $mem = ($_.Group | Measure-Object WorkingSet64 -Sum).Sum; [PSCustomObject]@{Name=$name;MB=[math]::Round($mem/1MB,1)} } | Sort-Object MB -Descending | Select-Object -First 10 | ForEach-Object { '{0,-25} {1} MB' -f $_.Name,$_.MB }"#;
    run_powershell_query(command)
}

// ---------------------------------------------------------------------------
// 5. CPU usage
// ---------------------------------------------------------------------------

pub fn read_cpu_usage_percent() -> Option<f64> {
    match Platform::current() {
        Platform::Linux => read_cpu_usage_linux(),
        Platform::MacOS => read_cpu_usage_macos(),
        Platform::Windows => read_cpu_usage_windows(),
    }
}

fn read_cpu_usage_linux() -> Option<f64> {
    use std::fs;
    use std::thread;
    use std::time::Duration;

    fn read_ticks() -> Option<(u64, u64)> {
        let stat = fs::read_to_string("/proc/stat").ok()?;
        let first_line = stat.lines().next()?;
        let mut tokens = first_line.split_whitespace();
        if tokens.next()? != "cpu" {
            return None;
        }

        let user = tokens.next()?.parse::<u64>().ok()?;
        let nice = tokens.next()?.parse::<u64>().ok()?;
        let system = tokens.next()?.parse::<u64>().ok()?;
        let idle = tokens.next()?.parse::<u64>().ok()?;
        let iowait = tokens.next().and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
        let irq = tokens.next().and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
        let softirq = tokens.next().and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
        let steal = tokens.next().and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);

        let idle_all = idle.saturating_add(iowait);
        let non_idle = user
            .saturating_add(nice)
            .saturating_add(system)
            .saturating_add(irq)
            .saturating_add(softirq)
            .saturating_add(steal);

        Some((idle_all, idle_all.saturating_add(non_idle)))
    }

    let (first_idle, first_total) = read_ticks()?;
    thread::sleep(Duration::from_millis(160));
    let (second_idle, second_total) = read_ticks()?;

    let total_delta = second_total.saturating_sub(first_total);
    if total_delta == 0 {
        return None;
    }

    let idle_delta = second_idle.saturating_sub(first_idle);
    let used_delta = total_delta.saturating_sub(idle_delta);
    Some(clamp_percentage((used_delta as f64 / total_delta as f64) * 100.0))
}

fn read_cpu_usage_macos() -> Option<f64> {
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
    Some(clamp_percentage(100.0 - idle))
}

fn read_cpu_usage_windows() -> Option<f64> {
    let command = r#"(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average"#;
    let stdout = run_powershell_query(command).ok()?;
    let value = stdout.trim().parse::<f64>().ok()?;
    Some(clamp_percentage(value))
}

// ---------------------------------------------------------------------------
// 6. RAM usage  →  (total_bytes, used_bytes, usage_percent)
// ---------------------------------------------------------------------------

pub fn read_ram_usage() -> Option<(u64, u64, f64)> {
    match Platform::current() {
        Platform::Linux => read_ram_linux(),
        Platform::MacOS => read_ram_macos(),
        Platform::Windows => read_ram_windows(),
    }
}

fn read_ram_linux() -> Option<(u64, u64, f64)> {
    use std::fs;

    let meminfo = fs::read_to_string("/proc/meminfo").ok()?;
    let mut total_kib: Option<u64> = None;
    let mut available_kib: Option<u64> = None;

    for line in meminfo.lines() {
        if line.starts_with("MemTotal:") {
            total_kib = line.split_whitespace().nth(1).and_then(|v| v.parse::<u64>().ok());
        } else if line.starts_with("MemAvailable:") {
            available_kib = line.split_whitespace().nth(1).and_then(|v| v.parse::<u64>().ok());
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

    Some((total_bytes, used_bytes, clamp_percentage((used_bytes as f64 / total_bytes as f64) * 100.0)))
}

fn read_ram_macos() -> Option<(u64, u64, f64)> {
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
            pages_active = parse_vm_stat_value(trimmed);
        } else if trimmed.starts_with("Pages inactive:") {
            pages_inactive = parse_vm_stat_value(trimmed);
        } else if trimmed.starts_with("Pages speculative:") {
            pages_speculative = parse_vm_stat_value(trimmed);
        } else if trimmed.starts_with("Pages wired down:") {
            pages_wired = parse_vm_stat_value(trimmed);
        } else if trimmed.starts_with("Pages occupied by compressor:") {
            pages_compressed = parse_vm_stat_value(trimmed);
        }
    }

    let output_sysctl = Command::new("sysctl").args(["hw.memsize"]).output().ok()?;
    if !output_sysctl.status.success() {
        return None;
    }

    let sysctl_stdout = String::from_utf8_lossy(&output_sysctl.stdout);
    let total_bytes = sysctl_stdout.split(':').nth(1)?.trim().parse::<u64>().ok()?;

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

    Some((total_bytes, used_bytes, clamp_percentage((used_bytes as f64 / total_bytes as f64) * 100.0)))
}

fn parse_vm_stat_value(line: &str) -> Option<u64> {
    line.split(':').nth(1)?.trim().trim_end_matches('.').parse::<u64>().ok()
}

fn read_ram_windows() -> Option<(u64, u64, f64)> {
    let command = r#"$os = Get-CimInstance Win32_OperatingSystem; '{0} {1}' -f $os.TotalVisibleMemorySize,$os.FreePhysicalMemory"#;
    let stdout = run_powershell_query(command).ok()?;
    let mut parts = stdout.trim().split_whitespace();
    let total_kib = parts.next()?.parse::<u64>().ok()?;
    let free_kib = parts.next()?.parse::<u64>().ok()?;

    let total_bytes = total_kib.saturating_mul(1024);
    let free_bytes = free_kib.saturating_mul(1024);
    let used_bytes = total_bytes.saturating_sub(free_bytes);
    if total_bytes == 0 {
        return None;
    }

    Some((total_bytes, used_bytes, clamp_percentage((used_bytes as f64 / total_bytes as f64) * 100.0)))
}

// ---------------------------------------------------------------------------
// 7. Swap usage  →  (total_bytes, used_bytes, usage_percent)
// ---------------------------------------------------------------------------

pub fn read_swap_usage() -> Option<(u64, u64, f64)> {
    match Platform::current() {
        Platform::Linux => read_swap_linux(),
        Platform::MacOS => read_swap_macos(),
        Platform::Windows => read_swap_windows(),
    }
}

fn read_swap_linux() -> Option<(u64, u64, f64)> {
    use std::fs;

    let meminfo = fs::read_to_string("/proc/meminfo").ok()?;
    let mut total_kib: Option<u64> = None;
    let mut free_kib: Option<u64> = None;

    for line in meminfo.lines() {
        if line.starts_with("SwapTotal:") {
            total_kib = line.split_whitespace().nth(1).and_then(|v| v.parse::<u64>().ok());
        } else if line.starts_with("SwapFree:") {
            free_kib = line.split_whitespace().nth(1).and_then(|v| v.parse::<u64>().ok());
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
    Some((total_bytes, used_bytes, clamp_percentage((used_bytes as f64 / total_bytes as f64) * 100.0)))
}

fn read_swap_macos() -> Option<(u64, u64, f64)> {
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

    let total_bytes = (total_mb? * 1024.0 * 1024.0) as u64;
    let used_bytes = (used_mb? * 1024.0 * 1024.0) as u64;

    if total_bytes == 0 {
        return Some((0, 0, 0.0));
    }

    Some((total_bytes, used_bytes, clamp_percentage((used_bytes as f64 / total_bytes as f64) * 100.0)))
}

fn read_swap_windows() -> Option<(u64, u64, f64)> {
    let command = r#"$pf = Get-CimInstance Win32_PageFileUsage; if ($pf) { '{0} {1}' -f ($pf.AllocatedBaseSize | Measure-Object -Sum).Sum,($pf.CurrentUsage | Measure-Object -Sum).Sum } else { '0 0' }"#;
    let stdout = run_powershell_query(command).ok()?;
    let mut parts = stdout.trim().split_whitespace();
    let total_mb = parts.next()?.parse::<u64>().ok()?;
    let used_mb = parts.next()?.parse::<u64>().ok()?;

    let total_bytes = total_mb.saturating_mul(1024 * 1024);
    let used_bytes = used_mb.saturating_mul(1024 * 1024);

    if total_bytes == 0 {
        return Some((0, 0, 0.0));
    }

    Some((total_bytes, used_bytes, clamp_percentage((used_bytes as f64 / total_bytes as f64) * 100.0)))
}

// ---------------------------------------------------------------------------
// 8. Disk usage  →  (total_bytes, used_bytes, usage_percent)
// ---------------------------------------------------------------------------

pub fn read_disk_usage(path: &Path) -> Option<(u64, u64, f64)> {
    match Platform::current() {
        Platform::Linux => read_disk_usage_df(path, &["-kP"]),
        Platform::MacOS => read_disk_usage_df(path, &["-k"]),
        Platform::Windows => read_disk_usage_windows(path),
    }
}

fn read_disk_usage_df(path: &Path, flags: &[&str]) -> Option<(u64, u64, f64)> {
    let mut args: Vec<String> = flags.iter().map(|f| f.to_string()).collect();
    args.push(path.display().to_string());
    let str_args: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    let output = Command::new("df").args(&str_args).output().ok()?;
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

fn read_disk_usage_windows(path: &Path) -> Option<(u64, u64, f64)> {
    let drive = path.components().next()?.as_os_str().to_str()?;
    let drive_letter = drive.trim_end_matches('\\');
    let command = format!(
        r#"$d = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='{drive_letter}'"; if ($d) {{ '{{0}} {{1}}' -f $d.Size,$d.FreeSpace }} else {{ '' }}"#
    );
    let stdout = run_powershell_query(&command).ok()?;
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut parts = trimmed.split_whitespace();
    let total_bytes = parts.next()?.parse::<u64>().ok()?;
    let free_bytes = parts.next()?.parse::<u64>().ok()?;

    if total_bytes == 0 {
        return None;
    }

    let used_bytes = total_bytes.saturating_sub(free_bytes);
    Some((total_bytes, used_bytes, clamp_percentage((used_bytes as f64 / total_bytes as f64) * 100.0)))
}

// ---------------------------------------------------------------------------
// 9. Resolve default shell / terminal command
// ---------------------------------------------------------------------------

pub fn resolve_shell_command() -> (String, Vec<String>) {
    match Platform::current() {
        Platform::Windows => {
            let program = std::env::var("COMSPEC")
                .ok()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .unwrap_or_else(|| "cmd.exe".to_string());
            (program, Vec::new())
        }
        Platform::Linux | Platform::MacOS => {
            let program = std::env::var("SHELL")
                .ok()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .unwrap_or_else(|| "/bin/bash".to_string());
            (program, Vec::new())
        }
    }
}

// ---------------------------------------------------------------------------
// 10. Default terminal candidates for auto-detect
// ---------------------------------------------------------------------------

pub fn platform_default_terminal_candidate(worktree: &str) -> Option<(String, Vec<String>)> {
    match Platform::current() {
        Platform::MacOS => Some((
            "open".to_string(),
            vec!["-a".to_string(), "Terminal".to_string(), worktree.to_string()],
        )),
        Platform::Windows => Some((
            "cmd".to_string(),
            vec![
                "/C".to_string(),
                "start".to_string(),
                String::new(),
                "cmd".to_string(),
            ],
        )),
        Platform::Linux => None,
    }
}

// ---------------------------------------------------------------------------
// 11. Symlink creation
// ---------------------------------------------------------------------------

pub fn create_symlink(source: &Path, destination: &Path) -> Result<(), std::io::Error> {
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(source, destination)
    }

    #[cfg(windows)]
    {
        if source.is_dir() {
            std::os::windows::fs::symlink_dir(source, destination)
        } else {
            std::os::windows::fs::symlink_file(source, destination)
        }
    }
}

// ---------------------------------------------------------------------------
// 12. Terminfo probe
// ---------------------------------------------------------------------------

pub fn probe_term_clear(term_value: &str) -> Result<(), String> {
    match Platform::current() {
        Platform::Windows => Ok(()),
        Platform::Linux | Platform::MacOS => {
            let output = Command::new("tput")
                .arg("clear")
                .env("TERM", term_value)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .output()
                .map_err(|error| format!("terminfo_probe_failed:{error}"))?;

            if output.status.success() {
                return Ok(());
            }

            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            if stderr.is_empty() {
                Err("terminfo_missing".to_string())
            } else {
                Err(format!("terminfo_missing:{stderr}"))
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 13. Sidecar binary names
// ---------------------------------------------------------------------------

pub fn groove_sidecar_binary_names() -> Vec<String> {
    let mut names = vec!["groove".to_string()];

    #[cfg(target_os = "linux")]
    {
        names.push("groove-x86_64-unknown-linux-gnu".to_string());
        names.push("groove-aarch64-unknown-linux-gnu".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        #[cfg(target_arch = "aarch64")]
        {
            names.push("groove-aarch64-apple-darwin".to_string());
            names.push("groove-x86_64-apple-darwin".to_string());
        }
        #[cfg(target_arch = "x86_64")]
        {
            names.push("groove-x86_64-apple-darwin".to_string());
            names.push("groove-aarch64-apple-darwin".to_string());
        }
        #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
        {
            names.push("groove-aarch64-apple-darwin".to_string());
            names.push("groove-x86_64-apple-darwin".to_string());
        }
    }
    #[cfg(target_os = "windows")]
    {
        names.push("groove-x86_64-pc-windows-msvc.exe".to_string());
        names.push("groove-aarch64-pc-windows-msvc.exe".to_string());
        names.push("groove.exe".to_string());
    }

    names
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

fn clamp_percentage(value: f64) -> f64 {
    value.clamp(0.0, 100.0)
}

fn run_powershell_query(command: &str) -> Result<String, String> {
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", command])
        .output()
        .or_else(|_| {
            Command::new("pwsh")
                .args(["-NoProfile", "-Command", command])
                .output()
        })
        .map_err(|error| format!("Failed to execute PowerShell: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "PowerShell query failed.".to_string()
        } else {
            format!("PowerShell query failed: {stderr}")
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
