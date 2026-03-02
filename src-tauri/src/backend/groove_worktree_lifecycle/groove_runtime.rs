fn run_command(binary: &Path, args: &[String], cwd: &Path) -> CommandResult {
    let output = Command::new(binary).args(args).current_dir(cwd).output();

    match output {
        Ok(output) => CommandResult {
            exit_code: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            error: None,
        },
        Err(error) => CommandResult {
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error: Some(format!("Failed to execute {}: {}", binary.display(), error)),
        },
    }
}

fn run_command_timeout(
    binary: &Path,
    args: &[String],
    cwd: &Path,
    timeout: Duration,
    port: Option<u16>,
) -> CommandResult {
    let mut command = Command::new(binary);
    command.args(args).current_dir(cwd);
    if let Some(port) = port {
        command.env("PORT", port.to_string());
    }

    run_command_with_timeout(
        command,
        timeout,
        format!("Failed to execute {}", binary.display()),
        format!("{}", binary.display()),
    )
}

fn allocate_testing_port(candidate_ports: &[u16], used_ports: &HashSet<u16>) -> Result<u16, String> {
    for port in candidate_ports {
        if used_ports.contains(port) {
            continue;
        }

        if std::net::TcpListener::bind(("127.0.0.1", *port)).is_ok() {
            return Ok(*port);
        }
    }

    Err(format!(
        "Failed to allocate testing environment port: ports {} are all in use.",
        candidate_ports
            .iter()
            .map(u16::to_string)
            .collect::<Vec<_>>()
            .join(", ")
    ))
}

fn parse_opencode_segment(value: &str) -> (String, Option<String>) {
    let normalized = value.trim().to_lowercase();
    let instance_id = value
        .split_whitespace()
        .find_map(|segment| segment.strip_prefix("instance="))
        .map(|v| v.to_string());

    if normalized.starts_with("running") {
        return ("running".to_string(), instance_id);
    }

    if normalized.contains("not-running")
        || normalized.contains("not running")
        || normalized.starts_with("stopped")
    {
        return ("not-running".to_string(), instance_id);
    }

    ("unknown".to_string(), instance_id)
}

fn parse_log_segment(value: &str) -> (String, Option<String>) {
    let normalized = value.trim();
    if let Some(target) = normalized.strip_prefix("latest->") {
        let name = Path::new(target.trim())
            .file_name()
            .map(|v| v.to_string_lossy().to_string());
        return ("latest".to_string(), name);
    }

    if let Some(target) = normalized
        .strip_prefix("broken-latest->")
        .or_else(|| normalized.strip_prefix("brokenlatest->"))
    {
        let name = Path::new(target.trim())
            .file_name()
            .map(|v| v.to_string_lossy().to_string());
        return ("broken-latest".to_string(), name);
    }

    if normalized.starts_with("none") {
        return ("none".to_string(), None);
    }

    ("unknown".to_string(), None)
}

fn parse_activity_segment(value: &str) -> (String, Option<OpencodeActivityDetail>) {
    let normalized = value.trim();
    if normalized.is_empty() {
        return ("unknown".to_string(), None);
    }

    let mut tokens = normalized.split_whitespace();
    let raw_state = tokens.next().unwrap_or("unknown").to_lowercase();
    let state = match raw_state.as_str() {
        "thinking" | "idle" | "finished" | "error" | "unknown" => raw_state,
        _ => "unknown".to_string(),
    };

    let mut reason = None;
    let mut age_s = None;
    let mut marker = None;
    let mut log = None;

    for token in tokens {
        let Some((key, raw_value)) = token.split_once('=') else {
            continue;
        };

        let value = raw_value.trim();
        if value.is_empty() || value == "na" {
            continue;
        }

        match key {
            "reason" => reason = Some(value.to_string()),
            "age_s" => {
                if let Ok(parsed) = value.parse::<u64>() {
                    age_s = Some(parsed);
                }
            }
            "marker" => marker = Some(value.to_string()),
            "log" => log = Some(value.to_string()),
            _ => {}
        }
    }

    let detail = if reason.is_some() || age_s.is_some() || marker.is_some() || log.is_some() {
        Some(OpencodeActivityDetail {
            reason,
            age_s,
            marker,
            log,
        })
    } else {
        None
    };

    (state, detail)
}

fn parse_worktree_header(
    value: &str,
    known_worktrees: &HashSet<String>,
) -> Option<(String, String)> {
    let trimmed = value.trim();
    if !trimmed.starts_with("- ") {
        return None;
    }

    let body = trimmed.trim_start_matches("- ").trim();
    let left_paren = body.rfind('(')?;
    let right_paren = body.rfind(')')?;
    if right_paren <= left_paren {
        return None;
    }

    let first = body[..left_paren].trim();
    let second = body[left_paren + 1..right_paren].trim();
    if first.is_empty() || second.is_empty() {
        return None;
    }

    let first_known = known_worktrees.contains(first);
    let second_known = known_worktrees.contains(second);
    if first_known && !second_known {
        return Some((first.to_string(), second.to_string()));
    }
    if second_known && !first_known {
        return Some((second.to_string(), first.to_string()));
    }

    let first_branch_like = first.contains('/');
    let second_branch_like = second.contains('/');
    if first_branch_like && !second_branch_like {
        return Some((second.to_string(), first.to_string()));
    }
    if second_branch_like && !first_branch_like {
        return Some((first.to_string(), second.to_string()));
    }

    Some((second.to_string(), first.to_string()))
}

fn parse_groove_list_output(
    stdout: &str,
    known_worktrees: &[String],
) -> HashMap<String, RuntimeStateRow> {
    let mut rows = HashMap::new();
    let known_set = known_worktrees.iter().cloned().collect::<HashSet<_>>();

    for raw in stdout.lines() {
        let line = raw.trim();
        if !line.starts_with("- ") {
            continue;
        }

        let segments = line.split('|').map(|v| v.trim()).collect::<Vec<_>>();
        if segments.is_empty() {
            continue;
        }

        let Some((worktree, branch)) = parse_worktree_header(segments[0], &known_set) else {
            continue;
        };

        let mut opencode_state = "unknown".to_string();
        let mut opencode_instance_id = None;
        let mut log_state = "unknown".to_string();
        let mut log_target = None;
        let mut opencode_activity_state = "unknown".to_string();
        let mut opencode_activity_detail = None;

        for segment in segments.into_iter().skip(1) {
            let Some((key, value)) = segment.split_once(':') else {
                continue;
            };

            let key = key.trim().to_lowercase();
            let value = value.trim();
            if key == "opencode" {
                let (state, instance) = parse_opencode_segment(value);
                opencode_state = state;
                opencode_instance_id = instance;
            }
            if key == "log" {
                let (state, target) = parse_log_segment(value);
                log_state = state;
                log_target = target;
            }
            if key == "activity" {
                let (state, detail) = parse_activity_segment(value);
                opencode_activity_state = state;
                opencode_activity_detail = detail;
            }
        }

        rows.insert(
            worktree.clone(),
            RuntimeStateRow {
                branch,
                worktree,
                opencode_state,
                opencode_instance_id,
                log_state,
                log_target,
                opencode_activity_state,
                opencode_activity_detail,
            },
        );
    }

    rows
}

#[derive(Debug)]
struct NativeGrooveListCollection {
    rows: HashMap<String, RuntimeStateRow>,
    cache: GrooveListNativeCache,
    reused_worktrees: usize,
    recomputed_worktrees: usize,
    warning: Option<String>,
}

#[derive(Debug, Default)]
struct GrooveListTerminalIntegration {
    session_count: usize,
    workspace_session_count: usize,
    injected_worktrees: Vec<String>,
    integration_error: Option<String>,
}

#[derive(Debug)]
struct NativeLogSignals {
    log_state: String,
    log_target: Option<String>,
    latest_log_path: Option<PathBuf>,
    latest_log_mtime_ms: u128,
}

fn groove_list_native_enabled() -> bool {
    std::env::var("GROOVE_LIST_NATIVE")
        .map(|value| value.trim() != "0")
        .unwrap_or(true)
}

fn resolve_groove_list_worktrees(
    workspace_root: &Path,
    known_worktrees: &[String],
    dir: &Option<String>,
) -> Result<Vec<(String, PathBuf)>, String> {
    let worktrees_dir = workspace_root.join(dir.as_deref().unwrap_or(".worktrees"));
    if !path_is_directory(&worktrees_dir) {
        return Ok(Vec::new());
    }

    if !known_worktrees.is_empty() {
        let mut rows = known_worktrees
            .iter()
            .map(|worktree| (worktree.clone(), worktrees_dir.join(worktree)))
            .filter(|(_, path)| path_is_directory(path))
            .collect::<Vec<_>>();
        rows.sort_by(|left, right| left.0.cmp(&right.0));
        return Ok(rows);
    }

    let entries = fs::read_dir(&worktrees_dir)
        .map_err(|error| format!("Failed to read {}: {error}", worktrees_dir.display()))?;
    let mut rows = Vec::<(String, PathBuf)>::new();
    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "Failed to enumerate {} entries: {error}",
                worktrees_dir.display()
            )
        })?;
        let path = entry.path();
        if !path_is_directory(&path) {
            continue;
        }
        let Some(name) = path.file_name().map(|value| value.to_string_lossy().to_string()) else {
            continue;
        };
        rows.push((name, path));
    }

    rows.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(rows)
}

fn is_path_prefix_boundary_char(value: Option<char>) -> bool {
    match value {
        None => true,
        Some(character) => {
            character.is_whitespace()
                || matches!(character, '"' | '\'' | '`' | '=' | ':' | '(' | '[' | '{' | ',')
        }
    }
}

fn is_path_suffix_boundary_char(value: Option<char>) -> bool {
    match value {
        None => true,
        Some(character) => {
            character.is_whitespace()
                || matches!(character, '/' | '\\' | '"' | '\'' | '`' | ',' | ';' | ')' | ']' | '}')
        }
    }
}

fn command_contains_path_with_boundaries(command: &str, candidate: &str) -> bool {
    if candidate.is_empty() {
        return false;
    }

    for (start, _) in command.match_indices(candidate) {
        let before = command[..start].chars().next_back();
        let after = command[start + candidate.len()..].chars().next();
        if is_path_prefix_boundary_char(before) && is_path_suffix_boundary_char(after) {
            return true;
        }
    }

    false
}

fn command_contains_path_with_suffix_boundary(command: &str, candidate: &str) -> bool {
    if candidate.is_empty() {
        return false;
    }

    for (start, _) in command.match_indices(candidate) {
        let after = command[start + candidate.len()..].chars().next();
        if is_path_suffix_boundary_char(after) {
            return true;
        }
    }

    false
}

fn command_mentions_worktree_path(command: &str, worktree_path: &Path) -> bool {
    let normalized_command = command.replace('\\', "/").to_lowercase();
    let rendered = worktree_path.display().to_string().replace('\\', "/");
    let normalized_path = rendered.to_lowercase();
    let candidate = normalized_path.trim_end_matches('/');

    command_contains_path_with_boundaries(&normalized_command, candidate)
}

fn command_mentions_worktree_name(command: &str, worktree_path: &Path) -> bool {
    let Some(worktree_name) = worktree_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
    else {
        return false;
    };

    let normalized_command = command.replace('\\', "/").to_lowercase();
    let normalized_worktree_name = worktree_name.to_lowercase();

    ["/.worktree/", "/.worktrees/"]
        .into_iter()
        .map(|prefix| format!("{prefix}{normalized_worktree_name}"))
        .any(|candidate| command_contains_path_with_suffix_boundary(&normalized_command, &candidate))
}

fn resolve_opencode_pid_for_worktree(
    snapshot_rows: &[ProcessSnapshotRow],
    worktree_path: &Path,
) -> Option<i32> {
    snapshot_rows
        .iter()
        .filter(|row| {
            is_opencode_process(row.process_name.as_deref(), &row.command)
                && (command_mentions_worktree_path(&row.command, worktree_path)
                    || command_mentions_worktree_name(&row.command, worktree_path))
        })
        .map(|row| row.pid)
        .min()
}

fn resolve_latest_log_path_for_worktree(worktree_path: &Path) -> Option<PathBuf> {
    let log_dir = worktree_path.join(".groove").join("logs");
    let latest_link = log_dir.join("latest.log");

    if let Ok(metadata) = fs::symlink_metadata(&latest_link) {
        if metadata.file_type().is_symlink() && latest_link.exists() {
            if let Ok(target) = fs::read_link(&latest_link) {
                let resolved = if target.is_absolute() {
                    target
                } else {
                    log_dir.join(target)
                };
                if path_is_file(&resolved) {
                    return Some(resolved);
                }
            }
        }
    }

    let Ok(entries) = fs::read_dir(&log_dir) else {
        return None;
    };

    let mut newest: Option<(u128, PathBuf)> = None;
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if !path_is_file(&path) {
            continue;
        }

        let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !file_name.starts_with("opencode-") || !file_name.ends_with(".log") {
            continue;
        }

        let modified_ms = fs::metadata(&path)
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis())
            .unwrap_or(0);

        if newest
            .as_ref()
            .map(|(current, _)| modified_ms > *current)
            .unwrap_or(true)
        {
            newest = Some((modified_ms, path));
        }
    }

    newest.map(|(_, path)| path)
}

fn collect_native_log_signals(worktree_path: &Path) -> NativeLogSignals {
    let latest_link = worktree_path
        .join(".groove")
        .join("logs")
        .join("latest.log");

    if let Ok(metadata) = fs::symlink_metadata(&latest_link) {
        if metadata.file_type().is_symlink() {
            if latest_link.exists() {
                let target = fs::read_link(&latest_link)
                    .ok()
                    .and_then(|path| path.file_name().map(|value| value.to_string_lossy().to_string()))
                    .or_else(|| Some("latest.log".to_string()));
                let latest_log_path = resolve_latest_log_path_for_worktree(worktree_path);
                let latest_log_mtime_ms = latest_log_path
                    .as_ref()
                    .and_then(|path| fs::metadata(path).ok())
                    .and_then(|metadata| metadata.modified().ok())
                    .and_then(|ts| ts.duration_since(UNIX_EPOCH).ok())
                    .map(|duration| duration.as_millis())
                    .unwrap_or(0);
                return NativeLogSignals {
                    log_state: "latest".to_string(),
                    log_target: target,
                    latest_log_path,
                    latest_log_mtime_ms,
                };
            }

            return NativeLogSignals {
                log_state: "broken-latest".to_string(),
                log_target: None,
                latest_log_path: None,
                latest_log_mtime_ms: 0,
            };
        }
    }

    let latest_log_path = resolve_latest_log_path_for_worktree(worktree_path);
    let latest_log_mtime_ms = latest_log_path
        .as_ref()
        .and_then(|path| fs::metadata(path).ok())
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|ts| ts.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or(0);

    NativeLogSignals {
        log_state: "none".to_string(),
        log_target: None,
        latest_log_path,
        latest_log_mtime_ms,
    }
}

fn build_native_activity_state(
    opencode_state: &str,
    log_state: &str,
    latest_log_path: Option<&Path>,
) -> (String, Option<OpencodeActivityDetail>) {
    if log_state == "broken-latest" {
        return (
            "error".to_string(),
            Some(OpencodeActivityDetail {
                reason: Some("broken-latest".to_string()),
                age_s: None,
                marker: Some("broken-symlink".to_string()),
                log: Some("latest.log".to_string()),
            }),
        );
    }

    let age_s = latest_log_path
        .and_then(|path| fs::metadata(path).ok())
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.elapsed().ok())
        .map(|elapsed| elapsed.as_secs());
    let log_name = latest_log_path
        .and_then(|path| path.file_name())
        .map(|value| value.to_string_lossy().to_string());

    let (state, reason) = if opencode_state == "running" {
        if let Some(age_s) = age_s {
            if age_s <= 120 {
                ("thinking", "running-log-fresh")
            } else {
                ("idle", "running-log-stale")
            }
        } else {
            ("idle", "running-no-log-age")
        }
    } else if opencode_state == "not-running" {
        if latest_log_path.is_some() {
            ("finished", "process-exited-log-present")
        } else {
            ("unknown", "process-exited-no-log")
        }
    } else {
        ("unknown", "insufficient-signals")
    };

    (
        state.to_string(),
        Some(OpencodeActivityDetail {
            reason: Some(reason.to_string()),
            age_s,
            marker: None,
            log: log_name,
        }),
    )
}

fn build_native_worktree_signature(
    worktree_path: &Path,
    opencode_pid: Option<i32>,
    log_signals: &NativeLogSignals,
) -> String {
    let worktree_snapshot = snapshot_entry(worktree_path);
    let groove_snapshot = snapshot_entry(&worktree_path.join(".groove"));
    let logs_snapshot = snapshot_entry(&worktree_path.join(".groove").join("logs"));
    let latest_snapshot = snapshot_entry(&worktree_path.join(".groove").join("logs").join("latest.log"));
    let git_head_snapshot = snapshot_entry(&worktree_path.join(".git"));

    format!(
        "worktree={}:{}|groove={}:{}|logs={}:{}|latest={}:{}|head={}:{}|opencode_pid={}|log_state={}|log_target={}|latest_mtime={}",
        worktree_snapshot.exists,
        worktree_snapshot.mtime_ms,
        groove_snapshot.exists,
        groove_snapshot.mtime_ms,
        logs_snapshot.exists,
        logs_snapshot.mtime_ms,
        latest_snapshot.exists,
        latest_snapshot.mtime_ms,
        git_head_snapshot.exists,
        git_head_snapshot.mtime_ms,
        opencode_pid.map(|value| value.to_string()).unwrap_or_default(),
        log_signals.log_state,
        log_signals.log_target.clone().unwrap_or_default(),
        log_signals.latest_log_mtime_ms,
    )
}

fn collect_groove_list_rows_native(
    workspace_root: &Path,
    known_worktrees: &[String],
    dir: &Option<String>,
    previous_cache: Option<&GrooveListNativeCache>,
) -> Result<NativeGrooveListCollection, String> {
    let worktrees = resolve_groove_list_worktrees(workspace_root, known_worktrees, dir)?;
    let (process_rows, warning) = list_process_snapshot_rows()?;

    let mut rows = HashMap::new();
    let mut cache_rows = HashMap::new();
    let mut reused_worktrees = 0usize;
    let mut recomputed_worktrees = 0usize;

    for (worktree, worktree_path) in worktrees {
        let opencode_pid = resolve_opencode_pid_for_worktree(&process_rows, &worktree_path);
        let log_signals = collect_native_log_signals(&worktree_path);
        let signature = build_native_worktree_signature(&worktree_path, opencode_pid, &log_signals);

        if let Some(previous_row) = previous_cache
            .and_then(|cache| cache.rows_by_worktree.get(&worktree))
            .filter(|cache_row| cache_row.signature == signature)
        {
            reused_worktrees += 1;
            rows.insert(worktree.clone(), previous_row.row.clone());
            cache_rows.insert(worktree, previous_row.clone());
            continue;
        }

        recomputed_worktrees += 1;
        let (opencode_state, opencode_instance_id) = if let Some(pid) = opencode_pid {
            ("running".to_string(), Some(pid.to_string()))
        } else {
            ("not-running".to_string(), None)
        };
        let (opencode_activity_state, opencode_activity_detail) = build_native_activity_state(
            &opencode_state,
            &log_signals.log_state,
            log_signals.latest_log_path.as_deref(),
        );

        let row = RuntimeStateRow {
            branch: resolve_branch_from_worktree(&worktree_path)
                .unwrap_or_else(|| branch_guess_from_worktree_name(&worktree)),
            worktree: worktree.clone(),
            opencode_state,
            opencode_instance_id,
            log_state: log_signals.log_state,
            log_target: log_signals.log_target,
            opencode_activity_state,
            opencode_activity_detail,
        };

        rows.insert(worktree.clone(), row.clone());
        cache_rows.insert(worktree, GrooveListNativeCacheRow { signature, row });
    }

    Ok(NativeGrooveListCollection {
        rows,
        cache: GrooveListNativeCache {
            rows_by_worktree: cache_rows,
        },
        reused_worktrees,
        recomputed_worktrees,
        warning,
    })
}

fn inject_groove_terminal_sessions_into_runtime_rows(
    app: &AppHandle,
    workspace_root: &Path,
    rows: &mut HashMap<String, RuntimeStateRow>,
) -> GrooveListTerminalIntegration {
    let Some(terminal_state) = app.try_state::<GrooveTerminalState>() else {
        return GrooveListTerminalIntegration::default();
    };

    let sessions_state = match terminal_state.inner.lock() {
        Ok(state) => state,
        Err(error) => {
            return GrooveListTerminalIntegration {
                integration_error: Some(format!(
                    "Failed to acquire Groove terminal session lock: {error}"
                )),
                ..GrooveListTerminalIntegration::default()
            };
        }
    };

    let mut integration = GrooveListTerminalIntegration {
        session_count: sessions_state.sessions_by_id.len(),
        workspace_session_count: 0,
        injected_worktrees: Vec::new(),
        integration_error: None,
    };
    let workspace_root_key = workspace_root_storage_key(workspace_root);
    let mut injected_worktrees = HashSet::new();

    for session in sessions_state.sessions_by_id.values() {
        let session_workspace_root_key = workspace_root_storage_key(Path::new(&session.workspace_root));
        if session_workspace_root_key != workspace_root_key {
            continue;
        }

        integration.workspace_session_count += 1;

        let worktree = session.worktree.trim();
        if worktree.is_empty() {
            continue;
        }

        let row = rows
            .entry(worktree.to_string())
            .or_insert_with(|| RuntimeStateRow {
                branch: branch_guess_from_worktree_name(worktree),
                worktree: worktree.to_string(),
                opencode_state: "running".to_string(),
                opencode_instance_id: None,
                log_state: "unknown".to_string(),
                log_target: None,
                opencode_activity_state: "unknown".to_string(),
                opencode_activity_detail: None,
            });

        if row.opencode_state != "running" {
            row.opencode_state = "running".to_string();
            row.opencode_instance_id = None;
            injected_worktrees.insert(worktree.to_string());
        }
    }

    let mut injected = injected_worktrees.into_iter().collect::<Vec<_>>();
    injected.sort();
    integration.injected_worktrees = injected;
    integration
}

fn collect_groove_list_via_shell(
    app: &AppHandle,
    workspace_root: &Path,
    known_worktrees: &[String],
    dir: &Option<String>,
) -> (CommandResult, HashMap<String, RuntimeStateRow>, Duration, Duration) {
    let mut args = vec!["list".to_string()];
    if let Some(dir) = dir.clone() {
        args.push("--dir".to_string());
        args.push(dir);
    }

    let exec_started_at = Instant::now();
    let result = run_command(&groove_binary_path(app), &args, workspace_root);
    let exec_elapsed = exec_started_at.elapsed();

    if result.exit_code != Some(0) || result.error.is_some() {
        return (result, HashMap::new(), exec_elapsed, Duration::ZERO);
    }

    let parse_started_at = Instant::now();
    let rows = parse_groove_list_output(&result.stdout, known_worktrees);
    let parse_elapsed = parse_started_at.elapsed();
    (result, rows, exec_elapsed, parse_elapsed)
}

fn parse_pid(value: &str) -> Result<i32, String> {
    if !value.chars().all(|c| c.is_ascii_digit()) {
        return Err("instanceId must contain only digits.".to_string());
    }

    let parsed = value
        .parse::<i32>()
        .map_err(|_| "instanceId must be a numeric PID.".to_string())?;
    if parsed <= 0 {
        return Err("instanceId must be a positive integer PID.".to_string());
    }

    Ok(parsed)
}

fn ensure_worktree_in_dir(
    workspace_root: &Path,
    worktree: &str,
    dir: &str,
) -> Result<PathBuf, String> {
    let expected_suffix = Path::new(dir).join(worktree);
    let (expected_worktrees_dir, target) = if workspace_root.ends_with(&expected_suffix) {
        let parent = workspace_root.parent().ok_or_else(|| {
            format!(
                "Could not resolve parent worktrees directory for \"{}\".",
                workspace_root.display()
            )
        })?;
        (parent.to_path_buf(), workspace_root.to_path_buf())
    } else {
        let expected_worktrees_dir = workspace_root.join(dir);
        (expected_worktrees_dir.clone(), expected_worktrees_dir.join(worktree))
    };
    let expected_resolved = expected_worktrees_dir
        .canonicalize()
        .unwrap_or_else(|_| expected_worktrees_dir.clone());
    let target_resolved = target.canonicalize().unwrap_or_else(|_| target.clone());

    if !target_resolved.starts_with(&expected_resolved) {
        return Err(format!(
            "Resolved worktree path \"{}\" is outside expected worktrees directory \"{}\".",
            target_resolved.display(),
            expected_resolved.display()
        ));
    }

    if !target.is_dir() {
        return Err(format!(
            "Worktree directory not found at \"{}\".",
            target.display()
        ));
    }

    Ok(target)
}

fn is_worktree_missing_error_message(message: &str) -> bool {
    message.starts_with("Worktree directory not found at \"")
        || message.contains("No groove worktree found for '")
}

fn clear_stale_worktree_state(
    app: &AppHandle,
    state: &TestingEnvironmentState,
    workspace_root: &Path,
    worktree: &str,
) -> Result<(), String> {
    let _ = unset_testing_target_for_worktree(app, state, workspace_root, worktree, true)?;
    clear_worktree_tombstone(app, workspace_root, worktree)?;
    clear_worktree_last_executed_at(app, workspace_root, worktree)?;
    invalidate_workspace_context_cache(app, workspace_root);
    invalidate_groove_list_cache_for_workspace(app, workspace_root);
    Ok(())
}

fn resolve_branch_from_worktree(worktree_path: &Path) -> Option<String> {
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(worktree_path)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if branch.is_empty() || branch == "HEAD" {
        return None;
    }

    Some(branch)
}

fn should_treat_as_already_stopped(stderr: &str) -> bool {
    testing_environment::should_treat_as_already_stopped(stderr)
}

fn wait_for_process_exit(pid: i32, timeout_ms: u64) -> bool {
    let start = std::time::Instant::now();
    while start.elapsed().as_millis() < u128::from(timeout_ms) {
        if !is_process_running(pid) {
            return true;
        }
        thread::sleep(Duration::from_millis(120));
    }
    !is_process_running(pid)
}

fn collect_descendant_pids(snapshot_rows: &[ProcessSnapshotRow], root_pid: i32) -> Vec<i32> {
    let relationships = snapshot_rows
        .iter()
        .map(|row| (row.pid, row.ppid))
        .collect::<Vec<_>>();
    diagnostics::collect_descendant_pids(&relationships, root_pid)
}

fn stop_process_by_pid(pid: i32) -> Result<(bool, i32), String> {
    if pid <= 0 {
        return Err("PID must be a positive integer.".to_string());
    }

    if !is_process_running(pid) {
        return Ok((true, pid));
    }

    #[cfg(target_os = "windows")]
    {
        let graceful = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T"])
            .output()
            .map_err(|error| format!("Failed to execute taskkill: {error}"))?;

        if !graceful.status.success() {
            let stderr = String::from_utf8_lossy(&graceful.stderr).to_string();
            if !should_treat_as_already_stopped(&stderr) {
                let force = Command::new("taskkill")
                    .args(["/F", "/PID", &pid.to_string(), "/T"])
                    .output()
                    .map_err(|error| format!("Failed to execute taskkill /F: {error}"))?;
                if !force.status.success() {
                    let force_stderr = String::from_utf8_lossy(&force.stderr).to_string();
                    if !should_treat_as_already_stopped(&force_stderr) {
                        return Err(format!("Failed to stop PID {pid}: {force_stderr}"));
                    }
                }
            }
        }

        if wait_for_process_exit(pid, 1800) {
            return Ok((false, pid));
        }

        let force = Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string(), "/T"])
            .output()
            .map_err(|error| format!("Failed to execute taskkill /F: {error}"))?;
        if !force.status.success() {
            let force_stderr = String::from_utf8_lossy(&force.stderr).to_string();
            if !should_treat_as_already_stopped(&force_stderr) {
                return Err(format!("Failed to force-stop PID {pid}: {force_stderr}"));
            }
        }

        if wait_for_process_exit(pid, 1500) {
            return Ok((false, pid));
        }

        return Err(format!(
            "PID {pid} is still running after taskkill escalation."
        ));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let send_signal = |signal: &str, target: &str| -> Result<(), String> {
            let output = Command::new("kill")
                .args([signal, "--", &target])
                .output()
                .map_err(|error| {
                    format!("Failed to execute kill {signal} for {target}: {error}")
                })?;
            if output.status.success() {
                return Ok(());
            }
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if should_treat_as_already_stopped(&stderr) {
                return Ok(());
            }
            Err(format!("kill {signal} {target} failed: {stderr}"))
        };

        let signal_descendants = |signal: &str| {
            let Ok((snapshot_rows, _warning)) = list_process_snapshot_rows() else {
                return;
            };

            for descendant_pid in collect_descendant_pids(&snapshot_rows, pid) {
                let _ = send_signal(signal, &descendant_pid.to_string());
            }
        };

        let process_group_target = format!("-{pid}");
        let pid_target = pid.to_string();

        let _ = send_signal("-TERM", &process_group_target);
        let _ = send_signal("-TERM", &pid_target);
        signal_descendants("-TERM");

        if wait_for_process_exit(pid, 1500) {
            return Ok((false, pid));
        }

        let _ = send_signal("-KILL", &process_group_target);
        let _ = send_signal("-KILL", &pid_target);
        signal_descendants("-KILL");

        if wait_for_process_exit(pid, 1500) {
            return Ok((false, pid));
        }

        Err(format!(
            "PID {pid} is still running after TERM/KILL escalation."
        ))
    }
}

fn command_mentions_worktrees(command: &str) -> bool {
    let normalized = command.to_lowercase();
    normalized.contains("/.worktree/")
        || normalized.contains("\\.worktree\\")
        || normalized.contains("/.worktree\\")
        || normalized.contains("\\.worktree/")
        || normalized.contains("/.worktrees/")
        || normalized.contains("\\.worktrees\\")
        || normalized.contains("/.worktrees\\")
        || normalized.contains("\\.worktrees/")
}

fn is_likely_node_command(process_name: Option<&str>, command: &str) -> bool {
    let normalized = command.to_lowercase();
    if normalized.contains(" node ")
        || normalized.starts_with("node ")
        || normalized.contains("next dev")
        || normalized.contains("pnpm run dev")
        || normalized.contains("vite")
    {
        return true;
    }

    process_name
        .map(|value| {
            let lowered = value.to_lowercase();
            lowered.contains("node") || lowered.contains("next") || lowered.contains("pnpm")
        })
        .unwrap_or(false)
}

fn command_matches_turbo_dev(command: &str) -> bool {
    command.to_lowercase().contains("next dev --turbo")
}

fn is_next_telemetry_detached_flush_command(command: &str) -> bool {
    command
        .replace('\\', "/")
        .to_lowercase()
        .contains("next/dist/telemetry/detached-flush.js")
}

fn is_opencode_process(process_name: Option<&str>, command: &str) -> bool {
    let lowered_process_name = process_name.unwrap_or_default().to_lowercase();
    let lowered_command = command.to_lowercase();
    lowered_process_name.contains("opencode") || lowered_command.contains("opencode")
}

fn is_worktree_opencode_process(process_name: Option<&str>, command: &str) -> bool {
    command_mentions_worktrees(command) && is_opencode_process(process_name, command)
}

fn is_worktree_node_process(process_name: Option<&str>, command: &str) -> bool {
    command_mentions_worktrees(command)
        && is_likely_node_command(process_name, command)
        && !is_next_telemetry_detached_flush_command(command)
}

fn stop_pid_set(pids: &[i32]) -> (usize, usize, usize, Vec<String>) {
    let mut stopped = 0usize;
    let mut already_stopped = 0usize;
    let mut failed = 0usize;
    let mut errors = Vec::new();

    for pid in pids {
        match stop_process_by_pid(*pid) {
            Ok((was_already_stopped, _)) => {
                if was_already_stopped {
                    already_stopped += 1;
                } else {
                    stopped += 1;
                }
            }
            Err(error) => {
                failed += 1;
                errors.push(format!("PID {pid}: {error}"));
            }
        }
    }

    (stopped, already_stopped, failed, errors)
}

#[cfg(target_os = "linux")]
fn is_zombie_process(pid: i32) -> bool {
    let stat_path = format!("/proc/{pid}/stat");
    let Ok(stat) = fs::read_to_string(stat_path) else {
        return false;
    };

    let Some(closing_paren_index) = stat.rfind(')') else {
        return false;
    };
    let remainder = stat[closing_paren_index + 1..].trim_start();
    let Some(state) = remainder.chars().next() else {
        return false;
    };

    state == 'Z'
}

fn is_process_running(pid: i32) -> bool {
    if pid <= 0 {
        return false;
    }

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
            .output();
        let Ok(output) = output else {
            return false;
        };
        if !output.status.success() {
            return false;
        }

        let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
        !stdout.contains("no tasks are running") && stdout.contains(&format!("\"{pid}\""))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output();

        let is_running = output.map(|value| value.status.success()).unwrap_or(false);
        if !is_running {
            return false;
        }

        #[cfg(target_os = "linux")]
        {
            if is_zombie_process(pid) {
                return false;
            }
        }

        true
    }
}

