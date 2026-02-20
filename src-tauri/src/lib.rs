use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use uuid::Uuid;
use walkdir::WalkDir;

const MAX_DISCOVERY_DEPTH: usize = 4;
const MAX_DISCOVERY_DIRECTORIES: usize = 2500;
const SEPARATE_TERMINAL_COMMAND_TIMEOUT: Duration = Duration::from_secs(15);
const COMMAND_TIMEOUT_POLL_INTERVAL: Duration = Duration::from_millis(50);
const WORKSPACE_EVENTS_POLL_INTERVAL: Duration = Duration::from_millis(1800);
const WORKSPACE_EVENTS_MIN_EMIT_INTERVAL: Duration = Duration::from_millis(1200);
const SUPPORTED_DEFAULT_TERMINALS: [&str; 8] = [
    "auto", "ghostty", "warp", "kitty", "gnome", "xterm", "none", "custom",
];

#[derive(Default)]
struct WorkspaceEventState {
    worker: Mutex<Option<WorkspaceWorker>>,
}

#[derive(Default)]
struct TestingEnvironmentState {
    runtime: Mutex<TestingEnvironmentRuntimeState>,
}

#[derive(Default)]
struct TestingEnvironmentRuntimeState {
    loaded: bool,
    persisted: PersistedTestingEnvironmentState,
    children_by_worktree: HashMap<String, std::process::Child>,
}

struct WorkspaceWorker {
    stop: Arc<AtomicBool>,
    handle: JoinHandle<()>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TestingEnvironmentTarget {
    workspace_root: String,
    worktree: String,
    worktree_path: String,
    updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TestingEnvironmentInstance {
    instance_id: String,
    pid: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    port: Option<u16>,
    workspace_root: String,
    worktree: String,
    worktree_path: String,
    command: String,
    started_at: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedTestingEnvironmentState {
    #[serde(default)]
    targets: Vec<TestingEnvironmentTarget>,
    #[serde(default)]
    running_instances: Vec<TestingEnvironmentInstance>,
    #[serde(skip_serializing_if = "Option::is_none")]
    updated_at: Option<String>,
    #[serde(default, skip_serializing)]
    target: Option<TestingEnvironmentTarget>,
    #[serde(default, skip_serializing)]
    running_instance: Option<TestingEnvironmentInstance>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedWorktreeExecutionState {
    #[serde(default)]
    last_executed_at_by_workspace: HashMap<String, HashMap<String, String>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceMetaContext {
    version: Option<i64>,
    root_name: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
    default_terminal: Option<String>,
    terminal_custom_command: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceMeta {
    version: i64,
    root_name: String,
    created_at: String,
    updated_at: String,
    #[serde(default = "default_terminal_auto")]
    default_terminal: String,
    #[serde(default)]
    terminal_custom_command: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceScanRow {
    worktree: String,
    branch_guess: String,
    path: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_executed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceContextResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_meta: Option<WorkspaceMeta>,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    has_worktrees_directory: Option<bool>,
    #[serde(default)]
    rows: Vec<WorkspaceScanRow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cancelled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrooveListPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    dir: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrooveRestorePayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    worktree: String,
    action: Option<String>,
    target: Option<String>,
    dir: Option<String>,
    opencode_log_file: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrooveNewPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    branch: String,
    base: Option<String>,
    dir: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrooveRmPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    target: String,
    worktree: String,
    dir: Option<String>,
    force: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrooveStopPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    worktree: String,
    instance_id: Option<String>,
    dir: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceEventsPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceTerminalSettingsPayload {
    default_terminal: String,
    terminal_custom_command: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TestingEnvironmentStatusPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TestingEnvironmentSetTargetPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    worktree: String,
    enabled: Option<bool>,
    auto_start_if_current_running: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TestingEnvironmentStartPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    worktree: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TestingEnvironmentStopPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    worktree: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeStateRow {
    branch: String,
    worktree: String,
    opencode_state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    opencode_instance_id: Option<String>,
    log_state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    log_target: Option<String>,
    opencode_activity_state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    opencode_activity_detail: Option<OpencodeActivityDetail>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpencodeActivityDetail {
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    age_s: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    marker: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    log: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GrooveListResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    rows: HashMap<String, RuntimeStateRow>,
    stdout: String,
    stderr: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GrooveCommandResponse {
    request_id: String,
    ok: bool,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GrooveStopResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    already_stopped: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pid: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceEventsResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceTerminalSettingsResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_meta: Option<WorkspaceMeta>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TestingEnvironmentEntry {
    worktree: String,
    worktree_path: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    instance_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pid: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    started_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TestingEnvironmentResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    #[serde(default)]
    environments: Vec<TestingEnvironmentEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    target_worktree: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    target_path: Option<String>,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    instance_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pid: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsProcessRow {
    pid: i32,
    process_name: String,
    command: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsOpencodeInstancesResponse {
    request_id: String,
    ok: bool,
    #[serde(default)]
    rows: Vec<DiagnosticsProcessRow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsStopResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pid: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    already_stopped: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsStopAllResponse {
    request_id: String,
    ok: bool,
    attempted: usize,
    stopped: usize,
    already_stopped: usize,
    failed: usize,
    #[serde(default)]
    errors: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsNodeAppRow {
    pid: i32,
    ppid: i32,
    cmd: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsNodeAppsResponse {
    request_id: String,
    ok: bool,
    #[serde(default)]
    rows: Vec<DiagnosticsNodeAppRow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    warning: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsMostConsumingProgramsResponse {
    request_id: String,
    ok: bool,
    output: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone)]
struct ProcessSnapshotRow {
    pid: i32,
    ppid: Option<i32>,
    process_name: Option<String>,
    command: String,
}

#[derive(Debug, Clone)]
struct CandidateRoot {
    root_path: PathBuf,
    has_workspace_meta: bool,
    matches_workspace_meta: bool,
}

#[derive(Debug, Clone)]
struct CommandResult {
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    error: Option<String>,
}

#[derive(Debug, Clone)]
struct SnapshotEntry {
    exists: bool,
    mtime_ms: u128,
}

fn request_id() -> String {
    Uuid::new_v4().to_string()
}

fn default_terminal_auto() -> String {
    "auto".to_string()
}

fn normalize_default_terminal(value: &str) -> Result<String, String> {
    let normalized = value.trim().to_lowercase();
    if SUPPORTED_DEFAULT_TERMINALS.contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(format!(
            "defaultTerminal must be one of: {}.",
            SUPPORTED_DEFAULT_TERMINALS.join(", ")
        ))
    }
}

fn parse_terminal_command_tokens(command: &str) -> Result<Vec<String>, String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("terminalCustomCommand must be a non-empty command string.".to_string());
    }

    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut escaping = false;

    for ch in trimmed.chars() {
        if escaping {
            current.push(ch);
            escaping = false;
            continue;
        }

        if ch == '\\' && !in_single_quote {
            escaping = true;
            continue;
        }

        if ch == '\'' && !in_double_quote {
            in_single_quote = !in_single_quote;
            continue;
        }

        if ch == '"' && !in_single_quote {
            in_double_quote = !in_double_quote;
            continue;
        }

        if ch.is_whitespace() && !in_single_quote && !in_double_quote {
            if !current.is_empty() {
                tokens.push(std::mem::take(&mut current));
            }
            continue;
        }

        current.push(ch);
    }

    if escaping {
        return Err("terminalCustomCommand ends with an unfinished escape (\\).".to_string());
    }
    if in_single_quote || in_double_quote {
        return Err("terminalCustomCommand has an unmatched quote.".to_string());
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    if tokens.is_empty() {
        return Err("terminalCustomCommand must include an executable command.".to_string());
    }

    Ok(tokens)
}

fn parse_custom_terminal_command(
    command: &str,
    worktree_path: &Path,
) -> Result<(String, Vec<String>), String> {
    let tokens = parse_terminal_command_tokens(command)?;
    let worktree = worktree_path.display().to_string();
    let contains_worktree_placeholder = tokens.iter().any(|token| token.contains("{worktree}"));

    let mut resolved_tokens = tokens
        .into_iter()
        .map(|token| token.replace("{worktree}", &worktree))
        .collect::<Vec<_>>();
    if !contains_worktree_placeholder {
        resolved_tokens.push(worktree);
    }

    let Some((program, args)) = resolved_tokens.split_first() else {
        return Err("terminalCustomCommand must include an executable command.".to_string());
    };

    Ok((program.to_string(), args.to_vec()))
}

fn run_command_with_worktree_env(
    binary: &str,
    args: &[String],
    cwd: &Path,
    worktree_path: &Path,
    port: Option<u16>,
    timeout: Duration,
) -> CommandResult {
    let mut command = Command::new(binary);
    command
        .args(args)
        .current_dir(cwd)
        .env("GROOVE_WORKTREE", worktree_path.display().to_string());
    if let Some(port) = port {
        command.env("PORT", port.to_string());
    }

    run_command_with_timeout(
        command,
        timeout,
        format!("Failed to execute custom command {binary}"),
        format!("custom command {binary}"),
    )
}

fn run_command_with_timeout(
    mut command: Command,
    timeout: Duration,
    spawn_error_context: String,
    timeout_context: String,
) -> CommandResult {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return CommandResult {
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                error: Some(format!("{spawn_error_context}: {error}")),
            };
        }
    };

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                return match child.wait_with_output() {
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
                        error: Some(format!(
                            "Failed to collect command output for {timeout_context}: {error}"
                        )),
                    },
                };
            }
            Ok(None) => {
                if started.elapsed() >= timeout {
                    let _ = child.kill();
                    return match child.wait_with_output() {
                        Ok(output) => CommandResult {
                            exit_code: output.status.code(),
                            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                            error: Some(format!(
                                "Command {timeout_context} timed out after {} seconds and was terminated.",
                                timeout.as_secs()
                            )),
                        },
                        Err(error) => CommandResult {
                            exit_code: None,
                            stdout: String::new(),
                            stderr: String::new(),
                            error: Some(format!(
                                "Command {timeout_context} timed out after {} seconds and could not be reaped: {error}",
                                timeout.as_secs()
                            )),
                        },
                    };
                }

                thread::sleep(COMMAND_TIMEOUT_POLL_INTERVAL);
            }
            Err(error) => {
                return CommandResult {
                    exit_code: None,
                    stdout: String::new(),
                    stderr: String::new(),
                    error: Some(format!(
                        "Failed while waiting for {timeout_context}: {error}"
                    )),
                };
            }
        }
    }
}

fn is_safe_path_token(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }

    for segment in value.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return false;
        }

        if !segment
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
        {
            return false;
        }
    }

    true
}

fn is_valid_root_name(value: &str) -> bool {
    !value.trim().is_empty()
        && !value.contains('/')
        && !value.contains('\\')
        && value != "."
        && value != ".."
}

fn validate_known_worktrees(known_worktrees: &[String]) -> Result<Vec<String>, String> {
    if known_worktrees.len() > 128 {
        return Err("knownWorktrees is too large (max 128 entries).".to_string());
    }

    let mut set = HashSet::new();
    for entry in known_worktrees {
        let trimmed = entry.trim();
        if trimmed.is_empty() {
            return Err("knownWorktrees entries must be non-empty strings.".to_string());
        }

        if !is_safe_path_token(trimmed) {
            return Err("knownWorktrees contains unsafe characters or path segments.".to_string());
        }

        set.insert(trimmed.to_string());
    }

    Ok(set.into_iter().collect())
}

fn validate_optional_relative_path(
    value: &Option<String>,
    label: &str,
) -> Result<Option<String>, String> {
    let Some(raw) = value else {
        return Ok(None);
    };

    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} must be a non-empty string when provided."));
    }

    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err(format!("{label} must be a relative path."));
    }

    for component in path.components() {
        if matches!(component, Component::ParentDir | Component::CurDir) {
            return Err(format!("{label} contains unsafe path segments."));
        }
    }

    Ok(Some(trimmed.to_string()))
}

fn path_is_directory(path: &Path) -> bool {
    path.is_dir()
}

fn path_is_file(path: &Path) -> bool {
    path.is_file()
}

fn build_likely_search_bases() -> Vec<PathBuf> {
    let mut bases = Vec::new();
    let mut seen = HashSet::new();

    if let Ok(mut cursor) = std::env::current_dir() {
        for _ in 0..=3 {
            if seen.insert(cursor.clone()) {
                bases.push(cursor.clone());
            }

            let Some(parent) = cursor.parent() else {
                break;
            };

            if parent == cursor {
                break;
            }

            cursor = parent.to_path_buf();
        }
    }

    if let Some(home) = dirs_home() {
        if seen.insert(home.clone()) {
            bases.push(home);
        }
    }

    bases
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
}

fn now_iso() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn workspace_root_storage_key(workspace_root: &Path) -> String {
    workspace_root
        .canonicalize()
        .unwrap_or_else(|_| workspace_root.to_path_buf())
        .display()
        .to_string()
}

fn branch_guess_from_worktree_name(worktree: &str) -> String {
    worktree.replace('_', "/")
}

fn workspace_state_file(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;
    Ok(app_data_dir.join("active-workspace.json"))
}

fn read_persisted_active_workspace_root(app: &AppHandle) -> Result<Option<String>, String> {
    let state_file = workspace_state_file(app)?;
    if !path_is_file(&state_file) {
        return Ok(None);
    }

    let raw = fs::read_to_string(&state_file)
        .map_err(|error| format!("Failed to read workspace state file: {error}"))?;
    let parsed = serde_json::from_str::<serde_json::Value>(&raw)
        .map_err(|error| format!("Failed to parse workspace state file: {error}"))?;

    let workspace_root = parsed
        .as_object()
        .and_then(|obj| obj.get("workspaceRoot"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    Ok(workspace_root)
}

fn persist_active_workspace_root(app: &AppHandle, workspace_root: &Path) -> Result<(), String> {
    let state_file = workspace_state_file(app)?;
    let payload = serde_json::json!({
        "workspaceRoot": workspace_root.display().to_string(),
        "updatedAt": now_iso(),
    });

    let body = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Failed to serialize workspace state file: {error}"))?;
    fs::write(&state_file, format!("{body}\n"))
        .map_err(|error| format!("Failed to write workspace state file: {error}"))
}

fn clear_persisted_active_workspace_root(app: &AppHandle) -> Result<(), String> {
    let state_file = workspace_state_file(app)?;
    if state_file.exists() {
        fs::remove_file(&state_file)
            .map_err(|error| format!("Failed to clear workspace state file: {error}"))?;
    }

    Ok(())
}

fn worktree_execution_state_file(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;
    Ok(app_data_dir.join("worktree-executions.json"))
}

fn read_persisted_worktree_execution_state(
    app: &AppHandle,
) -> Result<PersistedWorktreeExecutionState, String> {
    let state_file = worktree_execution_state_file(app)?;
    if !path_is_file(&state_file) {
        return Ok(PersistedWorktreeExecutionState::default());
    }

    let raw = fs::read_to_string(&state_file)
        .map_err(|error| format!("Failed to read worktree execution state file: {error}"))?;
    serde_json::from_str::<PersistedWorktreeExecutionState>(&raw)
        .map_err(|error| format!("Failed to parse worktree execution state file: {error}"))
}

fn write_persisted_worktree_execution_state(
    app: &AppHandle,
    state: &PersistedWorktreeExecutionState,
) -> Result<(), String> {
    let state_file = worktree_execution_state_file(app)?;
    let body = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Failed to serialize worktree execution state file: {error}"))?;
    fs::write(&state_file, format!("{body}\n"))
        .map_err(|error| format!("Failed to write worktree execution state file: {error}"))
}

fn record_worktree_last_executed_at(
    app: &AppHandle,
    workspace_root: &Path,
    worktree: &str,
) -> Result<(), String> {
    let mut state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    state
        .last_executed_at_by_workspace
        .entry(workspace_key)
        .or_default()
        .insert(worktree.to_string(), now_iso());
    write_persisted_worktree_execution_state(app, &state)
}

fn testing_environment_state_file(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;
    Ok(app_data_dir.join("testing-environment.json"))
}

fn read_persisted_testing_environment_state(
    app: &AppHandle,
) -> Result<PersistedTestingEnvironmentState, String> {
    let state_file = testing_environment_state_file(app)?;
    if !path_is_file(&state_file) {
        return Ok(PersistedTestingEnvironmentState::default());
    }

    let raw = fs::read_to_string(&state_file)
        .map_err(|error| format!("Failed to read testing environment state file: {error}"))?;
    serde_json::from_str::<PersistedTestingEnvironmentState>(&raw)
        .map_err(|error| format!("Failed to parse testing environment state file: {error}"))
}

fn write_persisted_testing_environment_state(
    app: &AppHandle,
    state: &PersistedTestingEnvironmentState,
) -> Result<(), String> {
    let state_file = testing_environment_state_file(app)?;
    let body = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Failed to serialize testing environment state file: {error}"))?;
    fs::write(&state_file, format!("{body}\n"))
        .map_err(|error| format!("Failed to write testing environment state file: {error}"))
}

fn clear_persisted_testing_environment_state(app: &AppHandle) -> Result<(), String> {
    let state_file = testing_environment_state_file(app)?;
    if state_file.exists() {
        fs::remove_file(&state_file)
            .map_err(|error| format!("Failed to clear testing environment state file: {error}"))?;
    }

    Ok(())
}

fn default_workspace_meta(workspace_root: &Path) -> WorkspaceMeta {
    let now = now_iso();
    WorkspaceMeta {
        version: 1,
        root_name: workspace_root
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| workspace_root.display().to_string()),
        created_at: now.clone(),
        updated_at: now,
        default_terminal: default_terminal_auto(),
        terminal_custom_command: None,
    }
}

fn read_workspace_meta_file(path: &Path) -> Result<WorkspaceMeta, String> {
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    serde_json::from_str::<WorkspaceMeta>(&raw)
        .map_err(|error| format!("Failed to parse {}: {error}", path.display()))
}

fn write_workspace_meta_file(path: &Path, workspace_meta: &WorkspaceMeta) -> Result<(), String> {
    let body = serde_json::to_string_pretty(workspace_meta)
        .map_err(|error| format!("Failed to serialize workspace metadata: {error}"))?;
    fs::write(path, format!("{body}\n"))
        .map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

fn ensure_workspace_meta(workspace_root: &Path) -> Result<(WorkspaceMeta, String), String> {
    let groove_dir = workspace_root.join(".groove");
    fs::create_dir_all(&groove_dir)
        .map_err(|error| format!("Failed to create {}: {error}", groove_dir.display()))?;

    let workspace_json = groove_dir.join("workspace.json");
    if !path_is_file(&workspace_json) {
        let workspace_meta = default_workspace_meta(workspace_root);
        write_workspace_meta_file(&workspace_json, &workspace_meta)?;
        return Ok((
            workspace_meta,
            "Created .groove/workspace.json.".to_string(),
        ));
    }

    match read_workspace_meta_file(&workspace_json) {
        Ok(mut workspace_meta) => {
            let expected_root_name = default_workspace_meta(workspace_root).root_name;
            let mut did_update = false;
            if workspace_meta.root_name != expected_root_name {
                workspace_meta.root_name = expected_root_name;
                did_update = true;
            }

            if let Ok(normalized) = normalize_default_terminal(&workspace_meta.default_terminal) {
                if normalized != workspace_meta.default_terminal {
                    workspace_meta.default_terminal = normalized;
                    did_update = true;
                }
            } else {
                workspace_meta.default_terminal = default_terminal_auto();
                did_update = true;
            }

            let normalized_custom_command = workspace_meta
                .terminal_custom_command
                .as_ref()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());
            if workspace_meta.terminal_custom_command != normalized_custom_command {
                workspace_meta.terminal_custom_command = normalized_custom_command;
                did_update = true;
            }

            if did_update {
                workspace_meta.updated_at = now_iso();
                write_workspace_meta_file(&workspace_json, &workspace_meta)?;
            }

            Ok((
                workspace_meta,
                "Loaded existing .groove/workspace.json.".to_string(),
            ))
        }
        Err(_) => {
            let workspace_meta = default_workspace_meta(workspace_root);
            write_workspace_meta_file(&workspace_json, &workspace_meta)?;
            Ok((
                workspace_meta,
                "Recovered corrupt .groove/workspace.json by recreating defaults.".to_string(),
            ))
        }
    }
}

fn scan_workspace_worktrees(
    app: &AppHandle,
    workspace_root: &Path,
) -> Result<(bool, Vec<WorkspaceScanRow>), String> {
    let worktrees_dir = workspace_root.join(".worktrees");
    if !path_is_directory(&worktrees_dir) {
        return Ok((false, Vec::new()));
    }

    let mut rows = Vec::new();
    let workspace_key = workspace_root_storage_key(workspace_root);
    let execution_state = read_persisted_worktree_execution_state(app)?;
    let last_executed_by_worktree = execution_state
        .last_executed_at_by_workspace
        .get(&workspace_key);
    let entries = fs::read_dir(&worktrees_dir)
        .map_err(|error| format!("Failed to read {}: {error}", worktrees_dir.display()))?;

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

        let Some(worktree_os_name) = path.file_name() else {
            continue;
        };
        let worktree = worktree_os_name.to_string_lossy().to_string();
        let status = if path_is_directory(&path.join(".groove")) {
            "paused"
        } else {
            "corrupted"
        };

        rows.push(WorkspaceScanRow {
            branch_guess: branch_guess_from_worktree_name(&worktree),
            path: path.display().to_string(),
            status: status.to_string(),
            last_executed_at: last_executed_by_worktree
                .and_then(|entries| entries.get(&worktree))
                .cloned(),
            worktree,
        });
    }

    rows.sort_by(|left, right| left.worktree.cmp(&right.worktree));
    Ok((true, rows))
}

fn build_workspace_context(
    app: &AppHandle,
    workspace_root: &Path,
    request_id: String,
    persist_as_active: bool,
) -> WorkspaceContextResponse {
    let (workspace_meta, workspace_message) = match ensure_workspace_meta(workspace_root) {
        Ok(result) => result,
        Err(error) => {
            return WorkspaceContextResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                workspace_meta: None,
                workspace_message: None,
                has_worktrees_directory: None,
                rows: Vec::new(),
                cancelled: None,
                error: Some(error),
            }
        }
    };

    let (has_worktrees_directory, rows) = match scan_workspace_worktrees(app, workspace_root) {
        Ok(result) => result,
        Err(error) => {
            return WorkspaceContextResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                workspace_meta: Some(workspace_meta),
                workspace_message: Some(workspace_message),
                has_worktrees_directory: None,
                rows: Vec::new(),
                cancelled: None,
                error: Some(error),
            }
        }
    };

    if persist_as_active {
        if let Err(error) = persist_active_workspace_root(app, workspace_root) {
            return WorkspaceContextResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                workspace_meta: Some(workspace_meta),
                workspace_message: Some(workspace_message),
                has_worktrees_directory: Some(has_worktrees_directory),
                rows,
                cancelled: None,
                error: Some(error),
            };
        }
    }

    WorkspaceContextResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        workspace_meta: Some(workspace_meta),
        workspace_message: Some(workspace_message),
        has_worktrees_directory: Some(has_worktrees_directory),
        rows,
        cancelled: None,
        error: None,
    }
}

fn read_workspace_meta(workspace_root: &Path) -> Option<WorkspaceMetaContext> {
    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    if !path_is_file(&workspace_json) {
        return None;
    }

    let raw = fs::read_to_string(workspace_json).ok()?;
    let parsed = serde_json::from_str::<serde_json::Value>(&raw).ok()?;
    let obj = parsed.as_object()?;

    let version = obj.get("version").and_then(|v| v.as_i64());
    let root_name = obj
        .get("rootName")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let created_at = obj
        .get("createdAt")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let updated_at = obj
        .get("updatedAt")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let default_terminal = obj
        .get("defaultTerminal")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let terminal_custom_command = obj
        .get("terminalCustomCommand")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());

    if version.is_none()
        && root_name.is_none()
        && created_at.is_none()
        && updated_at.is_none()
        && default_terminal.is_none()
        && terminal_custom_command.is_none()
    {
        return None;
    }

    Some(WorkspaceMetaContext {
        version,
        root_name,
        created_at,
        updated_at,
        default_terminal,
        terminal_custom_command,
    })
}

fn workspace_meta_matches(
    observed: &Option<WorkspaceMetaContext>,
    expected: &Option<WorkspaceMetaContext>,
) -> bool {
    let (Some(observed), Some(expected)) = (observed, expected) else {
        return false;
    };

    if let Some(expected_root) = &expected.root_name {
        if observed.root_name.as_ref() != Some(expected_root) {
            return false;
        }
    }

    if let Some(expected_created) = &expected.created_at {
        if observed.created_at.as_ref() != Some(expected_created) {
            return false;
        }
    }

    if let Some(expected_version) = expected.version {
        if observed.version != Some(expected_version) {
            return false;
        }
    }

    true
}

fn inspect_candidate_root(
    root_path: &Path,
    required_worktree: Option<&str>,
    known_worktrees: &[String],
    expected_workspace_meta: &Option<WorkspaceMetaContext>,
) -> Option<CandidateRoot> {
    if !path_is_directory(&root_path.join(".worktrees")) {
        return None;
    }

    if let Some(worktree) = required_worktree {
        if !path_is_directory(&root_path.join(".worktrees").join(worktree)) {
            return None;
        }
    }

    for known in known_worktrees {
        if !path_is_directory(&root_path.join(".worktrees").join(known)) {
            return None;
        }
    }

    let observed = read_workspace_meta(root_path);

    Some(CandidateRoot {
        root_path: root_path.to_path_buf(),
        has_workspace_meta: observed.is_some(),
        matches_workspace_meta: workspace_meta_matches(&observed, expected_workspace_meta),
    })
}

fn discover_workspace_root_candidates(
    root_name: &str,
    required_worktree: Option<&str>,
    known_worktrees: &[String],
    expected_workspace_meta: &Option<WorkspaceMetaContext>,
) -> Vec<CandidateRoot> {
    let skipped = HashSet::from([
        ".git",
        ".next",
        ".pnpm-store",
        ".turbo",
        "dist",
        "node_modules",
    ]);

    let mut candidates = HashMap::<PathBuf, CandidateRoot>::new();
    let mut scanned = 0usize;

    for base in build_likely_search_bases() {
        if scanned >= MAX_DISCOVERY_DIRECTORIES {
            break;
        }

        for entry in WalkDir::new(&base)
            .follow_links(false)
            .max_depth(MAX_DISCOVERY_DEPTH + 1)
            .into_iter()
            .filter_entry(|entry| {
                if entry.depth() == 0 {
                    return true;
                }

                let name = entry.file_name().to_string_lossy();
                !skipped.contains(name.as_ref())
            })
            .filter_map(Result::ok)
        {
            if scanned >= MAX_DISCOVERY_DIRECTORIES {
                break;
            }

            if !entry.file_type().is_dir() {
                continue;
            }

            scanned += 1;

            let name = entry.file_name().to_string_lossy();
            if name != root_name {
                continue;
            }

            let candidate_path = entry.path().to_path_buf();
            if let Some(candidate) = inspect_candidate_root(
                &candidate_path,
                required_worktree,
                known_worktrees,
                expected_workspace_meta,
            ) {
                candidates.insert(candidate.root_path.clone(), candidate);
            }
        }
    }

    let mut collected = candidates.into_values().collect::<Vec<_>>();
    collected.sort_by(|a, b| a.root_path.cmp(&b.root_path));
    collected
}

fn validate_workspace_root_path(workspace_root: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(workspace_root.trim());
    if !root.is_absolute() {
        return Err("workspaceRoot must be an absolute path.".to_string());
    }

    if !path_is_directory(&root) {
        return Err(format!(
            "workspaceRoot \"{}\" is not an existing, accessible directory.",
            root.display()
        ));
    }

    Ok(root)
}

fn resolve_workspace_root(
    app: &AppHandle,
    root_name: &Option<String>,
    required_worktree: Option<&str>,
    known_worktrees: &[String],
    workspace_meta: &Option<WorkspaceMetaContext>,
) -> Result<PathBuf, String> {
    if let Some(active_workspace_root) = read_persisted_active_workspace_root(app)
        .ok()
        .flatten()
        .and_then(|value| validate_workspace_root_path(&value).ok())
    {
        if inspect_candidate_root(
            &active_workspace_root,
            required_worktree,
            known_worktrees,
            workspace_meta,
        )
        .is_some()
        {
            return Ok(active_workspace_root);
        }
    }

    let Some(root_name) = root_name
        .as_ref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    else {
        return Err(
            "Could not auto-resolve workspace root: no active workspace is selected.".to_string(),
        );
    };

    if !is_valid_root_name(root_name) {
        return Err("rootName contains invalid path characters.".to_string());
    }

    let candidates = discover_workspace_root_candidates(
        root_name,
        required_worktree,
        known_worktrees,
        workspace_meta,
    );

    if candidates.len() == 1 {
        return Ok(candidates[0].root_path.clone());
    }

    if candidates.is_empty() {
        return Err(format!(
            "Could not auto-resolve workspace root for rootName \"{}\".",
            root_name
        ));
    }

    let metadata_matches = candidates
        .iter()
        .filter(|candidate| candidate.matches_workspace_meta)
        .collect::<Vec<_>>();
    if metadata_matches.len() == 1 {
        return Ok(metadata_matches[0].root_path.clone());
    }

    let candidates_with_meta = candidates
        .iter()
        .filter(|candidate| candidate.has_workspace_meta)
        .collect::<Vec<_>>();
    let diagnostics = if metadata_matches.len() > 1 {
        metadata_matches
    } else if !candidates_with_meta.is_empty() {
        candidates_with_meta
    } else {
        candidates.iter().collect::<Vec<_>>()
    };

    let preview = diagnostics
        .iter()
        .take(5)
        .map(|candidate| candidate.root_path.display().to_string())
        .collect::<Vec<_>>()
        .join(", ");

    Err(format!(
        "Could not auto-resolve workspace root: found {} matches ({}).",
        candidates.len(),
        preview
    ))
}

fn groove_binary_path(app: &AppHandle) -> PathBuf {
    if let Ok(from_env) = std::env::var("GROOVE_BIN") {
        if !from_env.trim().is_empty() {
            return PathBuf::from(from_env);
        }
    }

    let mut names = vec!["groove".to_string()];
    #[cfg(target_os = "linux")]
    {
        names.push("groove-x86_64-unknown-linux-gnu".to_string());
        names.push("groove-aarch64-unknown-linux-gnu".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        names.push("groove-x86_64-apple-darwin".to_string());
        names.push("groove-aarch64-apple-darwin".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        names.push("groove-x86_64-pc-windows-msvc.exe".to_string());
        names.push("groove-aarch64-pc-windows-msvc.exe".to_string());
        names.push("groove.exe".to_string());
    }

    let mut roots = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push(resource_dir);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            roots.push(parent.to_path_buf());
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd);
    }

    for root in roots {
        for name in &names {
            for candidate in [root.join(name), root.join("binaries").join(name)] {
                if candidate.exists() && candidate.is_file() {
                    return candidate;
                }
            }
        }
    }

    PathBuf::from("groove")
}

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

fn allocate_testing_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| format!("Failed to allocate testing environment port: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("Failed to resolve testing environment port: {error}"))?
        .port();
    drop(listener);
    Ok(port)
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
    let expected_worktrees_dir = workspace_root.join(dir);
    let target = expected_worktrees_dir.join(worktree);
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
    let lower = stderr.to_lowercase();
    lower.contains("no such process")
        || lower.contains("not found")
        || lower.contains("cannot find")
        || lower.contains("not running")
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
        let send_signal = |signal: &str, target_group: bool| -> Result<(), String> {
            let target = if target_group {
                format!("-{pid}")
            } else {
                pid.to_string()
            };
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

        let _ = send_signal("-TERM", true);
        let _ = send_signal("-TERM", false);

        if wait_for_process_exit(pid, 1500) {
            return Ok((false, pid));
        }

        let _ = send_signal("-KILL", true);
        let _ = send_signal("-KILL", false);

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

fn is_opencode_process(process_name: Option<&str>, command: &str) -> bool {
    let lowered_process_name = process_name.unwrap_or_default().to_lowercase();
    let lowered_command = command.to_lowercase();
    lowered_process_name.contains("opencode") || lowered_command.contains("opencode")
}

fn is_worktree_node_process(process_name: Option<&str>, command: &str) -> bool {
    command_mentions_worktrees(command) && is_likely_node_command(process_name, command)
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

        output.map(|value| value.status.success()).unwrap_or(false)
    }
}

#[cfg(target_os = "windows")]
fn parse_basic_csv_line(raw: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let chars = raw.chars().collect::<Vec<_>>();
    let mut index = 0usize;

    while index < chars.len() {
        let ch = chars[index];
        if ch == '"' {
            if in_quotes && index + 1 < chars.len() && chars[index + 1] == '"' {
                current.push('"');
                index += 2;
                continue;
            }
            in_quotes = !in_quotes;
            index += 1;
            continue;
        }

        if ch == ',' && !in_quotes {
            values.push(current.trim().to_string());
            current.clear();
            index += 1;
            continue;
        }

        current.push(ch);
        index += 1;
    }

    values.push(current.trim().to_string());
    values
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
        .filter(|row| is_opencode_process(row.process_name.as_deref(), &row.command))
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

fn ensure_testing_runtime_loaded(
    app: &AppHandle,
    runtime: &mut TestingEnvironmentRuntimeState,
) -> Result<(), String> {
    if runtime.loaded {
        return Ok(());
    }

    runtime.persisted = read_persisted_testing_environment_state(app)?;
    if runtime.persisted.targets.is_empty() {
        if let Some(target) = runtime.persisted.target.take() {
            runtime.persisted.targets.push(target);
        }
    }
    if runtime.persisted.running_instances.is_empty() {
        if let Some(instance) = runtime.persisted.running_instance.take() {
            runtime.persisted.running_instances.push(instance);
        }
    }
    runtime.loaded = true;
    Ok(())
}

fn testing_child_key(workspace_root: &str, worktree: &str) -> String {
    format!("{}::{}", workspace_root, worktree)
}

fn reconcile_testing_runtime(runtime: &mut TestingEnvironmentRuntimeState) -> bool {
    let mut changed = false;

    let mut completed_child_keys: Vec<String> = Vec::new();
    for (child_key, child) in runtime.children_by_worktree.iter_mut() {
        match child.try_wait() {
            Ok(Some(_status)) => completed_child_keys.push(child_key.clone()),
            Ok(None) => {}
            Err(_) => completed_child_keys.push(child_key.clone()),
        }
    }

    for child_key in completed_child_keys {
        runtime.children_by_worktree.remove(&child_key);
        let before = runtime.persisted.running_instances.len();
        runtime.persisted.running_instances.retain(|instance| {
            testing_child_key(&instance.workspace_root, &instance.worktree) != child_key
        });
        if runtime.persisted.running_instances.len() != before {
            changed = true;
        }
    }

    let before = runtime.persisted.running_instances.len();
    runtime.persisted.running_instances.retain(|instance| {
        if instance.pid <= 0 {
            return true;
        }
        is_process_running(instance.pid)
    });
    if runtime.persisted.running_instances.len() != before {
        changed = true;
    }

    let mut seen_targets = HashSet::<String>::new();
    let before_targets = runtime.persisted.targets.len();
    runtime.persisted.targets.retain(|target| {
        let key = format!("{}::{}", target.workspace_root, target.worktree);
        seen_targets.insert(key)
    });
    if runtime.persisted.targets.len() != before_targets {
        changed = true;
    }

    let mut seen_instances = HashSet::<String>::new();
    let before_instances = runtime.persisted.running_instances.len();
    runtime.persisted.running_instances.retain(|instance| {
        let key = format!("{}::{}", instance.workspace_root, instance.worktree);
        seen_instances.insert(key)
    });
    if runtime.persisted.running_instances.len() != before_instances {
        changed = true;
    }

    if changed {
        runtime.persisted.updated_at = Some(now_iso());
    }

    changed
}

fn reconcile_testing_runtime_and_persist(
    app: &AppHandle,
    runtime: &mut TestingEnvironmentRuntimeState,
) -> Result<(), String> {
    if reconcile_testing_runtime(runtime) {
        write_persisted_testing_environment_state(app, &runtime.persisted)?;
    }

    Ok(())
}

fn build_testing_environment_response(
    request_id: String,
    workspace_root: Option<&Path>,
    state: &PersistedTestingEnvironmentState,
    error: Option<String>,
) -> TestingEnvironmentResponse {
    let workspace_root_string = workspace_root.map(|path| path.display().to_string());

    let root = workspace_root_string.as_deref();
    let targets = state
        .targets
        .iter()
        .filter(|target| {
            root.map(|value| value == target.workspace_root)
                .unwrap_or(false)
        })
        .cloned()
        .collect::<Vec<_>>();
    let running_instances = state
        .running_instances
        .iter()
        .filter(|instance| {
            root.map(|value| value == instance.workspace_root)
                .unwrap_or(false)
        })
        .cloned()
        .collect::<Vec<_>>();

    let running_by_worktree = running_instances
        .iter()
        .map(|instance| (instance.worktree.clone(), instance.clone()))
        .collect::<HashMap<_, _>>();

    let mut environments = targets
        .iter()
        .map(|target| {
            let running_instance = running_by_worktree.get(&target.worktree);
            TestingEnvironmentEntry {
                worktree: target.worktree.clone(),
                worktree_path: target.worktree_path.clone(),
                status: if running_instance.is_some() {
                    "running".to_string()
                } else {
                    "stopped".to_string()
                },
                instance_id: running_instance.map(|value| value.instance_id.clone()),
                pid: running_instance.map(|value| value.pid),
                port: running_instance.and_then(|value| value.port),
                started_at: running_instance.map(|value| value.started_at.clone()),
            }
        })
        .collect::<Vec<_>>();

    for instance in &running_instances {
        let exists = environments
            .iter()
            .any(|environment| environment.worktree == instance.worktree);
        if exists {
            continue;
        }
        environments.push(TestingEnvironmentEntry {
            worktree: instance.worktree.clone(),
            worktree_path: instance.worktree_path.clone(),
            status: "running".to_string(),
            instance_id: Some(instance.instance_id.clone()),
            pid: Some(instance.pid),
            port: instance.port,
            started_at: Some(instance.started_at.clone()),
        });
    }

    environments.sort_by(|left, right| left.worktree.cmp(&right.worktree));

    let status = if environments
        .iter()
        .any(|environment| environment.status == "running")
    {
        "running"
    } else if environments.is_empty() {
        "none"
    } else {
        "stopped"
    }
    .to_string();

    let primary_target = targets.first();
    let primary_running = running_instances.first();

    TestingEnvironmentResponse {
        request_id,
        ok: error.is_none(),
        workspace_root: workspace_root_string,
        environments,
        target_worktree: primary_target.map(|value| value.worktree.clone()),
        target_path: primary_target.map(|value| value.worktree_path.clone()),
        status,
        instance_id: primary_running.map(|value| value.instance_id.clone()),
        pid: primary_running.map(|value| value.pid),
        started_at: primary_running.map(|value| value.started_at.clone()),
        error,
    }
}

fn stop_running_testing_instance_for_worktree(
    runtime: &mut TestingEnvironmentRuntimeState,
    workspace_root: &str,
    worktree: &str,
) -> Result<bool, String> {
    let index = runtime
        .persisted
        .running_instances
        .iter()
        .position(|instance| {
            instance.workspace_root == workspace_root && instance.worktree == worktree
        });
    let Some(index) = index else {
        runtime
            .children_by_worktree
            .remove(&testing_child_key(workspace_root, worktree));
        return Ok(false);
    };

    let instance = runtime.persisted.running_instances[index].clone();
    if let Some(mut child) = runtime
        .children_by_worktree
        .remove(&testing_child_key(workspace_root, worktree))
    {
        let _ = child.kill();
        let _ = child.wait();
    } else if instance.pid > 0 && is_process_running(instance.pid) {
        stop_process_by_pid(instance.pid)?;
    }

    runtime.persisted.running_instances.remove(index);
    runtime.persisted.updated_at = Some(now_iso());
    Ok(true)
}

fn testing_instance_is_effectively_running(instance: &TestingEnvironmentInstance) -> bool {
    if instance.pid <= 0 {
        return true;
    }

    is_process_running(instance.pid)
}

fn start_testing_instance_for_target(
    target: &TestingEnvironmentTarget,
    runtime: &mut TestingEnvironmentRuntimeState,
) -> Result<(), String> {
    if let Some(existing) = runtime
        .persisted
        .running_instances
        .iter()
        .find(|instance| {
            instance.workspace_root == target.workspace_root
                && instance.worktree == target.worktree
                && instance.worktree_path == target.worktree_path
        })
        .cloned()
    {
        if testing_instance_is_effectively_running(&existing) {
            return Ok(());
        }
        let _ = stop_running_testing_instance_for_worktree(
            runtime,
            &target.workspace_root,
            &target.worktree,
        )?;
    }

    let mut command = Command::new("pnpm");
    let port = allocate_testing_port()?;
    command
        .args(["run", "dev"])
        .current_dir(Path::new(&target.worktree_path))
        .env("PORT", port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    let child = command
        .spawn()
        .map_err(|error| format!("Failed to start local testing environment: {error}"))?;

    let raw_pid = child.id();
    let pid = i32::try_from(raw_pid)
        .map_err(|_| format!("Started process PID {raw_pid} is out of supported range."))?;

    runtime.persisted.running_instances.retain(|instance| {
        !(instance.workspace_root == target.workspace_root && instance.worktree == target.worktree)
    });
    runtime
        .persisted
        .running_instances
        .push(TestingEnvironmentInstance {
            instance_id: format!("local-{pid}-{}", Uuid::new_v4()),
            pid,
            port: Some(port),
            workspace_root: target.workspace_root.clone(),
            worktree: target.worktree.clone(),
            worktree_path: target.worktree_path.clone(),
            command: "pnpm run dev".to_string(),
            started_at: now_iso(),
        });
    runtime.children_by_worktree.insert(
        testing_child_key(&target.workspace_root, &target.worktree),
        child,
    );
    runtime.persisted.updated_at = Some(now_iso());

    Ok(())
}

fn snapshot_entry(path: &Path) -> SnapshotEntry {
    if let Ok(metadata) = fs::metadata(path) {
        let mtime_ms = metadata
            .modified()
            .ok()
            .and_then(|ts| ts.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis())
            .unwrap_or_default();

        SnapshotEntry {
            exists: true,
            mtime_ms,
        }
    } else {
        SnapshotEntry {
            exists: false,
            mtime_ms: 0,
        }
    }
}

#[tauri::command]
fn workspace_pick_and_open(app: AppHandle) -> WorkspaceContextResponse {
    let request_id = request_id();
    let picked = rfd::FileDialog::new().pick_folder();
    let Some(selected) = picked else {
        return WorkspaceContextResponse {
            request_id,
            ok: false,
            workspace_root: None,
            workspace_meta: None,
            workspace_message: None,
            has_worktrees_directory: None,
            rows: Vec::new(),
            cancelled: Some(true),
            error: None,
        };
    };

    build_workspace_context(&app, &selected, request_id, true)
}

#[tauri::command]
fn workspace_open(app: AppHandle, workspace_root: String) -> WorkspaceContextResponse {
    let request_id = request_id();
    let root = match validate_workspace_root_path(&workspace_root) {
        Ok(root) => root,
        Err(error) => {
            return WorkspaceContextResponse {
                request_id,
                ok: false,
                workspace_root: None,
                workspace_meta: None,
                workspace_message: None,
                has_worktrees_directory: None,
                rows: Vec::new(),
                cancelled: None,
                error: Some(error),
            }
        }
    };

    build_workspace_context(&app, &root, request_id, true)
}

#[tauri::command]
fn workspace_get_active(app: AppHandle) -> WorkspaceContextResponse {
    let request_id = request_id();
    let persisted_root = match read_persisted_active_workspace_root(&app) {
        Ok(root) => root,
        Err(error) => {
            return WorkspaceContextResponse {
                request_id,
                ok: false,
                workspace_root: None,
                workspace_meta: None,
                workspace_message: None,
                has_worktrees_directory: None,
                rows: Vec::new(),
                cancelled: None,
                error: Some(error),
            }
        }
    };

    let Some(persisted_root) = persisted_root else {
        return WorkspaceContextResponse {
            request_id,
            ok: true,
            workspace_root: None,
            workspace_meta: None,
            workspace_message: None,
            has_worktrees_directory: None,
            rows: Vec::new(),
            cancelled: None,
            error: None,
        };
    };

    let root = match validate_workspace_root_path(&persisted_root) {
        Ok(root) => root,
        Err(error) => {
            let _ = clear_persisted_active_workspace_root(&app);
            return WorkspaceContextResponse {
                request_id,
                ok: false,
                workspace_root: Some(persisted_root),
                workspace_meta: None,
                workspace_message: None,
                has_worktrees_directory: None,
                rows: Vec::new(),
                cancelled: None,
                error: Some(error),
            };
        }
    };

    build_workspace_context(&app, &root, request_id, false)
}

#[tauri::command]
fn workspace_clear_active(
    app: AppHandle,
    testing_state: State<TestingEnvironmentState>,
) -> WorkspaceContextResponse {
    let request_id = request_id();

    if let Ok(mut runtime) = testing_state.runtime.lock() {
        if ensure_testing_runtime_loaded(&app, &mut runtime).is_ok() {
            let instances = runtime.persisted.running_instances.clone();
            for instance in instances {
                let _ = stop_running_testing_instance_for_worktree(
                    &mut runtime,
                    &instance.workspace_root,
                    &instance.worktree,
                );
            }
            runtime.persisted = PersistedTestingEnvironmentState::default();
            runtime.loaded = true;
            let _ = clear_persisted_testing_environment_state(&app);
        }
    }

    match clear_persisted_active_workspace_root(&app) {
        Ok(_) => WorkspaceContextResponse {
            request_id,
            ok: true,
            workspace_root: None,
            workspace_meta: None,
            workspace_message: None,
            has_worktrees_directory: None,
            rows: Vec::new(),
            cancelled: None,
            error: None,
        },
        Err(error) => WorkspaceContextResponse {
            request_id,
            ok: false,
            workspace_root: None,
            workspace_meta: None,
            workspace_message: None,
            has_worktrees_directory: None,
            rows: Vec::new(),
            cancelled: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
fn workspace_update_terminal_settings(
    app: AppHandle,
    payload: WorkspaceTerminalSettingsPayload,
) -> WorkspaceTerminalSettingsResponse {
    let request_id = request_id();

    let default_terminal = match normalize_default_terminal(&payload.default_terminal) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                workspace_meta: None,
                error: Some(error),
            }
        }
    };

    let terminal_custom_command = payload
        .terminal_custom_command
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());

    if default_terminal == "custom" && terminal_custom_command.is_none() {
        return WorkspaceTerminalSettingsResponse {
            request_id,
            ok: false,
            workspace_root: None,
            workspace_meta: None,
            error: Some(
                "terminalCustomCommand is required when defaultTerminal is set to custom."
                    .to_string(),
            ),
        };
    }

    let persisted_root = match read_persisted_active_workspace_root(&app) {
        Ok(Some(value)) => value,
        Ok(None) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                workspace_meta: None,
                error: Some("No active workspace selected.".to_string()),
            }
        }
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                workspace_meta: None,
                error: Some(error),
            }
        }
    };

    let workspace_root = match validate_workspace_root_path(&persisted_root) {
        Ok(root) => root,
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: Some(persisted_root),
                workspace_meta: None,
                error: Some(error),
            }
        }
    };

    let (mut workspace_meta, _) = match ensure_workspace_meta(&workspace_root) {
        Ok(result) => result,
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                workspace_meta: None,
                error: Some(error),
            }
        }
    };

    workspace_meta.default_terminal = default_terminal;
    workspace_meta.terminal_custom_command = terminal_custom_command;
    workspace_meta.updated_at = now_iso();

    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    if let Err(error) = write_workspace_meta_file(&workspace_json, &workspace_meta) {
        return WorkspaceTerminalSettingsResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            workspace_meta: None,
            error: Some(error),
        };
    }

    WorkspaceTerminalSettingsResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        workspace_meta: Some(workspace_meta),
        error: None,
    }
}

#[tauri::command]
fn groove_list(app: AppHandle, payload: GrooveListPayload) -> GrooveListResponse {
    let request_id = request_id();

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(known_worktrees) => known_worktrees,
        Err(error) => {
            return GrooveListResponse {
                request_id,
                ok: false,
                workspace_root: None,
                rows: HashMap::new(),
                stdout: String::new(),
                stderr: String::new(),
                error: Some(error),
            }
        }
    };

    let dir = match validate_optional_relative_path(&payload.dir, "dir") {
        Ok(value) => value,
        Err(error) => {
            return GrooveListResponse {
                request_id,
                ok: false,
                workspace_root: None,
                rows: HashMap::new(),
                stdout: String::new(),
                stderr: String::new(),
                error: Some(error),
            }
        }
    };

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        None,
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => root,
        Err(error) => {
            return GrooveListResponse {
                request_id,
                ok: false,
                workspace_root: None,
                rows: HashMap::new(),
                stdout: String::new(),
                stderr: String::new(),
                error: Some(error),
            }
        }
    };

    let mut args = vec!["list".to_string()];
    if let Some(dir) = dir {
        args.push("--dir".to_string());
        args.push(dir);
    }

    let result = run_command(&groove_binary_path(&app), &args, &workspace_root);
    if result.exit_code != Some(0) || result.error.is_some() {
        return GrooveListResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            rows: HashMap::new(),
            stdout: result.stdout,
            stderr: result.stderr,
            error: result
                .error
                .or_else(|| Some("groove list failed.".to_string())),
        };
    }

    let rows = parse_groove_list_output(&result.stdout, &known_worktrees);

    GrooveListResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        rows,
        stdout: result.stdout,
        stderr: result.stderr,
        error: None,
    }
}

#[tauri::command]
fn groove_restore(app: AppHandle, payload: GrooveRestorePayload) -> GrooveCommandResponse {
    let request_id = request_id();

    if payload.worktree.trim().is_empty() {
        return GrooveCommandResponse {
            request_id,
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error: Some("worktree is required and must be a non-empty string.".to_string()),
        };
    }

    let worktree = payload.worktree.trim().to_string();
    if !is_safe_path_token(&worktree) {
        return GrooveCommandResponse {
            request_id,
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error: Some("worktree contains unsafe characters or path segments.".to_string()),
        };
    }

    let action = payload
        .action
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("restore")
        .to_string();
    if action != "restore" && action != "go" {
        return GrooveCommandResponse {
            request_id,
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error: Some("action must be either 'restore' or 'go' when provided.".to_string()),
        };
    }

    let target = if action == "go" {
        let Some(target) = payload
            .target
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        else {
            return GrooveCommandResponse {
                request_id,
                ok: false,
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                error: Some(
                    "target is required and must be a non-empty string when action is 'go'."
                        .to_string(),
                ),
            };
        };

        if !is_safe_path_token(target) {
            return GrooveCommandResponse {
                request_id,
                ok: false,
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                error: Some("target contains unsafe characters or path segments.".to_string()),
            };
        }

        Some(target.to_string())
    } else {
        None
    };

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(known_worktrees) => known_worktrees,
        Err(error) => {
            return GrooveCommandResponse {
                request_id,
                ok: false,
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                error: Some(error),
            }
        }
    };

    let dir = match validate_optional_relative_path(&payload.dir, "dir") {
        Ok(value) => value,
        Err(error) => {
            return GrooveCommandResponse {
                request_id,
                ok: false,
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                error: Some(error),
            }
        }
    };

    let log_file =
        match validate_optional_relative_path(&payload.opencode_log_file, "opencodeLogFile") {
            Ok(value) => value,
            Err(error) => {
                return GrooveCommandResponse {
                    request_id,
                    ok: false,
                    exit_code: None,
                    stdout: String::new(),
                    stderr: String::new(),
                    error: Some(error),
                }
            }
        };

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        Some(&worktree),
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => root,
        Err(error) => {
            return GrooveCommandResponse {
                request_id,
                ok: false,
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                error: Some(error),
            }
        }
    };

    let worktree_dir = dir.clone().unwrap_or_else(|| ".worktrees".to_string());
    if let Err(error) = ensure_worktree_in_dir(&workspace_root, &worktree, &worktree_dir) {
        return GrooveCommandResponse {
            request_id,
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error: Some(error),
        };
    }

    let mut args = if action == "go" {
        vec!["go".to_string(), target.clone().unwrap_or_default()]
    } else {
        vec!["restore".to_string(), worktree]
    };

    if let Some(dir) = dir {
        args.push("--dir".to_string());
        args.push(dir);
    }
    if action == "restore" {
        if let Some(log_file) = log_file {
            args.push("--opencode-log-file".to_string());
            args.push(log_file);
        }
    }

    let result = run_command(&groove_binary_path(&app), &args, &workspace_root);
    let ok = result.exit_code == Some(0) && result.error.is_none();
    if ok {
        let stamped_worktree = payload.worktree.trim();
        if let Err(error) =
            record_worktree_last_executed_at(&app, &workspace_root, stamped_worktree)
        {
            return GrooveCommandResponse {
                request_id,
                ok: false,
                exit_code: result.exit_code,
                stdout: result.stdout,
                stderr: result.stderr,
                error: Some(error),
            };
        }
    }

    GrooveCommandResponse {
        request_id,
        ok,
        exit_code: result.exit_code,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
    }
}

#[tauri::command]
fn groove_new(app: AppHandle, payload: GrooveNewPayload) -> GrooveCommandResponse {
    let request_id = request_id();

    let branch = payload.branch.trim();
    if branch.is_empty() {
        return GrooveCommandResponse {
            request_id,
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error: Some("branch is required and must be a non-empty string.".to_string()),
        };
    }
    if !is_safe_path_token(branch) {
        return GrooveCommandResponse {
            request_id,
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error: Some("branch contains unsafe characters or path segments.".to_string()),
        };
    }

    let base = match payload
        .base
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(value) => {
            if !is_safe_path_token(value) {
                return GrooveCommandResponse {
                    request_id,
                    ok: false,
                    exit_code: None,
                    stdout: String::new(),
                    stderr: String::new(),
                    error: Some("base contains unsafe characters or path segments.".to_string()),
                };
            }
            Some(value.to_string())
        }
        None => None,
    };

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(known_worktrees) => known_worktrees,
        Err(error) => {
            return GrooveCommandResponse {
                request_id,
                ok: false,
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                error: Some(error),
            }
        }
    };

    let dir = match validate_optional_relative_path(&payload.dir, "dir") {
        Ok(value) => value,
        Err(error) => {
            return GrooveCommandResponse {
                request_id,
                ok: false,
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                error: Some(error),
            }
        }
    };

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        None,
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => root,
        Err(primary_error) => {
            match read_persisted_active_workspace_root(&app)
                .ok()
                .flatten()
                .and_then(|value| validate_workspace_root_path(&value).ok())
            {
                Some(active_root) => active_root,
                None => {
                    return GrooveCommandResponse {
                        request_id,
                        ok: false,
                        exit_code: None,
                        stdout: String::new(),
                        stderr: String::new(),
                        error: Some(primary_error),
                    }
                }
            }
        }
    };

    let mut args = vec!["create".to_string(), branch.to_string()];
    if let Some(base) = base {
        args.push("--base".to_string());
        args.push(base);
    }
    if let Some(dir) = dir {
        args.push("--dir".to_string());
        args.push(dir);
    }

    let result = run_command(&groove_binary_path(&app), &args, &workspace_root);
    let ok = result.exit_code == Some(0) && result.error.is_none();
    if ok {
        let stamped_worktree = branch.replace('/', "_");
        if let Err(error) =
            record_worktree_last_executed_at(&app, &workspace_root, &stamped_worktree)
        {
            return GrooveCommandResponse {
                request_id,
                ok: false,
                exit_code: result.exit_code,
                stdout: result.stdout,
                stderr: result.stderr,
                error: Some(error),
            };
        }
    }

    GrooveCommandResponse {
        request_id,
        ok,
        exit_code: result.exit_code,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
    }
}

#[tauri::command]
fn groove_rm(app: AppHandle, payload: GrooveRmPayload) -> GrooveCommandResponse {
    let request_id = request_id();

    let target = payload.target.trim();
    if target.is_empty() {
        return GrooveCommandResponse {
            request_id,
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error: Some("target is required and must be a non-empty string.".to_string()),
        };
    }
    if !is_safe_path_token(target) {
        return GrooveCommandResponse {
            request_id,
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error: Some("target contains unsafe characters or path segments.".to_string()),
        };
    }

    let resolution_worktree = if payload.worktree.trim().is_empty() {
        target.to_string()
    } else {
        payload.worktree.trim().to_string()
    };
    if !is_safe_path_token(&resolution_worktree) {
        return GrooveCommandResponse {
            request_id,
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error: Some("worktree contains unsafe characters or path segments.".to_string()),
        };
    }

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(known_worktrees) => known_worktrees,
        Err(error) => {
            return GrooveCommandResponse {
                request_id,
                ok: false,
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                error: Some(error),
            }
        }
    };

    let dir = match validate_optional_relative_path(&payload.dir, "dir") {
        Ok(value) => value,
        Err(error) => {
            return GrooveCommandResponse {
                request_id,
                ok: false,
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                error: Some(error),
            }
        }
    };

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        Some(&resolution_worktree),
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => root,
        Err(error) => {
            return GrooveCommandResponse {
                request_id,
                ok: false,
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                error: Some(error),
            }
        }
    };

    let worktree_dir = dir.clone().unwrap_or_else(|| ".worktrees".to_string());
    let target_path =
        match ensure_worktree_in_dir(&workspace_root, &resolution_worktree, &worktree_dir) {
            Ok(path) => path,
            Err(error) => {
                return GrooveCommandResponse {
                    request_id,
                    ok: false,
                    exit_code: None,
                    stdout: String::new(),
                    stderr: String::new(),
                    error: Some(error),
                }
            }
        };

    let force = payload.force.unwrap_or(false);
    let (binary, args) = if force {
        (
            PathBuf::from("git"),
            vec![
                "worktree".to_string(),
                "remove".to_string(),
                "--force".to_string(),
                target_path.display().to_string(),
            ],
        )
    } else {
        let branch_target =
            resolve_branch_from_worktree(&target_path).unwrap_or_else(|| target.to_string());
        let mut args = vec!["rm".to_string(), branch_target];
        if let Some(dir) = dir {
            args.push("--dir".to_string());
            args.push(dir);
        }

        (groove_binary_path(&app), args)
    };

    let result = run_command(&binary, &args, &workspace_root);
    GrooveCommandResponse {
        request_id,
        ok: result.exit_code == Some(0) && result.error.is_none(),
        exit_code: result.exit_code,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
    }
}

#[tauri::command]
fn groove_stop(app: AppHandle, payload: GrooveStopPayload) -> GrooveStopResponse {
    let request_id = request_id();

    let worktree = payload.worktree.trim();
    if worktree.is_empty() {
        return GrooveStopResponse {
            request_id,
            ok: false,
            already_stopped: None,
            pid: None,
            source: None,
            error: Some("worktree is required and must be a non-empty string.".to_string()),
        };
    }
    if !is_safe_path_token(worktree) {
        return GrooveStopResponse {
            request_id,
            ok: false,
            already_stopped: None,
            pid: None,
            source: None,
            error: Some("worktree contains unsafe characters or path segments.".to_string()),
        };
    }

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(known_worktrees) => known_worktrees,
        Err(error) => {
            return GrooveStopResponse {
                request_id,
                ok: false,
                already_stopped: None,
                pid: None,
                source: None,
                error: Some(error),
            }
        }
    };

    let dir = match validate_optional_relative_path(&payload.dir, "dir") {
        Ok(value) => value,
        Err(error) => {
            return GrooveStopResponse {
                request_id,
                ok: false,
                already_stopped: None,
                pid: None,
                source: None,
                error: Some(error),
            }
        }
    };

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        Some(worktree),
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => root,
        Err(error) => {
            return GrooveStopResponse {
                request_id,
                ok: false,
                already_stopped: None,
                pid: None,
                source: None,
                error: Some(error),
            }
        }
    };

    let mut pid = None;
    let mut source = None;

    if let Some(instance_id) = payload
        .instance_id
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        match parse_pid(instance_id) {
            Ok(parsed) => {
                pid = Some(parsed);
                source = Some("request".to_string());
            }
            Err(error) => {
                return GrooveStopResponse {
                    request_id,
                    ok: false,
                    already_stopped: None,
                    pid: None,
                    source: None,
                    error: Some(error),
                }
            }
        }
    }

    if pid.is_none() {
        let mut args = vec!["list".to_string()];
        if let Some(dir) = dir.clone() {
            args.push("--dir".to_string());
            args.push(dir);
        }

        let result = run_command(&groove_binary_path(&app), &args, &workspace_root);
        if result.exit_code != Some(0) || result.error.is_some() {
            return GrooveStopResponse {
                request_id,
                ok: false,
                already_stopped: None,
                pid: None,
                source: None,
                error: result.error.or_else(|| {
                    Some("Unable to resolve opencode PID from groove list.".to_string())
                }),
            };
        }

        let rows = parse_groove_list_output(&result.stdout, &known_worktrees);
        if let Some(row) = rows.get(worktree) {
            if row.opencode_state == "running" {
                if let Some(instance_id) = row.opencode_instance_id.as_deref() {
                    if let Ok(parsed) = parse_pid(instance_id) {
                        pid = Some(parsed);
                        source = Some("runtime".to_string());
                    }
                }
            }
        }
    }

    let Some(pid) = pid else {
        return GrooveStopResponse {
            request_id,
            ok: true,
            already_stopped: Some(true),
            pid: None,
            source: None,
            error: None,
        };
    };

    match stop_process_by_pid(pid) {
        Ok((already_stopped, pid)) => GrooveStopResponse {
            request_id,
            ok: true,
            already_stopped: Some(already_stopped),
            pid: Some(pid),
            source,
            error: None,
        },
        Err(error) => GrooveStopResponse {
            request_id,
            ok: false,
            already_stopped: None,
            pid: Some(pid),
            source,
            error: Some(error),
        },
    }
}

#[tauri::command]
fn testing_environment_get_status(
    app: AppHandle,
    state: State<TestingEnvironmentState>,
    payload: TestingEnvironmentStatusPayload,
) -> TestingEnvironmentResponse {
    let request_id = request_id();
    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(known_worktrees) => known_worktrees,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        None,
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => root,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let mut runtime = match state.runtime.lock() {
        Ok(guard) => guard,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(format!(
                    "Failed to acquire testing environment lock: {error}"
                )),
            }
        }
    };

    if let Err(error) = ensure_testing_runtime_loaded(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    if let Err(error) = reconcile_testing_runtime_and_persist(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }
    build_testing_environment_response(request_id, Some(&workspace_root), &runtime.persisted, None)
}

#[tauri::command]
fn testing_environment_set_target(
    app: AppHandle,
    state: State<TestingEnvironmentState>,
    payload: TestingEnvironmentSetTargetPayload,
) -> TestingEnvironmentResponse {
    let request_id = request_id();
    let enabled = payload.enabled.unwrap_or(true);

    let worktree = payload.worktree.trim();
    if worktree.is_empty() {
        return TestingEnvironmentResponse {
            request_id,
            ok: false,
            workspace_root: None,
            environments: Vec::new(),
            target_worktree: None,
            target_path: None,
            status: "none".to_string(),
            instance_id: None,
            pid: None,
            started_at: None,
            error: Some("worktree is required and must be a non-empty string.".to_string()),
        };
    }
    if !is_safe_path_token(worktree) {
        return TestingEnvironmentResponse {
            request_id,
            ok: false,
            workspace_root: None,
            environments: Vec::new(),
            target_worktree: None,
            target_path: None,
            status: "none".to_string(),
            instance_id: None,
            pid: None,
            started_at: None,
            error: Some("worktree contains unsafe characters or path segments.".to_string()),
        };
    }

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(known_worktrees) => known_worktrees,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        Some(worktree),
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => root,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let mut runtime = match state.runtime.lock() {
        Ok(guard) => guard,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(format!(
                    "Failed to acquire testing environment lock: {error}"
                )),
            }
        }
    };

    if let Err(error) = ensure_testing_runtime_loaded(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    if let Err(error) = reconcile_testing_runtime_and_persist(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    let workspace_root_string = workspace_root.display().to_string();
    if enabled {
        let worktree_path = match ensure_worktree_in_dir(&workspace_root, worktree, ".worktrees") {
            Ok(path) => path,
            Err(error) => {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(error),
                );
            }
        };

        let target = TestingEnvironmentTarget {
            workspace_root: workspace_root_string.clone(),
            worktree: worktree.to_string(),
            worktree_path: worktree_path.display().to_string(),
            updated_at: now_iso(),
        };

        let mut replaced = false;
        for existing in &mut runtime.persisted.targets {
            if existing.workspace_root == workspace_root_string && existing.worktree == worktree {
                *existing = target.clone();
                replaced = true;
                break;
            }
        }
        if !replaced {
            runtime.persisted.targets.push(target.clone());
        }

        let has_running_instance_for_target =
            runtime.persisted.running_instances.iter().any(|instance| {
                instance.workspace_root == workspace_root_string && instance.worktree == worktree
            });
        let has_any_running_in_workspace = runtime
            .persisted
            .running_instances
            .iter()
            .any(|instance| instance.workspace_root == workspace_root_string);

        if payload.auto_start_if_current_running.unwrap_or(false)
            && has_any_running_in_workspace
            && !has_running_instance_for_target
        {
            if let Err(error) = start_testing_instance_for_target(&target, &mut runtime) {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(error),
                );
            }
        }

        runtime.persisted.updated_at = Some(now_iso());
        if let Err(error) = record_worktree_last_executed_at(&app, &workspace_root, worktree) {
            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(error),
            );
        }
    } else {
        runtime.persisted.targets.retain(|target| {
            !(target.workspace_root == workspace_root_string && target.worktree == worktree)
        });
        if let Err(error) = stop_running_testing_instance_for_worktree(
            &mut runtime,
            &workspace_root_string,
            worktree,
        ) {
            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(error),
            );
        }
        runtime.persisted.updated_at = Some(now_iso());
    }

    if let Err(error) = write_persisted_testing_environment_state(&app, &runtime.persisted) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    build_testing_environment_response(request_id, Some(&workspace_root), &runtime.persisted, None)
}

#[tauri::command]
fn testing_environment_start(
    app: AppHandle,
    state: State<TestingEnvironmentState>,
    payload: TestingEnvironmentStartPayload,
) -> TestingEnvironmentResponse {
    let request_id = request_id();

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(known_worktrees) => known_worktrees,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let required_worktree = payload
        .worktree
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if let Some(worktree) = required_worktree {
        if !is_safe_path_token(worktree) {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some("worktree contains unsafe characters or path segments.".to_string()),
            };
        }
    }

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        required_worktree,
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => root,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let mut runtime = match state.runtime.lock() {
        Ok(guard) => guard,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(format!(
                    "Failed to acquire testing environment lock: {error}"
                )),
            }
        }
    };

    if let Err(error) = ensure_testing_runtime_loaded(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    if let Err(error) = reconcile_testing_runtime_and_persist(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    let workspace_root_string = workspace_root.display().to_string();
    if let Some(worktree) = required_worktree {
        let worktree_path = match ensure_worktree_in_dir(&workspace_root, worktree, ".worktrees") {
            Ok(path) => path,
            Err(error) => {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(error),
                );
            }
        };

        let target = TestingEnvironmentTarget {
            workspace_root: workspace_root_string.clone(),
            worktree: worktree.to_string(),
            worktree_path: worktree_path.display().to_string(),
            updated_at: now_iso(),
        };
        runtime.persisted.targets.retain(|existing| {
            !(existing.workspace_root == workspace_root_string && existing.worktree == worktree)
        });
        runtime.persisted.targets.push(target.clone());
        if let Err(error) = start_testing_instance_for_target(&target, &mut runtime) {
            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(error),
            );
        }
        if let Err(error) = record_worktree_last_executed_at(&app, &workspace_root, worktree) {
            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(error),
            );
        }
    } else {
        let targets = runtime
            .persisted
            .targets
            .iter()
            .filter(|target| target.workspace_root == workspace_root_string)
            .cloned()
            .collect::<Vec<_>>();
        if targets.is_empty() {
            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(
                    "Select at least one testing environment target before running locally."
                        .to_string(),
                ),
            );
        }
        for target in targets {
            if let Err(error) = start_testing_instance_for_target(&target, &mut runtime) {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(error),
                );
            }
            if let Err(error) =
                record_worktree_last_executed_at(&app, &workspace_root, &target.worktree)
            {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(error),
                );
            }
        }
    }
    runtime.persisted.updated_at = Some(now_iso());

    if let Err(error) = write_persisted_testing_environment_state(&app, &runtime.persisted) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    build_testing_environment_response(request_id, Some(&workspace_root), &runtime.persisted, None)
}

#[tauri::command]
fn testing_environment_start_separate_terminal(
    app: AppHandle,
    state: State<TestingEnvironmentState>,
    payload: TestingEnvironmentStartPayload,
) -> TestingEnvironmentResponse {
    let request_id = request_id();

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(known_worktrees) => known_worktrees,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let required_worktree = payload
        .worktree
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if let Some(worktree) = required_worktree {
        if !is_safe_path_token(worktree) {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some("worktree contains unsafe characters or path segments.".to_string()),
            };
        }
    }

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        required_worktree,
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => root,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let mut runtime = match state.runtime.lock() {
        Ok(guard) => guard,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(format!(
                    "Failed to acquire testing environment lock: {error}"
                )),
            }
        }
    };

    if let Err(error) = ensure_testing_runtime_loaded(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    if let Err(error) = reconcile_testing_runtime_and_persist(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    let workspace_root_string = workspace_root.display().to_string();
    let mut targets_to_start: Vec<TestingEnvironmentTarget> = Vec::new();
    if let Some(worktree) = required_worktree {
        let worktree_path = match ensure_worktree_in_dir(&workspace_root, worktree, ".worktrees") {
            Ok(path) => path,
            Err(error) => {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(error),
                );
            }
        };
        let target = TestingEnvironmentTarget {
            workspace_root: workspace_root_string.clone(),
            worktree: worktree.to_string(),
            worktree_path: worktree_path.display().to_string(),
            updated_at: now_iso(),
        };
        runtime.persisted.targets.retain(|existing| {
            !(existing.workspace_root == workspace_root_string && existing.worktree == worktree)
        });
        runtime.persisted.targets.push(target.clone());
        targets_to_start.push(target);
    } else {
        targets_to_start = runtime
            .persisted
            .targets
            .iter()
            .filter(|target| target.workspace_root == workspace_root_string)
            .cloned()
            .collect::<Vec<_>>();
        if targets_to_start.is_empty() {
            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(
                    "Select at least one testing environment target before running locally on a separate terminal."
                        .to_string(),
                ),
            );
        }
    }

    let workspace_meta = match ensure_workspace_meta(&workspace_root) {
        Ok((meta, _)) => meta,
        Err(error) => {
            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(error),
            )
        }
    };
    let default_terminal = normalize_default_terminal(&workspace_meta.default_terminal)
        .unwrap_or_else(|_| default_terminal_auto());

    for target in targets_to_start {
        let port = match allocate_testing_port() {
            Ok(value) => value,
            Err(error) => {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(error),
                );
            }
        };
        let (result, command_for_state) = if default_terminal == "custom" {
            let Some(custom_command) = workspace_meta
                .terminal_custom_command
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            else {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(
                        "Default terminal is set to custom, but terminalCustomCommand is empty."
                            .to_string(),
                    ),
                );
            };

            let parsed_command = match parse_custom_terminal_command(
                custom_command,
                Path::new(&target.worktree_path),
            ) {
                Ok(parsed) => parsed,
                Err(error) => {
                    return build_testing_environment_response(
                        request_id,
                        Some(&workspace_root),
                        &runtime.persisted,
                        Some(error),
                    );
                }
            };
            let (program, args) = parsed_command;
            let command_for_state = std::iter::once(program.as_str())
                .chain(args.iter().map(|value| value.as_str()))
                .collect::<Vec<_>>()
                .join(" ");
            (
                run_command_with_worktree_env(
                    &program,
                    &args,
                    &workspace_root,
                    Path::new(&target.worktree_path),
                    Some(port),
                    SEPARATE_TERMINAL_COMMAND_TIMEOUT,
                ),
                command_for_state,
            )
        } else {
            let args = vec![
                "run".to_string(),
                target.worktree.clone(),
                "--terminal".to_string(),
                default_terminal.clone(),
            ];
            (
                run_command_timeout(
                    &groove_binary_path(&app),
                    &args,
                    &workspace_root,
                    SEPARATE_TERMINAL_COMMAND_TIMEOUT,
                    Some(port),
                ),
                format!("groove {}", args.join(" ")),
            )
        };

        if result.exit_code != Some(0) || result.error.is_some() {
            let output_line = result
                .stderr
                .lines()
                .chain(result.stdout.lines())
                .map(str::trim)
                .find(|value| !value.is_empty())
                .map(str::to_string);
            let detail = result
                .error
                .or_else(|| output_line)
                .unwrap_or_else(|| "groove run failed.".to_string());

            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(format!(
                    "Failed to run local testing in a separate terminal for {}: {}",
                    target.worktree, detail
                )),
            );
        }

        if let Err(error) =
            record_worktree_last_executed_at(&app, &workspace_root, &target.worktree)
        {
            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(error),
            );
        }

        runtime.persisted.running_instances.retain(|instance| {
            !(instance.workspace_root == target.workspace_root
                && instance.worktree == target.worktree)
        });
        runtime
            .persisted
            .running_instances
            .push(TestingEnvironmentInstance {
                instance_id: format!("separate-terminal-{}", Uuid::new_v4()),
                pid: 0,
                port: Some(port),
                workspace_root: target.workspace_root.clone(),
                worktree: target.worktree.clone(),
                worktree_path: target.worktree_path.clone(),
                command: command_for_state,
                started_at: now_iso(),
            });
        runtime
            .children_by_worktree
            .remove(&testing_child_key(&target.workspace_root, &target.worktree));
    }
    runtime.persisted.updated_at = Some(now_iso());

    if let Err(error) = write_persisted_testing_environment_state(&app, &runtime.persisted) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    build_testing_environment_response(request_id, Some(&workspace_root), &runtime.persisted, None)
}

#[tauri::command]
fn testing_environment_stop(
    app: AppHandle,
    state: State<TestingEnvironmentState>,
    payload: TestingEnvironmentStopPayload,
) -> TestingEnvironmentResponse {
    let request_id = request_id();

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(known_worktrees) => known_worktrees,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        None,
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => root,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let mut runtime = match state.runtime.lock() {
        Ok(guard) => guard,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(format!(
                    "Failed to acquire testing environment lock: {error}"
                )),
            }
        }
    };

    if let Err(error) = ensure_testing_runtime_loaded(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    if let Err(error) = reconcile_testing_runtime_and_persist(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    let workspace_root_string = workspace_root.display().to_string();
    if let Some(worktree) = payload
        .worktree
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if let Err(error) = stop_running_testing_instance_for_worktree(
            &mut runtime,
            &workspace_root_string,
            worktree,
        ) {
            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(error),
            );
        }
    } else {
        let worktrees = runtime
            .persisted
            .running_instances
            .iter()
            .filter(|instance| instance.workspace_root == workspace_root_string)
            .map(|instance| instance.worktree.clone())
            .collect::<Vec<_>>();
        for worktree in worktrees {
            if let Err(error) = stop_running_testing_instance_for_worktree(
                &mut runtime,
                &workspace_root_string,
                &worktree,
            ) {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(error),
                );
            }
        }
    }
    runtime.persisted.updated_at = Some(now_iso());

    if let Err(error) = write_persisted_testing_environment_state(&app, &runtime.persisted) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    build_testing_environment_response(request_id, Some(&workspace_root), &runtime.persisted, None)
}

#[tauri::command]
fn diagnostics_list_opencode_instances() -> DiagnosticsOpencodeInstancesResponse {
    let request_id = request_id();

    match list_opencode_process_rows() {
        Ok(rows) => DiagnosticsOpencodeInstancesResponse {
            request_id,
            ok: true,
            rows,
            error: None,
        },
        Err(error) => DiagnosticsOpencodeInstancesResponse {
            request_id,
            ok: false,
            rows: Vec::new(),
            error: Some(error),
        },
    }
}

#[tauri::command]
fn diagnostics_stop_process(pid: i32) -> DiagnosticsStopResponse {
    let request_id = request_id();
    if pid <= 0 {
        return DiagnosticsStopResponse {
            request_id,
            ok: false,
            pid: None,
            already_stopped: None,
            error: Some("pid must be a positive integer.".to_string()),
        };
    }

    match stop_process_by_pid(pid) {
        Ok((already_stopped, stopped_pid)) => DiagnosticsStopResponse {
            request_id,
            ok: true,
            pid: Some(stopped_pid),
            already_stopped: Some(already_stopped),
            error: None,
        },
        Err(error) => DiagnosticsStopResponse {
            request_id,
            ok: false,
            pid: Some(pid),
            already_stopped: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
fn diagnostics_stop_all_opencode_instances() -> DiagnosticsStopAllResponse {
    let request_id = request_id();

    let rows = match list_opencode_process_rows() {
        Ok(rows) => rows,
        Err(error) => {
            return DiagnosticsStopAllResponse {
                request_id,
                ok: false,
                attempted: 0,
                stopped: 0,
                already_stopped: 0,
                failed: 0,
                errors: Vec::new(),
                error: Some(error),
            }
        }
    };

    let unique_pids = rows
        .into_iter()
        .map(|row| row.pid)
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    let (stopped, already_stopped, failed, errors) = stop_pid_set(&unique_pids);
    let has_errors = !errors.is_empty();

    DiagnosticsStopAllResponse {
        request_id,
        ok: failed == 0,
        attempted: unique_pids.len(),
        stopped,
        already_stopped,
        failed,
        errors,
        error: if has_errors {
            Some(format!("Failed to stop {} process(es).", failed))
        } else {
            None
        },
    }
}

#[tauri::command]
fn diagnostics_list_worktree_node_apps() -> DiagnosticsNodeAppsResponse {
    let request_id = request_id();

    match list_worktree_node_app_rows() {
        Ok((rows, warning)) => DiagnosticsNodeAppsResponse {
            request_id,
            ok: true,
            rows,
            warning,
            error: None,
        },
        Err(error) => DiagnosticsNodeAppsResponse {
            request_id,
            ok: false,
            rows: Vec::new(),
            warning: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
fn diagnostics_clean_all_dev_servers() -> DiagnosticsStopAllResponse {
    let request_id = request_id();
    let (snapshot_rows, _warning) = match list_process_snapshot_rows() {
        Ok(value) => value,
        Err(error) => {
            return DiagnosticsStopAllResponse {
                request_id,
                ok: false,
                attempted: 0,
                stopped: 0,
                already_stopped: 0,
                failed: 0,
                errors: Vec::new(),
                error: Some(error),
            }
        }
    };

    let pids = snapshot_rows
        .into_iter()
        .filter(|row| {
            is_opencode_process(row.process_name.as_deref(), &row.command)
                || is_worktree_node_process(row.process_name.as_deref(), &row.command)
                || command_matches_turbo_dev(&row.command)
        })
        .map(|row| row.pid)
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    let (stopped, already_stopped, failed, errors) = stop_pid_set(&pids);

    DiagnosticsStopAllResponse {
        request_id,
        ok: failed == 0,
        attempted: pids.len(),
        stopped,
        already_stopped,
        failed,
        errors,
        error: if failed == 0 {
            None
        } else {
            Some(format!(
                "Failed to clean all target processes: {} process(es).",
                failed
            ))
        },
    }
}

#[tauri::command]
fn diagnostics_get_msot_consuming_programs() -> DiagnosticsMostConsumingProgramsResponse {
    let request_id = request_id();

    match get_msot_consuming_programs_output() {
        Ok(output) => DiagnosticsMostConsumingProgramsResponse {
            request_id,
            ok: true,
            output,
            error: None,
        },
        Err(error) => DiagnosticsMostConsumingProgramsResponse {
            request_id,
            ok: false,
            output: String::new(),
            error: Some(error),
        },
    }
}

#[tauri::command]
fn workspace_events(
    app: AppHandle,
    state: State<WorkspaceEventState>,
    payload: WorkspaceEventsPayload,
) -> WorkspaceEventsResponse {
    let request_id = request_id();

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(known_worktrees) => known_worktrees,
        Err(error) => {
            return WorkspaceEventsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                error: Some(error),
            }
        }
    };

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        None,
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => root,
        Err(error) => {
            return WorkspaceEventsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                error: Some(error),
            }
        }
    };

    let poll_targets = {
        let mut targets = vec![
            workspace_root.join(".worktrees"),
            workspace_root.join(".groove"),
            workspace_root.join(".groove").join("workspace.json"),
        ];

        for worktree in &known_worktrees {
            targets.push(
                workspace_root
                    .join(".worktrees")
                    .join(worktree)
                    .join(".groove"),
            );
            targets.push(
                workspace_root
                    .join(".worktrees")
                    .join(worktree)
                    .join(".groove")
                    .join("workspace.json"),
            );
        }

        targets
    };

    let mut worker = match state.worker.lock() {
        Ok(worker) => worker,
        Err(error) => {
            return WorkspaceEventsResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                error: Some(format!("Failed to acquire workspace event lock: {error}")),
            };
        }
    };

    if let Some(previous) = worker.take() {
        previous.stop.store(true, Ordering::Relaxed);
        let _ = previous.handle.join();
    }

    let stop = Arc::new(AtomicBool::new(false));
    let stop_signal = stop.clone();
    let app_handle = app.clone();
    let request_id_clone = request_id.clone();
    let workspace_root_clone = workspace_root.clone();

    let handle = thread::spawn(move || {
        let mut snapshots = HashMap::<PathBuf, SnapshotEntry>::new();
        for target in &poll_targets {
            snapshots.insert(target.clone(), snapshot_entry(target));
        }

        let workspace_root_display = workspace_root_clone.display().to_string();

        let _ = app_handle.emit(
            "workspace-ready",
            serde_json::json!({
                "requestId": request_id_clone,
                "workspaceRoot": workspace_root_clone,
                "kind": "filesystem"
            }),
        );

        let mut index: u64 = 0;
        let mut pending_sources = HashSet::<String>::new();
        let mut last_emit_at = Instant::now()
            .checked_sub(WORKSPACE_EVENTS_MIN_EMIT_INTERVAL)
            .unwrap_or_else(Instant::now);

        while !stop_signal.load(Ordering::Relaxed) {
            for target in &poll_targets {
                let next = snapshot_entry(target);
                let previous = snapshots.get(target).cloned().unwrap_or(SnapshotEntry {
                    exists: false,
                    mtime_ms: 0,
                });

                if previous.exists != next.exists || previous.mtime_ms != next.mtime_ms {
                    snapshots.insert(target.clone(), next);
                    let source = target
                        .strip_prefix(&workspace_root_clone)
                        .map(|value| value.display().to_string())
                        .unwrap_or_else(|_| target.display().to_string());
                    pending_sources.insert(source);
                }
            }

            if !pending_sources.is_empty()
                && last_emit_at.elapsed() >= WORKSPACE_EVENTS_MIN_EMIT_INTERVAL
            {
                index += 1;
                let mut sources = pending_sources.drain().collect::<Vec<_>>();
                sources.sort();
                let source_count = sources.len();

                let _ = app_handle.emit(
                    "workspace-change",
                    serde_json::json!({
                        "index": index,
                        "source": sources.first().cloned().unwrap_or_default(),
                        "sources": sources,
                        "sourceCount": source_count,
                        "workspaceRoot": workspace_root_display,
                        "kind": "filesystem"
                    }),
                );
                last_emit_at = Instant::now();
            }

            thread::sleep(WORKSPACE_EVENTS_POLL_INTERVAL);
        }
    });

    *worker = Some(WorkspaceWorker { stop, handle });

    WorkspaceEventsResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        error: None,
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(WorkspaceEventState::default())
        .manage(TestingEnvironmentState::default())
        .invoke_handler(tauri::generate_handler![
            workspace_pick_and_open,
            workspace_open,
            workspace_get_active,
            workspace_clear_active,
            workspace_update_terminal_settings,
            groove_list,
            groove_new,
            groove_restore,
            groove_rm,
            groove_stop,
            testing_environment_get_status,
            testing_environment_set_target,
            testing_environment_start,
            testing_environment_start_separate_terminal,
            testing_environment_stop,
            diagnostics_list_opencode_instances,
            diagnostics_stop_process,
            diagnostics_stop_all_opencode_instances,
            diagnostics_list_worktree_node_apps,
            diagnostics_clean_all_dev_servers,
            diagnostics_get_msot_consuming_programs,
            workspace_events
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
