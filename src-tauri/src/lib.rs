use portable_pty::{native_pty_system, Child as PtyChild, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use uuid::Uuid;
use walkdir::WalkDir;

mod diagnostics;
mod git_gh;
mod terminal;
mod testing_environment;
mod workspace;

use terminal::GrooveTerminalOpenMode;

const MAX_DISCOVERY_DEPTH: usize = 4;
const MAX_DISCOVERY_DIRECTORIES: usize = 2500;
const SEPARATE_TERMINAL_COMMAND_TIMEOUT: Duration = Duration::from_secs(15);
const COMMAND_TIMEOUT_POLL_INTERVAL: Duration = Duration::from_millis(50);
const WORKSPACE_EVENTS_POLL_INTERVAL: Duration = Duration::from_millis(1800);
const WORKSPACE_EVENTS_MIN_EMIT_INTERVAL: Duration = Duration::from_millis(1200);
const WORKSPACE_EVENTS_STOP_POLL_INTERVAL: Duration = Duration::from_millis(100);
const GROOVE_LIST_CACHE_TTL: Duration = Duration::from_secs(45);
const GROOVE_LIST_CACHE_STALE_TTL: Duration = Duration::from_secs(50);
const DEFAULT_TESTING_ENVIRONMENT_PORTS: [u16; 3] = [3000, 3001, 3002];
const DEFAULT_WORKTREE_SYMLINK_PATHS: [&str; 4] = [".env", ".env.local", ".convex", "node_modules"];
const MIN_TESTING_PORT: u16 = 1;
const MAX_TESTING_PORT: u16 = 65535;
const DEFAULT_PLAY_GROOVE_COMMAND_TEMPLATE: &str =
    "ghostty --working-directory={worktree} -e opencode";
const DEFAULT_RUN_LOCAL_COMMAND: &str = "pnpm run dev";
const SUPPORTED_DEFAULT_TERMINALS: [&str; 8] = [
    "auto", "ghostty", "warp", "kitty", "gnome", "xterm", "none", "custom",
];
const SUPPORTED_THEME_MODES: [&str; 4] = ["light", "groove", "dark-groove", "dark"];
const GITIGNORE_GROOVE_COMMENT: &str = "# Groove";
const GITIGNORE_REQUIRED_ENTRIES: [&str; 2] = [".groove/", ".workspace/"];
const GROOVE_PLAY_COMMAND_SENTINEL: &str = "__groove_terminal__";
const GROOVE_OPEN_TERMINAL_COMMAND_SENTINEL: &str = "__groove_terminal_open__";
const GROOVE_TERMINAL_OUTPUT_EVENT: &str = "groove-terminal-output";
const GROOVE_TERMINAL_LIFECYCLE_EVENT: &str = "groove-terminal-lifecycle";
const DEFAULT_GROOVE_TERMINAL_COLS: u16 = 120;
const DEFAULT_GROOVE_TERMINAL_ROWS: u16 = 34;
const MIN_GROOVE_TERMINAL_DIMENSION: u16 = 10;
const MAX_GROOVE_TERMINAL_DIMENSION: u16 = 500;
const MAX_GROOVE_TERMINAL_SNAPSHOT_BYTES: usize = 256 * 1024;

#[derive(Default)]
struct WorkspaceEventState {
    worker: Mutex<Option<WorkspaceWorker>>,
    worker_generation: Arc<AtomicU64>,
}

#[derive(Default)]
struct TestingEnvironmentState {
    runtime: Mutex<TestingEnvironmentRuntimeState>,
}

#[derive(Default)]
struct WorkspaceContextCacheState {
    entries: Mutex<HashMap<String, WorkspaceContextCacheEntry>>,
}

#[derive(Default)]
struct GrooveListCacheState {
    entries: Mutex<HashMap<String, GrooveListCacheEntry>>,
    in_flight: Mutex<HashMap<String, Arc<GrooveListInFlight>>>,
}

#[derive(Default)]
struct GrooveBinStatusState {
    status: Mutex<Option<GrooveBinCheckStatus>>,
}

#[derive(Default)]
struct GrooveTerminalState {
    inner: Mutex<GrooveTerminalSessionsState>,
}

#[derive(Default)]
struct GrooveTerminalSessionsState {
    sessions_by_id: HashMap<String, GrooveTerminalSessionState>,
    session_ids_by_worktree: HashMap<String, Vec<String>>,
}

struct GrooveTerminalSessionState {
    session_id: String,
    worktree_key: String,
    workspace_root: String,
    worktree: String,
    worktree_path: String,
    command: String,
    started_at: String,
    cols: u16,
    rows: u16,
    child: Box<dyn PtyChild + Send>,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    snapshot: Arc<Mutex<Vec<u8>>>,
}

impl Drop for GrooveTerminalState {
    fn drop(&mut self) {
        let sessions_to_close = match self.inner.lock() {
            Ok(mut sessions_state) => drain_groove_terminal_sessions(&mut sessions_state, None),
            Err(_) => Vec::new(),
        };
        close_groove_terminal_sessions_best_effort(sessions_to_close);
    }
}

#[derive(Default)]
struct TestingEnvironmentRuntimeState {
    loaded: bool,
    persisted: PersistedTestingEnvironmentState,
    children_by_worktree: HashMap<String, std::process::Child>,
}

#[derive(Debug, Clone)]
struct WorkspaceContextCacheEntry {
    signature: WorkspaceContextSignature,
    response: WorkspaceContextResponse,
}

#[derive(Debug, Clone)]
struct GrooveListCacheEntry {
    created_at: Instant,
    response: GrooveListResponse,
    native_cache: Option<GrooveListNativeCache>,
}

#[derive(Debug, Clone)]
struct GrooveListNativeCache {
    rows_by_worktree: HashMap<String, GrooveListNativeCacheRow>,
}

#[derive(Debug, Clone)]
struct GrooveListNativeCacheRow {
    signature: String,
    row: RuntimeStateRow,
}

#[derive(Debug)]
struct GrooveListInFlight {
    response: Mutex<Option<GrooveListResponse>>,
    cvar: Condvar,
}

impl GrooveListInFlight {
    fn new() -> Self {
        Self {
            response: Mutex::new(None),
            cvar: Condvar::new(),
        }
    }
}

struct WorkspaceWorker {
    workspace_root: String,
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
    #[serde(default)]
    tombstones_by_workspace: HashMap<String, HashMap<String, WorktreeTombstone>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorktreeTombstone {
    workspace_root: String,
    worktree: String,
    worktree_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    branch_name: Option<String>,
    deleted_at: String,
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
    telemetry_enabled: Option<bool>,
    disable_groove_loading_section: Option<bool>,
    show_fps: Option<bool>,
    play_groove_command: Option<String>,
    testing_ports: Option<Vec<u16>>,
    open_terminal_at_worktree_command: Option<String>,
    run_local_command: Option<String>,
    worktree_symlink_paths: Option<Vec<String>>,
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
    #[serde(default = "default_true")]
    telemetry_enabled: bool,
    #[serde(default)]
    disable_groove_loading_section: bool,
    #[serde(default)]
    show_fps: bool,
    #[serde(default = "default_play_groove_command")]
    play_groove_command: String,
    #[serde(default = "default_testing_ports")]
    testing_ports: Vec<u16>,
    #[serde(default)]
    open_terminal_at_worktree_command: Option<String>,
    #[serde(default)]
    run_local_command: Option<String>,
    #[serde(default = "default_worktree_symlink_paths")]
    worktree_symlink_paths: Vec<String>,
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
    repository_remote_url: Option<String>,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceGitignoreSanityResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    is_applicable: bool,
    has_groove_entry: bool,
    has_workspace_entry: bool,
    #[serde(default)]
    missing_entries: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    patched: Option<bool>,
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
    telemetry_enabled: Option<bool>,
    disable_groove_loading_section: Option<bool>,
    show_fps: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceCommandSettingsPayload {
    play_groove_command: String,
    testing_ports: Vec<u32>,
    open_terminal_at_worktree_command: Option<String>,
    run_local_command: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceWorktreeSymlinkPathsPayload {
    #[serde(default)]
    worktree_symlink_paths: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceBrowseEntriesPayload {
    relative_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GlobalSettingsUpdatePayload {
    telemetry_enabled: Option<bool>,
    disable_groove_loading_section: Option<bool>,
    show_fps: Option<bool>,
    always_show_diagnostics_sidebar: Option<bool>,
    theme_mode: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitAuthStatusPayload {
    workspace_root: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitPathPayload {
    path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitPullPayload {
    path: String,
    #[serde(default)]
    rebase: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitPushPayload {
    path: String,
    #[serde(default)]
    set_upstream: bool,
    #[serde(default)]
    force_with_lease: bool,
    #[serde(default)]
    branch: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitMergePayload {
    path: String,
    target_branch: String,
    #[serde(default)]
    ff_only: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitCommitPayload {
    path: String,
    #[serde(default)]
    message: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitFilesPayload {
    path: String,
    files: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhDetectRepoPayload {
    path: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct GhAuthStatusPayload {
    #[serde(default)]
    hostname: Option<String>,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    remote_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct GhAuthLogoutPayload {
    #[serde(default)]
    hostname: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPrListPayload {
    owner: String,
    repo: String,
    #[serde(default)]
    hostname: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPrCreatePayload {
    owner: String,
    repo: String,
    base: String,
    head: String,
    title: String,
    body: String,
    #[serde(default)]
    hostname: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhBranchActionPayload {
    path: String,
    branch: String,
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
    workspace_root: Option<String>,
    worktree: String,
    enabled: Option<bool>,
    auto_start_if_current_running: Option<bool>,
    stop_running_processes_when_unset: Option<bool>,
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrooveTerminalOpenPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    worktree: String,
    target: Option<String>,
    open_mode: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
    force_restart: Option<bool>,
    open_new: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrooveTerminalWritePayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    worktree: String,
    session_id: Option<String>,
    input: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrooveTerminalResizePayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    worktree: String,
    session_id: Option<String>,
    cols: u16,
    rows: u16,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrooveTerminalClosePayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    worktree: String,
    session_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrooveTerminalSessionPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    worktree: String,
    session_id: Option<String>,
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
struct ExternalUrlOpenResponse {
    request_id: String,
    ok: bool,
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
struct GrooveTerminalSession {
    session_id: String,
    workspace_root: String,
    worktree: String,
    worktree_path: String,
    command: String,
    started_at: String,
    cols: u16,
    rows: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    snapshot: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GrooveTerminalResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    session: Option<GrooveTerminalSession>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GrooveTerminalSessionsResponse {
    request_id: String,
    ok: bool,
    sessions: Vec<GrooveTerminalSession>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GrooveTerminalOutputEvent {
    session_id: String,
    workspace_root: String,
    worktree: String,
    chunk: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GrooveTerminalLifecycleEvent {
    session_id: String,
    workspace_root: String,
    worktree: String,
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
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
struct WorkspaceBrowseEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceBrowseEntriesResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    relative_path: String,
    entries: Vec<WorkspaceBrowseEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct GlobalSettings {
    #[serde(default = "default_true")]
    telemetry_enabled: bool,
    #[serde(default)]
    disable_groove_loading_section: bool,
    #[serde(default)]
    show_fps: bool,
    #[serde(default)]
    always_show_diagnostics_sidebar: bool,
    #[serde(default = "default_theme_mode")]
    theme_mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GlobalSettingsResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    global_settings: Option<GlobalSettings>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitProfileStatus {
    #[serde(skip_serializing_if = "Option::is_none")]
    user_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_email: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitSshStatus {
    state: String,
    message: String,
}

impl GitSshStatus {
    fn unknown() -> Self {
        Self {
            state: "unknown".to_string(),
            message: "SSH status unavailable".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitAuthStatusResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    profile: GitProfileStatus,
    ssh_status: GitSshStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitStatusResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    modified: u32,
    added: u32,
    deleted: u32,
    untracked: u32,
    dirty: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_snippet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitCurrentBranchResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_snippet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitListBranchesResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(default)]
    branches: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_snippet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitAheadBehindResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    ahead: u32,
    behind: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_snippet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitCommandResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_snippet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitBooleanResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    value: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_snippet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitFileStatesResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(default)]
    staged: Vec<String>,
    #[serde(default)]
    unstaged: Vec<String>,
    #[serde(default)]
    untracked: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_snippet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhDetectRepoResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    repository_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    remote_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    remote_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    owner: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    repo: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name_with_owner: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    repository_url: Option<String>,
    verified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhAuthStatusResponse {
    request_id: String,
    ok: bool,
    installed: bool,
    authenticated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    hostname: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    username: Option<String>,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhAuthLogoutResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    hostname: Option<String>,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhPullRequestItem {
    number: i64,
    title: String,
    state: String,
    head_ref_name: String,
    base_ref_name: String,
    url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhPrListResponse {
    request_id: String,
    ok: bool,
    repository: String,
    #[serde(default)]
    prs: Vec<GhPullRequestItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhPrCreateResponse {
    request_id: String,
    ok: bool,
    repository: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhBranchActionResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhBranchPrItem {
    number: i64,
    title: String,
    url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhCheckBranchPrResponse {
    request_id: String,
    ok: bool,
    branch: String,
    #[serde(default)]
    prs: Vec<GhBranchPrItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    active_pr: Option<GhBranchPrItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TestingEnvironmentEntry {
    worktree: String,
    worktree_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    is_target: bool,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsSystemOverview {
    #[serde(skip_serializing_if = "Option::is_none")]
    cpu_usage_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cpu_cores: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ram_total_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ram_used_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ram_usage_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    swap_total_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    swap_used_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    swap_usage_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    disk_total_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    disk_used_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    disk_usage_percent: Option<f64>,
    platform: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    hostname: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsSystemOverviewResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    overview: Option<DiagnosticsSystemOverview>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GrooveBinCheckStatus {
    #[serde(skip_serializing_if = "Option::is_none")]
    configured_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    configured_path_valid: Option<bool>,
    has_issue: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    issue: Option<String>,
    effective_binary_path: String,
    effective_binary_source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GrooveBinStatusResponse {
    request_id: String,
    ok: bool,
    status: GrooveBinCheckStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GrooveBinRepairResponse {
    request_id: String,
    ok: bool,
    changed: bool,
    action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    cleared_path: Option<String>,
    status: GrooveBinCheckStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone)]
struct GrooveBinaryResolution {
    path: PathBuf,
    source: String,
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

#[derive(Debug, Clone, PartialEq, Eq)]
struct SnapshotEntry {
    exists: bool,
    mtime_ms: u128,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct WorkspaceContextSignature {
    workspace_manifest: SnapshotEntry,
    worktrees_dir: SnapshotEntry,
    worktree_execution_state_file: SnapshotEntry,
}

fn request_id() -> String {
    Uuid::new_v4().to_string()
}

fn default_terminal_auto() -> String {
    "auto".to_string()
}

fn default_true() -> bool {
    true
}

fn default_theme_mode() -> String {
    "groove".to_string()
}

fn default_play_groove_command() -> String {
    DEFAULT_PLAY_GROOVE_COMMAND_TEMPLATE.to_string()
}

fn normalize_terminal_dimension(value: Option<u16>, default: u16) -> u16 {
    terminal::normalize_terminal_dimension(
        value,
        default,
        MIN_GROOVE_TERMINAL_DIMENSION,
        MAX_GROOVE_TERMINAL_DIMENSION,
    )
}

fn is_groove_terminal_play_command(command: &str) -> bool {
    command.trim() == GROOVE_PLAY_COMMAND_SENTINEL
}

fn is_groove_terminal_open_command(command: &str) -> bool {
    command.trim() == GROOVE_OPEN_TERMINAL_COMMAND_SENTINEL
}

fn groove_terminal_session_key(workspace_root: &Path, worktree: &str) -> String {
    format!("{}::{worktree}", workspace_root_storage_key(workspace_root))
}

fn latest_session_id_for_worktree(
    sessions_state: &GrooveTerminalSessionsState,
    worktree_key: &str,
) -> Option<String> {
    sessions_state
        .session_ids_by_worktree
        .get(worktree_key)
        .and_then(|session_ids| session_ids.last())
        .cloned()
}

fn sessions_for_worktree(
    sessions_state: &GrooveTerminalSessionsState,
    worktree_key: &str,
) -> Vec<GrooveTerminalSession> {
    let Some(session_ids) = sessions_state.session_ids_by_worktree.get(worktree_key) else {
        return Vec::new();
    };

    session_ids
        .iter()
        .filter_map(|session_id| sessions_state.sessions_by_id.get(session_id))
        .map(groove_terminal_session_from_state)
        .collect()
}

fn remove_session_by_id(
    sessions_state: &mut GrooveTerminalSessionsState,
    session_id: &str,
) -> Option<GrooveTerminalSessionState> {
    let session = sessions_state.sessions_by_id.remove(session_id)?;

    if let Some(session_ids) = sessions_state
        .session_ids_by_worktree
        .get_mut(&session.worktree_key)
    {
        session_ids.retain(|candidate| candidate != session_id);
        if session_ids.is_empty() {
            sessions_state
                .session_ids_by_worktree
                .remove(&session.worktree_key);
        }
    }

    Some(session)
}

fn drain_groove_terminal_sessions(
    sessions_state: &mut GrooveTerminalSessionsState,
    workspace_root_key: Option<&str>,
) -> Vec<GrooveTerminalSessionState> {
    let session_ids_to_remove = sessions_state
        .sessions_by_id
        .iter()
        .filter_map(|(session_id, session)| {
            let should_remove = workspace_root_key
                .map(|key| workspace_root_storage_key(Path::new(&session.workspace_root)) == key)
                .unwrap_or(true);

            if should_remove {
                Some(session_id.clone())
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    let mut drained = Vec::with_capacity(session_ids_to_remove.len());
    for session_id in session_ids_to_remove {
        if let Some(session) = remove_session_by_id(sessions_state, &session_id) {
            drained.push(session);
        }
    }

    drained
}

fn close_groove_terminal_sessions_best_effort(sessions: Vec<GrooveTerminalSessionState>) {
    for mut session in sessions {
        let _ = session.child.kill();
        let _ = collect_groove_terminal_exit_status(session.child.as_mut());
    }
}

fn groove_terminal_session_from_state(
    session: &GrooveTerminalSessionState,
) -> GrooveTerminalSession {
    GrooveTerminalSession {
        session_id: session.session_id.clone(),
        workspace_root: session.workspace_root.clone(),
        worktree: session.worktree.clone(),
        worktree_path: session.worktree_path.clone(),
        command: session.command.clone(),
        started_at: session.started_at.clone(),
        cols: session.cols,
        rows: session.rows,
        snapshot: None,
    }
}

fn groove_terminal_session_with_snapshot_from_state(
    session: &GrooveTerminalSessionState,
) -> GrooveTerminalSession {
    let snapshot = match session.snapshot.lock() {
        Ok(buffer) => String::from_utf8_lossy(buffer.as_slice()).to_string(),
        Err(_) => String::new(),
    };

    GrooveTerminalSession {
        session_id: session.session_id.clone(),
        workspace_root: session.workspace_root.clone(),
        worktree: session.worktree.clone(),
        worktree_path: session.worktree_path.clone(),
        command: session.command.clone(),
        started_at: session.started_at.clone(),
        cols: session.cols,
        rows: session.rows,
        snapshot: Some(snapshot),
    }
}

fn append_terminal_snapshot(snapshot: &Arc<Mutex<Vec<u8>>>, chunk: &[u8]) {
    let Ok(mut buffer) = snapshot.lock() else {
        return;
    };

    if chunk.len() >= MAX_GROOVE_TERMINAL_SNAPSHOT_BYTES {
        buffer.clear();
        let start = chunk.len() - MAX_GROOVE_TERMINAL_SNAPSHOT_BYTES;
        buffer.extend_from_slice(&chunk[start..]);
        return;
    }

    let total_after_append = buffer.len() + chunk.len();
    if total_after_append > MAX_GROOVE_TERMINAL_SNAPSHOT_BYTES {
        let overflow = total_after_append - MAX_GROOVE_TERMINAL_SNAPSHOT_BYTES;
        buffer.drain(..overflow);
    }

    buffer.extend_from_slice(chunk);
}

fn emit_groove_terminal_lifecycle_event(
    app: &AppHandle,
    session_id: &str,
    workspace_root: &str,
    worktree: &str,
    kind: &str,
    message: Option<String>,
) {
    let _ = app.emit(
        GROOVE_TERMINAL_LIFECYCLE_EVENT,
        GrooveTerminalLifecycleEvent {
            session_id: session_id.to_string(),
            workspace_root: workspace_root.to_string(),
            worktree: worktree.to_string(),
            kind: kind.to_string(),
            message,
        },
    );
}

fn collect_groove_terminal_exit_status(child: &mut (dyn PtyChild + Send)) -> String {
    match child.try_wait() {
        Ok(Some(status)) => format!("exit_status={status:?}"),
        Ok(None) => match child.wait() {
            Ok(status) => format!("exit_status={status:?}"),
            Err(error) => format!("wait_error={error}"),
        },
        Err(error) => format!("try_wait_error={error}"),
    }
}

fn validate_groove_terminal_target(value: Option<&str>) -> Result<Option<String>, String> {
    terminal::validate_groove_terminal_target(value)
}

fn validate_groove_terminal_open_mode(value: Option<&str>) -> Result<GrooveTerminalOpenMode, String> {
    terminal::validate_groove_terminal_open_mode(value)
}

#[cfg(target_os = "windows")]
fn resolve_plain_terminal_command() -> (String, Vec<String>) {
    let program = std::env::var("COMSPEC")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "cmd.exe".to_string());
    (program, Vec::new())
}

#[cfg(not(target_os = "windows"))]
fn resolve_plain_terminal_command() -> (String, Vec<String>) {
    let program = std::env::var("SHELL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "/bin/bash".to_string());
    (program, Vec::new())
}

fn augmented_child_path() -> Option<String> {
    let mut paths = std::env::var_os("PATH")
        .map(|value| std::env::split_paths(&value).collect::<Vec<_>>())
        .unwrap_or_default();

    if let Some(home) = std::env::var_os("HOME") {
        let opencode_bin = PathBuf::from(home).join(".opencode").join("bin");
        if opencode_bin.is_dir() && !paths.iter().any(|candidate| candidate == &opencode_bin) {
            paths.push(opencode_bin);
        }
    }

    std::env::join_paths(paths)
        .ok()
        .map(|value| value.to_string_lossy().to_string())
}

fn resolve_opencode_bin() -> String {
    std::env::var("OPENCODE_BIN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "opencode".to_string())
}

fn resolve_terminal_worktree_context(
    app: &AppHandle,
    root_name: &Option<String>,
    known_worktrees: &[String],
    workspace_meta: &Option<WorkspaceMetaContext>,
    worktree: &str,
) -> Result<(PathBuf, PathBuf), String> {
    if !is_safe_path_token(worktree) {
        return Err("worktree contains unsafe characters or path segments.".to_string());
    }

    let known_worktrees = validate_known_worktrees(known_worktrees)?;
    let workspace_root = resolve_workspace_root(
        app,
        root_name,
        Some(worktree),
        &known_worktrees,
        workspace_meta,
    )?;
    let worktree_path = ensure_worktree_in_dir(&workspace_root, worktree, ".worktrees")?;

    Ok((workspace_root, worktree_path))
}

fn resolve_terminal_session_id(
    sessions_state: &GrooveTerminalSessionsState,
    worktree_key: &str,
    requested_session_id: Option<&str>,
) -> Result<String, String> {
    if let Some(session_id) = requested_session_id
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
    {
        let belongs_to_worktree = sessions_state
            .sessions_by_id
            .get(session_id)
            .map(|session| session.worktree_key == worktree_key)
            .unwrap_or(false);
        if belongs_to_worktree {
            return Ok(session_id.to_string());
        }
        return Err(format!(
            "No active Groove terminal session found for sessionId={session_id}."
        ));
    }

    latest_session_id_for_worktree(sessions_state, worktree_key).ok_or_else(|| {
        "No active Groove terminal session found for this worktree.".to_string()
    })
}

fn open_groove_terminal_session(
    app: &AppHandle,
    state: &State<GrooveTerminalState>,
    workspace_root: &Path,
    worktree: &str,
    worktree_path: &Path,
    open_mode: GrooveTerminalOpenMode,
    target: Option<&str>,
    cols: Option<u16>,
    rows: Option<u16>,
    force_restart: bool,
    open_new: bool,
) -> Result<GrooveTerminalSession, String> {
    let telemetry_enabled = telemetry_enabled_for_app(app);
    let worktree_key = groove_terminal_session_key(workspace_root, worktree);
    let workspace_root_rendered = workspace_root.display().to_string();
    let cols = normalize_terminal_dimension(cols, DEFAULT_GROOVE_TERMINAL_COLS);
    let rows = normalize_terminal_dimension(rows, DEFAULT_GROOVE_TERMINAL_ROWS);
    let target_rendered = target
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("<none>");

    let (program, args) = match open_mode {
        GrooveTerminalOpenMode::Opencode => (resolve_opencode_bin(), Vec::new()),
        GrooveTerminalOpenMode::RunLocal => {
            let run_local_command = run_local_command_for_workspace(workspace_root);
            let command_template = run_local_command
                .as_deref()
                .unwrap_or(DEFAULT_RUN_LOCAL_COMMAND);
            resolve_run_local_command(command_template, worktree_path)?
        }
        GrooveTerminalOpenMode::Plain => resolve_plain_terminal_command(),
    };
    let command_rendered = std::iter::once(program.as_str())
        .chain(args.iter().map(|value| value.as_str()))
        .collect::<Vec<_>>()
        .join(" ");
    let worktree_cwd_rendered = worktree_path.display().to_string();

    log_play_telemetry(
        telemetry_enabled,
        "terminal.open.start",
        format!(
            "workspace_root={} worktree={} target={} command={} cwd={} cols={} rows={} force_restart={} open_new={}",
            workspace_root_rendered,
            worktree,
            target_rendered,
            command_rendered,
            worktree_cwd_rendered,
            cols,
            rows,
            force_restart,
            open_new
        )
        .as_str(),
    );

    let mut sessions_to_close = Vec::new();
    {
        let mut sessions_state = state
            .inner
            .lock()
            .map_err(|error| {
                log_play_telemetry(
                    telemetry_enabled,
                    "terminal.open.lock_error",
                    format!("worktree={} error={error}", worktree).as_str(),
                );
                format!("Failed to acquire Groove terminal state lock: {error}")
            })?;

        if force_restart {
            let existing_ids = sessions_state
                .session_ids_by_worktree
                .get(&worktree_key)
                .cloned()
                .unwrap_or_default();
            for existing_id in existing_ids {
                if let Some(previous_session) = remove_session_by_id(&mut sessions_state, &existing_id) {
                    sessions_to_close.push(previous_session);
                }
            }

            if !sessions_to_close.is_empty() {
                log_play_telemetry(
                    telemetry_enabled,
                    "terminal.open.force_restart",
                    format!(
                        "workspace_root={} worktree={} previous_session_count={}",
                        workspace_root_rendered,
                        worktree,
                        sessions_to_close.len()
                    )
                    .as_str(),
                );
            }
        } else if !open_new {
            if let Some(existing_id) = latest_session_id_for_worktree(&sessions_state, &worktree_key) {
                if let Some(existing) = sessions_state.sessions_by_id.get(&existing_id) {
                    log_play_telemetry(
                        telemetry_enabled,
                        "terminal.open.reused",
                        format!(
                            "workspace_root={} worktree={} session_id={}",
                            workspace_root_rendered, worktree, existing.session_id
                        )
                        .as_str(),
                    );
                    return Ok(groove_terminal_session_from_state(existing));
                }
            }
        }
    }

    for mut previous_session in sessions_to_close {
        let previous_session_id = previous_session.session_id.clone();
        let kill_detail = match previous_session.child.kill() {
            Ok(()) => "kill=ok".to_string(),
            Err(error) => format!("kill_error={error}"),
        };
        let exit_detail = collect_groove_terminal_exit_status(previous_session.child.as_mut());
        let close_detail = format!("reason=restart {kill_detail} {exit_detail}");
        drop(previous_session);

        log_play_telemetry(
            telemetry_enabled,
            "terminal.session.closed",
            format!(
                "workspace_root={} worktree={} session_id={} {}",
                workspace_root_rendered, worktree, previous_session_id, close_detail
            )
            .as_str(),
        );
        emit_groove_terminal_lifecycle_event(
            app,
            &previous_session_id,
            &workspace_root_rendered,
            worktree,
            "closed",
            Some("Session restarted.".to_string()),
        );
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| {
            log_play_telemetry(
                telemetry_enabled,
                "terminal.open.pty_error",
                format!("workspace_root={} worktree={} error={error}", workspace_root_rendered, worktree)
                    .as_str(),
            );
            format!("Failed to create PTY for Groove terminal: {error}")
        })?;

    // Keep sentinel mode aligned with external Play defaults by targeting via cwd,
    // not by passing the branch target as an opencode positional argument.
    let mut spawn_command = CommandBuilder::new(&program);
    for arg in args {
        spawn_command.arg(arg);
    }
    spawn_command.cwd(worktree_path);
    spawn_command.env("GROOVE_WORKTREE", worktree_path.display().to_string());
    if let Some(path) = augmented_child_path() {
        spawn_command.env("PATH", path);
    }

    let child = pair
        .slave
        .spawn_command(spawn_command)
        .map_err(|error| {
            log_play_telemetry(
                telemetry_enabled,
                "terminal.open.spawn_error",
                format!("workspace_root={} worktree={} error={error}", workspace_root_rendered, worktree)
                    .as_str(),
            );
            format!("Failed to spawn in-app terminal command in Groove terminal: {error}")
        })?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| {
            log_play_telemetry(
                telemetry_enabled,
                "terminal.open.reader_attach_error",
                format!("workspace_root={} worktree={} error={error}", workspace_root_rendered, worktree)
                    .as_str(),
            );
            format!("Failed to attach Groove terminal reader: {error}")
        })?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| {
            log_play_telemetry(
                telemetry_enabled,
                "terminal.open.writer_attach_error",
                format!("workspace_root={} worktree={} error={error}", workspace_root_rendered, worktree)
                    .as_str(),
            );
            format!("Failed to attach Groove terminal writer: {error}")
        })?;

    let session_id = Uuid::new_v4().to_string();
    let snapshot = Arc::new(Mutex::new(Vec::new()));
    let session = GrooveTerminalSessionState {
        session_id: session_id.clone(),
        worktree_key: worktree_key.clone(),
        workspace_root: workspace_root_rendered.clone(),
        worktree: worktree.to_string(),
        worktree_path: worktree_cwd_rendered.clone(),
        command: command_rendered.clone(),
        started_at: now_iso(),
        cols,
        rows,
        child,
        master: pair.master,
        writer,
        snapshot: snapshot.clone(),
    };

    {
        let mut sessions_state = state
            .inner
            .lock()
            .map_err(|error| {
                log_play_telemetry(
                    telemetry_enabled,
                    "terminal.open.store_lock_error",
                    format!("worktree={} error={error}", worktree).as_str(),
                );
                format!("Failed to acquire Groove terminal state lock: {error}")
            })?;
        sessions_state
            .session_ids_by_worktree
            .entry(worktree_key.clone())
            .or_default()
            .push(session_id.clone());
        sessions_state.sessions_by_id.insert(session_id.clone(), session);
    }

    log_play_telemetry(
        telemetry_enabled,
        "terminal.open.created",
        format!(
            "workspace_root={} worktree={} session_id={} target={} command={} cwd={}",
            workspace_root_rendered,
            worktree,
            session_id,
            target_rendered,
            command_rendered,
            worktree_cwd_rendered
        )
        .as_str(),
    );

    let app_handle = app.clone();
    let session_id_clone = session_id.clone();
    let workspace_root_clone = workspace_root_rendered.clone();
    let worktree_clone = worktree.to_string();
    let telemetry_enabled_clone = telemetry_enabled;
    let snapshot_clone = snapshot.clone();
    thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    let state = app_handle.state::<GrooveTerminalState>();
                    let mut close_detail = "reason=eof".to_string();
                    let mut closed_command: Option<String> = None;
                    let mut closed_cwd: Option<String> = None;
                    if let Ok(mut sessions_state) = state.inner.lock() {
                        if let Some(mut closed_session) =
                            remove_session_by_id(&mut sessions_state, &session_id_clone)
                        {
                            closed_command = Some(closed_session.command.clone());
                            closed_cwd = Some(closed_session.worktree_path.clone());
                            close_detail = format!(
                                "reason=eof {}",
                                collect_groove_terminal_exit_status(closed_session.child.as_mut())
                            );
                        } else {
                            close_detail = "reason=eof already_closed=true".to_string();
                        }
                    }
                    if let Some(command) = closed_command {
                        let cwd = closed_cwd.unwrap_or_else(|| workspace_root_clone.clone());
                        let _ = app_handle.emit(
                            GROOVE_TERMINAL_OUTPUT_EVENT,
                            GrooveTerminalOutputEvent {
                                session_id: session_id_clone.clone(),
                                workspace_root: workspace_root_clone.clone(),
                                worktree: worktree_clone.clone(),
                                chunk: format!(
                                    "\r\n[groove] session ended: command=\"{}\" cwd=\"{}\" {}\r\n",
                                    command, cwd, close_detail
                                ),
                            },
                        );
                    }
                    log_play_telemetry(
                        telemetry_enabled_clone,
                        "terminal.session.closed",
                        format!(
                            "workspace_root={} worktree={} session_id={} {}",
                            workspace_root_clone, worktree_clone, session_id_clone, close_detail
                        )
                        .as_str(),
                    );
                    invalidate_groove_list_cache_for_workspace(
                        &app_handle,
                        Path::new(&workspace_root_clone),
                    );
                    emit_groove_terminal_lifecycle_event(
                        &app_handle,
                        &session_id_clone,
                        &workspace_root_clone,
                        &worktree_clone,
                        "closed",
                        Some(format!("Terminal session ended ({close_detail}).")),
                    );
                    break;
                }
                Ok(count) => {
                    append_terminal_snapshot(&snapshot_clone, &buffer[..count]);
                    let chunk = String::from_utf8_lossy(&buffer[..count]).to_string();
                    let _ = app_handle.emit(
                        GROOVE_TERMINAL_OUTPUT_EVENT,
                        GrooveTerminalOutputEvent {
                            session_id: session_id_clone.clone(),
                            workspace_root: workspace_root_clone.clone(),
                            worktree: worktree_clone.clone(),
                            chunk,
                        },
                    );
                }
                Err(error) => {
                    let state = app_handle.state::<GrooveTerminalState>();
                    let mut close_detail = format!("reason=read_error read_error={error}");
                    let mut closed_command: Option<String> = None;
                    let mut closed_cwd: Option<String> = None;
                    if let Ok(mut sessions_state) = state.inner.lock() {
                        if let Some(mut closed_session) =
                            remove_session_by_id(&mut sessions_state, &session_id_clone)
                        {
                            closed_command = Some(closed_session.command.clone());
                            closed_cwd = Some(closed_session.worktree_path.clone());
                            close_detail = format!(
                                "reason=read_error read_error={} {}",
                                error,
                                collect_groove_terminal_exit_status(closed_session.child.as_mut())
                            );
                        } else {
                            close_detail =
                                format!("reason=read_error read_error={} already_closed=true", error);
                        }
                    }
                    if let Some(command) = closed_command {
                        let cwd = closed_cwd.unwrap_or_else(|| workspace_root_clone.clone());
                        let _ = app_handle.emit(
                            GROOVE_TERMINAL_OUTPUT_EVENT,
                            GrooveTerminalOutputEvent {
                                session_id: session_id_clone.clone(),
                                workspace_root: workspace_root_clone.clone(),
                                worktree: worktree_clone.clone(),
                                chunk: format!(
                                    "\r\n[groove] session error: command=\"{}\" cwd=\"{}\" {}\r\n",
                                    command, cwd, close_detail
                                ),
                            },
                        );
                    }
                    log_play_telemetry(
                        telemetry_enabled_clone,
                        "terminal.session.read_error",
                        format!(
                            "workspace_root={} worktree={} session_id={} {}",
                            workspace_root_clone, worktree_clone, session_id_clone, close_detail
                        )
                        .as_str(),
                    );
                    invalidate_groove_list_cache_for_workspace(
                        &app_handle,
                        Path::new(&workspace_root_clone),
                    );
                    emit_groove_terminal_lifecycle_event(
                        &app_handle,
                        &session_id_clone,
                        &workspace_root_clone,
                        &worktree_clone,
                        "error",
                        Some(format!("Terminal read failed ({close_detail}).")),
                    );
                    break;
                }
            }
        }
    });

    emit_groove_terminal_lifecycle_event(
        app,
        &session_id,
        &workspace_root_rendered,
        worktree,
        "started",
        Some("Terminal session started.".to_string()),
    );

    log_play_telemetry(
        telemetry_enabled,
        "terminal.session.started",
        format!(
            "workspace_root={} worktree={} session_id={}",
            workspace_root_rendered, worktree, session_id
        )
        .as_str(),
    );
    invalidate_groove_list_cache_for_workspace(app, workspace_root);

    let sessions_state = state
        .inner
        .lock()
        .map_err(|error| {
            log_play_telemetry(
                telemetry_enabled,
                "terminal.open.final_lock_error",
                format!("worktree={} error={error}", worktree).as_str(),
            );
            format!("Failed to acquire Groove terminal state lock: {error}")
        })?;
    let Some(stored) = sessions_state.sessions_by_id.get(&session_id) else {
        log_play_telemetry(
            telemetry_enabled,
            "terminal.open.missing_after_create",
            format!("workspace_root={} worktree={}", workspace_root_rendered, worktree).as_str(),
        );
        return Err("Groove terminal session failed to initialize.".to_string());
    };
    Ok(groove_terminal_session_from_state(stored))
}

fn default_testing_ports() -> Vec<u16> {
    DEFAULT_TESTING_ENVIRONMENT_PORTS.to_vec()
}

fn default_worktree_symlink_paths() -> Vec<String> {
    DEFAULT_WORKTREE_SYMLINK_PATHS
        .iter()
        .map(|value| value.to_string())
        .collect()
}

fn normalize_default_terminal(value: &str) -> Result<String, String> {
    workspace::normalize_default_terminal(value, &SUPPORTED_DEFAULT_TERMINALS)
}

fn normalize_theme_mode(value: &str) -> Result<String, String> {
    workspace::normalize_theme_mode(value, &SUPPORTED_THEME_MODES)
}

fn parse_terminal_command_tokens(command: &str) -> Result<Vec<String>, String> {
    terminal::parse_terminal_command_tokens(command)
}

fn parse_play_groove_command_tokens(command: &str) -> Result<Vec<String>, String> {
    terminal::parse_play_groove_command_tokens(command)
}

fn normalize_play_groove_command(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("playGrooveCommand must be a non-empty string.".to_string());
    }
    if is_groove_terminal_play_command(trimmed) {
        return Ok(trimmed.to_string());
    }
    parse_play_groove_command_tokens(trimmed)?;
    Ok(trimmed.to_string())
}

fn normalize_open_terminal_at_worktree_command(
    value: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(trimmed) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    if is_groove_terminal_open_command(trimmed) {
        return Ok(Some(trimmed.to_string()));
    }

    parse_terminal_command_tokens(trimmed).map_err(|error| {
        error.replace(
            "terminalCustomCommand",
            "openTerminalAtWorktreeCommand",
        )
    })?;

    Ok(Some(trimmed.to_string()))
}

fn normalize_run_local_command(value: Option<&str>) -> Result<Option<String>, String> {
    let Some(trimmed) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    parse_terminal_command_tokens(trimmed)
        .map_err(|error| error.replace("terminalCustomCommand", "runLocalCommand"))?;

    Ok(Some(trimmed.to_string()))
}

fn normalize_testing_ports_from_u16(ports: &[u16]) -> Vec<u16> {
    testing_environment::normalize_testing_ports_from_u16(
        ports,
        MIN_TESTING_PORT,
        MAX_TESTING_PORT,
        &DEFAULT_TESTING_ENVIRONMENT_PORTS,
    )
}

fn normalize_testing_ports_from_u32(ports: &[u32]) -> Vec<u16> {
    testing_environment::normalize_testing_ports_from_u32(
        ports,
        MIN_TESTING_PORT,
        MAX_TESTING_PORT,
        &DEFAULT_TESTING_ENVIRONMENT_PORTS,
    )
}

fn normalize_worktree_symlink_paths(paths: &[String]) -> Vec<String> {
    workspace::normalize_worktree_symlink_paths(paths)
}

fn validate_worktree_symlink_paths(paths: &[String]) -> Result<Vec<String>, String> {
    workspace::validate_worktree_symlink_paths(paths)
}

fn resolve_play_groove_command(
    command_template: &str,
    target: &str,
    worktree_path: &Path,
) -> Result<(String, Vec<String>), String> {
    let tokens = parse_play_groove_command_tokens(command_template)?;
    let worktree = worktree_path.display().to_string();
    let contains_worktree_placeholder = tokens.iter().any(|token| token.contains("{worktree}"));
    let contains_target_placeholder = tokens.iter().any(|token| token.contains("{target}"));

    let mut resolved_tokens = tokens
        .into_iter()
        .map(|token| {
            token
                .replace("{worktree}", &worktree)
                .replace("{target}", target)
        })
        .collect::<Vec<_>>();
    if !contains_worktree_placeholder && !contains_target_placeholder {
        resolved_tokens.push(target.to_string());
    }

    let Some((program, args)) = resolved_tokens.split_first() else {
        return Err("playGrooveCommand must include an executable command.".to_string());
    };

    Ok((program.to_string(), args.to_vec()))
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

fn resolve_run_local_command(
    command_template: &str,
    worktree_path: &Path,
) -> Result<(String, Vec<String>), String> {
    let tokens = parse_terminal_command_tokens(command_template)
        .map_err(|error| error.replace("terminalCustomCommand", "runLocalCommand"))?;
    let worktree = worktree_path.display().to_string();
    let resolved_tokens = tokens
        .into_iter()
        .map(|token| token.replace("{worktree}", &worktree))
        .collect::<Vec<_>>();

    let Some((program, args)) = resolved_tokens.split_first() else {
        return Err("runLocalCommand must include an executable command.".to_string());
    };

    Ok((program.to_string(), args.to_vec()))
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

fn spawn_terminal_process(
    binary: &str,
    args: &[String],
    cwd: &Path,
    worktree_path: &Path,
) -> Result<(), std::io::Error> {
    let mut command = Command::new(binary);
    command
        .args(args)
        .current_dir(cwd)
        .env("GROOVE_WORKTREE", worktree_path.display().to_string());
    if let Some(path) = augmented_child_path() {
        command.env("PATH", path);
    }
    command.spawn().map(|_| ())
}

fn launch_plain_terminal(
    worktree_path: &Path,
    default_terminal: &str,
    terminal_custom_command: Option<&str>,
) -> Result<String, String> {
    let worktree = worktree_path.display().to_string();

    if default_terminal == "custom" {
        let Some(custom_command) = terminal_custom_command
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            return Err(
                "Default terminal is set to custom, but terminalCustomCommand is empty."
                    .to_string(),
            );
        };

        let (program, args) = parse_custom_terminal_command(custom_command, worktree_path)?;
        spawn_terminal_process(&program, &args, worktree_path, worktree_path).map_err(|error| {
            format!("Failed to launch terminal command {program}: {error}")
        })?;

        let command = std::iter::once(program.as_str())
            .chain(args.iter().map(|value| value.as_str()))
            .collect::<Vec<_>>()
            .join(" ");
        return Ok(command);
    }

    let normalized_terminal = if default_terminal == "none" {
        "auto"
    } else {
        default_terminal
    };

    let mut candidates: Vec<(String, Vec<String>)> = match normalized_terminal {
        "ghostty" => vec![(
            "ghostty".to_string(),
            vec![format!("--working-directory={worktree}")],
        )],
        "warp" => vec![(
            "warp".to_string(),
            vec!["--working-directory".to_string(), worktree.clone()],
        )],
        "kitty" => vec![(
            "kitty".to_string(),
            vec!["--directory".to_string(), worktree.clone()],
        )],
        "gnome" => vec![(
            "gnome-terminal".to_string(),
            vec![format!("--working-directory={worktree}")],
        )],
        "xterm" => vec![("xterm".to_string(), Vec::new())],
        "auto" => {
            #[allow(unused_mut)]
            let mut terminals = vec![
                (
                    "ghostty".to_string(),
                    vec![format!("--working-directory={worktree}")],
                ),
                (
                    "warp".to_string(),
                    vec!["--working-directory".to_string(), worktree.clone()],
                ),
                (
                    "kitty".to_string(),
                    vec!["--directory".to_string(), worktree.clone()],
                ),
                (
                    "gnome-terminal".to_string(),
                    vec![format!("--working-directory={worktree}")],
                ),
                ("xterm".to_string(), Vec::new()),
                ("x-terminal-emulator".to_string(), Vec::new()),
            ];
            #[cfg(target_os = "macos")]
            terminals.push((
                "open".to_string(),
                vec!["-a".to_string(), "Terminal".to_string(), worktree.clone()],
            ));
            #[cfg(target_os = "windows")]
            terminals.push((
                "cmd".to_string(),
                vec![
                    "/C".to_string(),
                    "start".to_string(),
                    "".to_string(),
                    "cmd".to_string(),
                ],
            ));
            terminals
        }
        _ => {
            return Err(format!(
                "Unsupported default terminal \"{default_terminal}\" for terminal launch."
            ))
        }
    };

    let mut launch_errors: Vec<String> = Vec::new();
    for (program, args) in candidates.drain(..) {
        match spawn_terminal_process(&program, &args, worktree_path, worktree_path) {
            Ok(()) => {
                let command = std::iter::once(program.as_str())
                    .chain(args.iter().map(|value| value.as_str()))
                    .collect::<Vec<_>>()
                    .join(" ");
                return Ok(command);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                launch_errors.push(format!("{program}: {error}"));
            }
        }
    }

    if launch_errors.is_empty() {
        Err("No supported terminal application was found to open this worktree.".to_string())
    } else {
        Err(format!(
            "Failed to open terminal for this worktree: {}",
            launch_errors.join(" | ")
        ))
    }
}

fn launch_open_terminal_at_worktree_command(
    worktree_path: &Path,
    workspace_meta: &WorkspaceMeta,
) -> Result<String, String> {
    if let Some(command_override) = workspace_meta
        .open_terminal_at_worktree_command
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if is_groove_terminal_open_command(command_override) {
            return launch_plain_terminal(
                worktree_path,
                &workspace_meta.default_terminal,
                workspace_meta.terminal_custom_command.as_deref(),
            );
        }

        let (program, args) = parse_custom_terminal_command(command_override, worktree_path)?;
        spawn_terminal_process(&program, &args, worktree_path, worktree_path).map_err(|error| {
            format!("Failed to launch terminal command {program}: {error}")
        })?;

        return Ok(
            std::iter::once(program.as_str())
                .chain(args.iter().map(|value| value.as_str()))
                .collect::<Vec<_>>()
                .join(" "),
        );
    }

    launch_plain_terminal(
        worktree_path,
        &workspace_meta.default_terminal,
        workspace_meta.terminal_custom_command.as_deref(),
    )
}

fn is_restricted_worktree_symlink_path(path: &str) -> bool {
    workspace::is_restricted_worktree_symlink_path(path)
}

fn is_safe_path_token(value: &str) -> bool {
    workspace::is_safe_path_token(value)
}

fn is_valid_root_name(value: &str) -> bool {
    !value.trim().is_empty()
        && !value.contains('/')
        && !value.contains('\\')
        && value != "."
        && value != ".."
}

fn validate_known_worktrees(known_worktrees: &[String]) -> Result<Vec<String>, String> {
    workspace::validate_known_worktrees(known_worktrees)
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

fn normalize_browse_relative_path(value: Option<&str>) -> Result<String, String> {
    workspace::normalize_browse_relative_path(value)
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

fn default_global_settings() -> GlobalSettings {
    GlobalSettings {
        telemetry_enabled: true,
        disable_groove_loading_section: false,
        show_fps: false,
        always_show_diagnostics_sidebar: false,
        theme_mode: default_theme_mode(),
    }
}

fn play_groove_command_for_workspace(workspace_root: &Path) -> String {
    ensure_workspace_meta(workspace_root)
        .map(|(workspace_meta, _)| {
            normalize_play_groove_command(&workspace_meta.play_groove_command)
                .unwrap_or_else(|_| default_play_groove_command())
        })
        .unwrap_or_else(|_| default_play_groove_command())
}

fn testing_ports_for_workspace(workspace_root: &Path) -> Vec<u16> {
    ensure_workspace_meta(workspace_root)
        .map(|(workspace_meta, _)| normalize_testing_ports_from_u16(&workspace_meta.testing_ports))
        .unwrap_or_else(|_| default_testing_ports())
}

fn run_local_command_for_workspace(workspace_root: &Path) -> Option<String> {
    ensure_workspace_meta(workspace_root)
        .ok()
        .and_then(|(workspace_meta, _)| {
            normalize_run_local_command(workspace_meta.run_local_command.as_deref()).unwrap_or(None)
        })
}

fn worktree_symlink_paths_for_workspace(workspace_root: &Path) -> Vec<String> {
    ensure_workspace_meta(workspace_root)
        .map(|(workspace_meta, _)| {
            normalize_worktree_symlink_paths(&workspace_meta.worktree_symlink_paths)
        })
        .unwrap_or_else(|_| default_worktree_symlink_paths())
}

fn create_symlink(source: &Path, destination: &Path) -> Result<(), std::io::Error> {
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

fn apply_configured_worktree_symlinks(workspace_root: &Path, worktree_path: &Path) -> Vec<String> {
    let mut warnings = Vec::new();
    let configured_paths = worktree_symlink_paths_for_workspace(workspace_root);

    for relative_path in configured_paths {
        if is_restricted_worktree_symlink_path(&relative_path) {
            warnings.push(format!(
                "Skipped restricted symlink path \"{}\".",
                relative_path
            ));
            continue;
        }

        let source_path = workspace_root.join(&relative_path);
        if !source_path.exists() {
            continue;
        }

        let destination_path = worktree_path.join(&relative_path);
        if destination_path == source_path || destination_path.starts_with(&source_path) {
            warnings.push(format!(
                "Skipped symlink \"{}\" because it would create a recursive or self-referential link.",
                relative_path
            ));
            continue;
        }

        if destination_path.exists() || fs::symlink_metadata(&destination_path).is_ok() {
            continue;
        }

        if let Some(parent) = destination_path.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                warnings.push(format!(
                    "Could not prepare destination for symlink \"{}\": {error}",
                    relative_path
                ));
                continue;
            }
        }

        if let Err(error) = create_symlink(&source_path, &destination_path) {
            warnings.push(format!(
                "Could not symlink \"{}\" into worktree: {error}",
                relative_path
            ));
        }
    }

    warnings
}

fn global_settings_file(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;
    Ok(app_data_dir.join("global-settings.json"))
}

fn write_global_settings_file(path: &Path, global_settings: &GlobalSettings) -> Result<(), String> {
    let body = serde_json::to_string_pretty(global_settings)
        .map_err(|error| format!("Failed to serialize global settings: {error}"))?;
    fs::write(path, format!("{body}\n"))
        .map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

fn seed_global_settings_from_active_workspace(app: &AppHandle, settings: &mut GlobalSettings) {
    let Some(persisted_root) = read_persisted_active_workspace_root(app).ok().flatten() else {
        return;
    };
    let Ok(workspace_root) = validate_workspace_root_path(&persisted_root) else {
        return;
    };
    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    if !path_is_file(&workspace_json) {
        return;
    }

    if let Ok(workspace_meta) = read_workspace_meta_file(&workspace_json) {
        settings.telemetry_enabled = workspace_meta.telemetry_enabled;
        settings.disable_groove_loading_section = workspace_meta.disable_groove_loading_section;
        settings.show_fps = workspace_meta.show_fps;
    }
}

fn ensure_global_settings(app: &AppHandle) -> Result<GlobalSettings, String> {
    let settings_file = global_settings_file(app)?;
    if !path_is_file(&settings_file) {
        let mut settings = default_global_settings();
        seed_global_settings_from_active_workspace(app, &mut settings);
        write_global_settings_file(&settings_file, &settings)?;
        return Ok(settings);
    }

    let raw = fs::read_to_string(&settings_file)
        .map_err(|error| format!("Failed to read {}: {error}", settings_file.display()))?;
    let parsed = serde_json::from_str::<serde_json::Value>(&raw).map_err(|_| {
        let settings = default_global_settings();
        let _ = write_global_settings_file(&settings_file, &settings);
        format!(
            "Failed to parse {}. Recovered with defaults.",
            settings_file.display()
        )
    });

    let parsed = match parsed {
        Ok(value) => value,
        Err(_) => {
            return Ok(default_global_settings());
        }
    };

    let mut settings = match serde_json::from_value::<GlobalSettings>(parsed.clone()) {
        Ok(value) => value,
        Err(_) => {
            let settings = default_global_settings();
            let _ = write_global_settings_file(&settings_file, &settings);
            return Ok(settings);
        }
    };

    let mut should_write_back = parsed
        .as_object()
        .map(|obj| {
            !obj.contains_key("telemetryEnabled")
                || !obj.contains_key("disableGrooveLoadingSection")
                || !obj.contains_key("showFps")
                || !obj.contains_key("alwaysShowDiagnosticsSidebar")
                || !obj.contains_key("themeMode")
        })
        .unwrap_or(true);

    if let Ok(normalized_theme_mode) = normalize_theme_mode(&settings.theme_mode) {
        if normalized_theme_mode != settings.theme_mode {
            settings.theme_mode = normalized_theme_mode;
            should_write_back = true;
        }
    } else {
        settings.theme_mode = default_theme_mode();
        should_write_back = true;
    }

    if should_write_back {
        write_global_settings_file(&settings_file, &settings)?;
    }

    Ok(settings)
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

fn record_worktree_tombstone(
    app: &AppHandle,
    workspace_root: &Path,
    worktree: &str,
    worktree_path: &Path,
    branch_name: Option<String>,
) -> Result<(), String> {
    let mut state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    state
        .tombstones_by_workspace
        .entry(workspace_key)
        .or_default()
        .insert(
            worktree.to_string(),
            WorktreeTombstone {
                workspace_root: workspace_root.display().to_string(),
                worktree: worktree.to_string(),
                worktree_path: worktree_path.display().to_string(),
                branch_name,
                deleted_at: now_iso(),
            },
        );
    write_persisted_worktree_execution_state(app, &state)
}

fn clear_worktree_tombstone(
    app: &AppHandle,
    workspace_root: &Path,
    worktree: &str,
) -> Result<(), String> {
    let mut state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    let mut changed = false;
    let mut workspace_tombstones_empty = false;

    if let Some(workspace_tombstones) = state.tombstones_by_workspace.get_mut(&workspace_key) {
        if workspace_tombstones.remove(worktree).is_some() {
            changed = true;
        }
        workspace_tombstones_empty = workspace_tombstones.is_empty();
    }

    if workspace_tombstones_empty {
        state.tombstones_by_workspace.remove(&workspace_key);
        changed = true;
    }

    if changed {
        write_persisted_worktree_execution_state(app, &state)?;
    }

    Ok(())
}

fn clear_worktree_last_executed_at(
    app: &AppHandle,
    workspace_root: &Path,
    worktree: &str,
) -> Result<(), String> {
    let mut state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    let mut changed = false;
    let mut workspace_entries_empty = false;

    if let Some(workspace_entries) = state.last_executed_at_by_workspace.get_mut(&workspace_key) {
        if workspace_entries.remove(worktree).is_some() {
            changed = true;
        }
        workspace_entries_empty = workspace_entries.is_empty();
    }

    if workspace_entries_empty {
        state.last_executed_at_by_workspace.remove(&workspace_key);
        changed = true;
    }

    if changed {
        write_persisted_worktree_execution_state(app, &state)?;
    }

    Ok(())
}

fn read_worktree_tombstone(
    app: &AppHandle,
    workspace_root: &Path,
    worktree: &str,
) -> Result<Option<WorktreeTombstone>, String> {
    let state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    Ok(state
        .tombstones_by_workspace
        .get(&workspace_key)
        .and_then(|workspace_tombstones| workspace_tombstones.get(worktree))
        .cloned())
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
        telemetry_enabled: true,
        disable_groove_loading_section: false,
        show_fps: false,
        play_groove_command: default_play_groove_command(),
        testing_ports: default_testing_ports(),
        open_terminal_at_worktree_command: None,
        run_local_command: None,
        worktree_symlink_paths: default_worktree_symlink_paths(),
    }
}

fn telemetry_enabled_for_app(app: &AppHandle) -> bool {
    ensure_global_settings(app)
        .map(|settings| settings.telemetry_enabled)
        .unwrap_or(true)
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
            let parsed_workspace_json = fs::read_to_string(&workspace_json)
                .ok()
                .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok());
            let has_telemetry_enabled = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("telemetryEnabled"))
                .unwrap_or(true);
            let has_disable_groove_loading_section = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("disableGrooveLoadingSection"))
                .unwrap_or(true);
            let has_show_fps = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("showFps"))
                .unwrap_or(true);
            let has_play_groove_command = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("playGrooveCommand"))
                .unwrap_or(true);
            let has_testing_ports = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("testingPorts"))
                .unwrap_or(true);
            let has_run_local_command = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("runLocalCommand"))
                .unwrap_or(true);
            let has_worktree_symlink_paths = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("worktreeSymlinkPaths"))
                .unwrap_or(true);
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

            if !has_telemetry_enabled {
                workspace_meta.telemetry_enabled = true;
                did_update = true;
            }

            if !has_disable_groove_loading_section {
                workspace_meta.disable_groove_loading_section = false;
                did_update = true;
            }

            if !has_show_fps {
                workspace_meta.show_fps = false;
                did_update = true;
            }

            match normalize_play_groove_command(&workspace_meta.play_groove_command) {
                Ok(normalized_play_groove_command) => {
                    if normalized_play_groove_command != workspace_meta.play_groove_command {
                        workspace_meta.play_groove_command = normalized_play_groove_command;
                        did_update = true;
                    }
                }
                Err(_) => {
                    workspace_meta.play_groove_command = default_play_groove_command();
                    did_update = true;
                }
            }

            let normalized_testing_ports =
                normalize_testing_ports_from_u16(&workspace_meta.testing_ports);
            if normalized_testing_ports != workspace_meta.testing_ports {
                workspace_meta.testing_ports = normalized_testing_ports;
                did_update = true;
            }

            let normalized_open_terminal_at_worktree_command =
                normalize_open_terminal_at_worktree_command(
                    workspace_meta.open_terminal_at_worktree_command.as_deref(),
                )
                .unwrap_or(None);
            if workspace_meta.open_terminal_at_worktree_command
                != normalized_open_terminal_at_worktree_command
            {
                workspace_meta.open_terminal_at_worktree_command =
                    normalized_open_terminal_at_worktree_command;
                did_update = true;
            }

            let normalized_run_local_command =
                normalize_run_local_command(workspace_meta.run_local_command.as_deref())
                    .unwrap_or(None);
            if workspace_meta.run_local_command != normalized_run_local_command {
                workspace_meta.run_local_command = normalized_run_local_command;
                did_update = true;
            }

            let normalized_worktree_symlink_paths =
                normalize_worktree_symlink_paths(&workspace_meta.worktree_symlink_paths);
            if workspace_meta.worktree_symlink_paths != normalized_worktree_symlink_paths {
                workspace_meta.worktree_symlink_paths = normalized_worktree_symlink_paths;
                did_update = true;
            }

            if !has_play_groove_command {
                workspace_meta.play_groove_command = default_play_groove_command();
                did_update = true;
            }

            if !has_testing_ports {
                workspace_meta.testing_ports = default_testing_ports();
                did_update = true;
            }

            if !has_run_local_command {
                workspace_meta.run_local_command = None;
                did_update = true;
            }

            if !has_worktree_symlink_paths {
                workspace_meta.worktree_symlink_paths = default_worktree_symlink_paths();
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
    let mut seen_worktrees = HashSet::<String>::new();
    let workspace_key = workspace_root_storage_key(workspace_root);
    let mut execution_state = read_persisted_worktree_execution_state(app)?;
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
        seen_worktrees.insert(worktree.clone());
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

    let mut cleared_tombstones = false;
    let mut workspace_tombstones_empty = false;
    if let Some(workspace_tombstones) = execution_state
        .tombstones_by_workspace
        .get_mut(&workspace_key)
    {
        let mut tombstones_to_drop = Vec::<String>::new();

        for (worktree, tombstone) in workspace_tombstones.iter() {
            if seen_worktrees.contains(worktree)
                || path_is_directory(Path::new(&tombstone.worktree_path))
            {
                tombstones_to_drop.push(worktree.clone());
                continue;
            }

            let branch_guess = tombstone
                .branch_name
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| value.to_string())
                .unwrap_or_else(|| branch_guess_from_worktree_name(worktree));

            rows.push(WorkspaceScanRow {
                worktree: worktree.clone(),
                branch_guess,
                path: tombstone.worktree_path.clone(),
                status: "deleted".to_string(),
                last_executed_at: None,
            });
        }

        for worktree in tombstones_to_drop {
            if workspace_tombstones.remove(&worktree).is_some() {
                cleared_tombstones = true;
            }
        }

        workspace_tombstones_empty = workspace_tombstones.is_empty();
    }

    if workspace_tombstones_empty {
        execution_state
            .tombstones_by_workspace
            .remove(&workspace_key);
        cleared_tombstones = true;
    }

    if cleared_tombstones {
        write_persisted_worktree_execution_state(app, &execution_state)?;
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
    let total_started_at = Instant::now();
    let telemetry_enabled = telemetry_enabled_for_app(app);
    if let Some(cached) = try_cached_workspace_context(app, workspace_root, &request_id) {
        log_build_workspace_context_timing(
            telemetry_enabled,
            Duration::ZERO,
            Duration::ZERO,
            total_started_at.elapsed(),
            true,
        );
        return cached;
    }

    let meta_started_at = Instant::now();
    let repository_remote_url = repository_remote_url(workspace_root);
    let (workspace_meta, workspace_message) = match ensure_workspace_meta(workspace_root) {
        Ok(result) => result,
        Err(error) => {
            let meta_elapsed = meta_started_at.elapsed();
            log_build_workspace_context_timing(
                telemetry_enabled,
                meta_elapsed,
                Duration::ZERO,
                total_started_at.elapsed(),
                false,
            );
            return WorkspaceContextResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                repository_remote_url,
                workspace_meta: None,
                workspace_message: None,
                has_worktrees_directory: None,
                rows: Vec::new(),
                cancelled: None,
                error: Some(error),
            };
        }
    };
    let meta_elapsed = meta_started_at.elapsed();

    let scan_started_at = Instant::now();
    let (has_worktrees_directory, rows) = match scan_workspace_worktrees(app, workspace_root) {
        Ok(result) => result,
        Err(error) => {
            let scan_elapsed = scan_started_at.elapsed();
            log_build_workspace_context_timing(
                telemetry_enabled,
                meta_elapsed,
                scan_elapsed,
                total_started_at.elapsed(),
                false,
            );
            return WorkspaceContextResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                repository_remote_url,
                workspace_meta: Some(workspace_meta),
                workspace_message: Some(workspace_message),
                has_worktrees_directory: None,
                rows: Vec::new(),
                cancelled: None,
                error: Some(error),
            };
        }
    };
    let scan_elapsed = scan_started_at.elapsed();

    if persist_as_active {
        if let Err(error) = persist_active_workspace_root(app, workspace_root) {
            log_build_workspace_context_timing(
                telemetry_enabled,
                meta_elapsed,
                scan_elapsed,
                total_started_at.elapsed(),
                false,
            );
            return WorkspaceContextResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                repository_remote_url,
                workspace_meta: Some(workspace_meta),
                workspace_message: Some(workspace_message),
                has_worktrees_directory: Some(has_worktrees_directory),
                rows,
                cancelled: None,
                error: Some(error),
            };
        }
    }

    let response = WorkspaceContextResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        repository_remote_url,
        workspace_meta: Some(workspace_meta),
        workspace_message: Some(workspace_message),
        has_worktrees_directory: Some(has_worktrees_directory),
        rows,
        cancelled: None,
        error: None,
    };

    store_workspace_context_cache(app, workspace_root, &response);
    log_build_workspace_context_timing(
        telemetry_enabled,
        meta_elapsed,
        scan_elapsed,
        total_started_at.elapsed(),
        false,
    );

    response
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
    let telemetry_enabled = obj.get("telemetryEnabled").and_then(|v| v.as_bool());
    let disable_groove_loading_section = obj
        .get("disableGrooveLoadingSection")
        .and_then(|v| v.as_bool());
    let show_fps = obj.get("showFps").and_then(|v| v.as_bool());
    let play_groove_command = obj
        .get("playGrooveCommand")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let testing_ports = obj.get("testingPorts").and_then(|v| {
        v.as_array().map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_u64())
                .filter_map(|value| u16::try_from(value).ok())
                .collect::<Vec<_>>()
        })
    });
    let open_terminal_at_worktree_command = obj
        .get("openTerminalAtWorktreeCommand")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let run_local_command = obj
        .get("runLocalCommand")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let worktree_symlink_paths = obj.get("worktreeSymlinkPaths").and_then(|v| {
        v.as_array().map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str())
                .map(|value| value.to_string())
                .collect::<Vec<_>>()
        })
    });

    if version.is_none()
        && root_name.is_none()
        && created_at.is_none()
        && updated_at.is_none()
        && default_terminal.is_none()
        && terminal_custom_command.is_none()
        && telemetry_enabled.is_none()
        && disable_groove_loading_section.is_none()
        && show_fps.is_none()
        && play_groove_command.is_none()
        && testing_ports.is_none()
        && open_terminal_at_worktree_command.is_none()
        && run_local_command.is_none()
        && worktree_symlink_paths.is_none()
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
        telemetry_enabled,
        disable_groove_loading_section,
        show_fps,
        play_groove_command,
        testing_ports,
        open_terminal_at_worktree_command,
        run_local_command,
        worktree_symlink_paths,
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

    if let Some(expected_telemetry_enabled) = expected.telemetry_enabled {
        if observed.telemetry_enabled != Some(expected_telemetry_enabled) {
            return false;
        }
    }

    if let Some(expected_disable_groove_loading_section) = expected.disable_groove_loading_section {
        if observed.disable_groove_loading_section != Some(expected_disable_groove_loading_section)
        {
            return false;
        }
    }

    if let Some(expected_show_fps) = expected.show_fps {
        if observed.show_fps != Some(expected_show_fps) {
            return false;
        }
    }

    if let Some(expected_play_groove_command) = &expected.play_groove_command {
        if observed.play_groove_command.as_ref() != Some(expected_play_groove_command) {
            return false;
        }
    }

    if let Some(expected_testing_ports) = &expected.testing_ports {
        if observed.testing_ports.as_ref() != Some(expected_testing_ports) {
            return false;
        }
    }

    if let Some(expected_open_terminal_at_worktree_command) =
        &expected.open_terminal_at_worktree_command
    {
        if observed.open_terminal_at_worktree_command.as_ref()
            != Some(expected_open_terminal_at_worktree_command)
        {
            return false;
        }
    }

    if let Some(expected_run_local_command) = &expected.run_local_command {
        if observed.run_local_command.as_ref() != Some(expected_run_local_command) {
            return false;
        }
    }

    if let Some(expected_worktree_symlink_paths) = &expected.worktree_symlink_paths {
        if observed.worktree_symlink_paths.as_ref() != Some(expected_worktree_symlink_paths) {
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

fn ensure_git_repository_root(workspace_root: &Path) -> Result<(), String> {
    let git_entry = workspace_root.join(".git");
    if !git_entry.exists() {
        return Err(format!(
            "\"{}\" is not a Git repository. Select the repository root folder (the one containing .git).",
            workspace_root.display()
        ));
    }

    let result = run_capture_command(
        workspace_root,
        "git",
        &["rev-parse", "--is-inside-work-tree"],
    );
    if let Some(error) = result.error.clone() {
        return Err(format!(
            "Could not validate Git repository at \"{}\": {}",
            workspace_root.display(),
            error
        ));
    }

    if result.exit_code != Some(0) || result.stdout.trim() != "true" {
        return Err(format!(
            "\"{}\" is not a valid Git repository. Select a folder initialized with Git.",
            workspace_root.display()
        ));
    }

    Ok(())
}

fn active_workspace_root_from_state(app: &AppHandle) -> Result<PathBuf, String> {
    let persisted_root = read_persisted_active_workspace_root(app)?
        .ok_or_else(|| "No active workspace selected.".to_string())?;
    validate_workspace_root_path(&persisted_root)
}

fn collect_gitignore_sanity(content: &str) -> (bool, bool, bool, Vec<String>) {
    let mut has_groove_entry = false;
    let mut has_workspace_entry = false;
    let mut has_groove_comment = false;

    for line in content.lines() {
        let normalized = line.trim();
        if normalized == GITIGNORE_REQUIRED_ENTRIES[0] {
            has_groove_entry = true;
        } else if normalized == GITIGNORE_REQUIRED_ENTRIES[1] {
            has_workspace_entry = true;
        } else if normalized == GITIGNORE_GROOVE_COMMENT {
            has_groove_comment = true;
        }
    }

    let mut missing_entries = Vec::new();
    if !has_groove_entry {
        missing_entries.push(GITIGNORE_REQUIRED_ENTRIES[0].to_string());
    }
    if !has_workspace_entry {
        missing_entries.push(GITIGNORE_REQUIRED_ENTRIES[1].to_string());
    }

    (
        has_groove_entry,
        has_workspace_entry,
        has_groove_comment,
        missing_entries,
    )
}

fn newline_for_content(content: &str) -> &'static str {
    if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    }
}

fn emit_workspace_ready_event(
    app: &AppHandle,
    request_id: &str,
    workspace_root: Option<&str>,
    kind: &str,
) {
    let _ = app.emit(
        "workspace-ready",
        serde_json::json!({
            "requestId": request_id,
            "workspaceRoot": workspace_root,
            "kind": kind,
        }),
    );
}

fn run_capture_command(cwd: &Path, binary: &str, args: &[&str]) -> CommandResult {
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
            error: Some(format!("Failed to execute {binary}: {error}")),
        },
    }
}

fn run_capture_command_timeout(
    cwd: &Path,
    binary: &str,
    args: &[&str],
    timeout: Duration,
) -> CommandResult {
    let mut command = Command::new(binary);
    command.args(args).current_dir(cwd);
    run_command_with_timeout(
        command,
        timeout,
        format!("Failed to execute {binary}"),
        binary.to_string(),
    )
}

fn first_non_empty_line(value: &str) -> Option<String> {
    value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.to_string())
}

fn repository_remote_url(workspace_root: &Path) -> Option<String> {
    resolve_remote_url_with_fallback(workspace_root).map(|(_, remote_url)| remote_url)
}

fn command_cwd() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"))
}

fn open_url_in_default_browser(url: &str) -> Result<(), String> {
    let cwd = command_cwd();

    #[cfg(target_os = "linux")]
    {
        return Command::new("xdg-open")
            .arg(url)
            .current_dir(cwd)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Failed to launch xdg-open: {error}"));
    }

    #[cfg(target_os = "macos")]
    {
        return Command::new("open")
            .arg(url)
            .current_dir(cwd)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Failed to launch open: {error}"));
    }

    #[cfg(target_os = "windows")]
    {
        return Command::new("cmd")
            .args(["/C", "start", "", url])
            .current_dir(cwd)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Failed to launch cmd start: {error}"));
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        let _ = (cwd, url);
        Err("Opening browser is unsupported on this platform.".to_string())
    }
}

fn validate_existing_path(path: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path.trim());
    if !candidate.is_absolute() {
        return Err("path must be an absolute path.".to_string());
    }

    if !candidate.exists() {
        return Err(format!("path \"{}\" does not exist.", candidate.display()));
    }

    Ok(candidate)
}

fn git_repository_root_from_path(path: &Path) -> Result<PathBuf, String> {
    let cwd = if path_is_directory(path) {
        path.to_path_buf()
    } else {
        path.parent().unwrap_or(path).to_path_buf()
    };

    let result = run_capture_command(&cwd, "git", &["rev-parse", "--show-toplevel"]);
    if let Some(error) = result.error.clone() {
        return Err(format!("Failed to resolve git repository root: {error}"));
    }
    if result.exit_code != Some(0) {
        return Err("Could not resolve git repository root from the provided path.".to_string());
    }

    let Some(root) = first_non_empty_line(&result.stdout) else {
        return Err("Git repository root could not be determined.".to_string());
    };

    Ok(PathBuf::from(root))
}

fn resolve_remote_url_with_fallback(repository_root: &Path) -> Option<(String, String)> {
    let origin = run_capture_command(repository_root, "git", &["remote", "get-url", "origin"]);
    if origin.error.is_none() && origin.exit_code == Some(0) {
        if let Some(url) = first_non_empty_line(&origin.stdout) {
            return Some(("origin".to_string(), url));
        }
    }

    let remotes_result = run_capture_command(repository_root, "git", &["remote"]);
    if remotes_result.error.is_some() || remotes_result.exit_code != Some(0) {
        return None;
    }

    let remote_name = remotes_result
        .stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.to_string())?;

    let remote_result =
        run_capture_command(repository_root, "git", &["remote", "get-url", &remote_name]);
    if remote_result.error.is_some() || remote_result.exit_code != Some(0) {
        return None;
    }

    first_non_empty_line(&remote_result.stdout).map(|url| (remote_name, url))
}

fn normalize_remote_repo_info(remote_url: &str) -> Option<(String, String, String)> {
    git_gh::normalize_remote_repo_info(remote_url)
}

fn normalize_gh_hostname(hostname: Option<&str>) -> Option<String> {
    git_gh::normalize_gh_hostname(hostname)
}

fn infer_gh_host_hint_from_payload(payload: &GhAuthStatusPayload, cwd: &Path) -> Option<String> {
    if let Some((host, _, _)) = payload
        .remote_url
        .as_deref()
        .and_then(normalize_remote_repo_info)
    {
        return Some(host);
    }

    let repo_root = payload
        .path
        .as_deref()
        .and_then(|value| validate_existing_path(value).ok())
        .and_then(|value| git_repository_root_from_path(&value).ok());

    if let Some(root) = repo_root {
        if let Some(remote_url) = repository_remote_url(&root) {
            if let Some((host, _, _)) = normalize_remote_repo_info(&remote_url) {
                return Some(host);
            }
        }
    }

    if let Some(remote_url) = repository_remote_url(cwd) {
        if let Some((host, _, _)) = normalize_remote_repo_info(&remote_url) {
            return Some(host);
        }
    }

    None
}

fn parse_gh_auth_identity(
    output: &str,
    preferred_host: Option<&str>,
) -> (Option<String>, Option<String>) {
    git_gh::parse_gh_auth_identity(output, preferred_host)
}

fn gh_api_user_login(cwd: &Path, hostname: Option<&str>) -> Option<String> {
    let result = if let Some(hostname) = hostname.map(str::trim).filter(|value| !value.is_empty()) {
        run_capture_command(
            cwd,
            "gh",
            &["api", "user", "--hostname", hostname, "--jq", ".login"],
        )
    } else {
        run_capture_command(cwd, "gh", &["api", "user", "--jq", ".login"])
    };

    if result.error.is_some() || result.exit_code != Some(0) {
        return None;
    }

    first_non_empty_line(&result.stdout)
        .map(|value| value.trim_matches('"').trim().to_string())
        .filter(|value| !value.is_empty() && value != "null")
}

fn parse_first_url(value: &str) -> Option<String> {
    git_gh::parse_first_url(value)
}

fn normalize_gh_repository(
    owner: &str,
    repo: &str,
    hostname: Option<&str>,
) -> Result<String, String> {
    git_gh::normalize_gh_repository(owner, repo, hostname)
}

fn validate_gh_branch_action_payload(
    payload: &GhBranchActionPayload,
) -> Result<(PathBuf, String), String> {
    let branch = payload.branch.trim();
    if branch.is_empty() {
        return Err("branch must be a non-empty string.".to_string());
    }

    let path = validate_existing_path(&payload.path)?;
    let repository_root = git_repository_root_from_path(&path)?;

    Ok((repository_root, branch.to_string()))
}

fn validate_git_worktree_path(path: &str) -> Result<PathBuf, String> {
    let candidate = validate_existing_path(path)?;
    if !path_is_directory(&candidate) {
        return Err("path must point to an existing directory.".to_string());
    }

    let result = Command::new("git")
        .arg("-C")
        .arg(&candidate)
        .args(["rev-parse", "--is-inside-work-tree"])
        .output();

    match result {
        Ok(output) => {
            if output.status.code() == Some(0)
                && String::from_utf8_lossy(&output.stdout).trim() == "true"
            {
                Ok(candidate)
            } else {
                Err(format!(
                    "path \"{}\" is not an active git worktree.",
                    candidate.display()
                ))
            }
        }
        Err(error) => Err(format!("Failed to execute git: {error}")),
    }
}

fn run_git_command_at_path(path: &Path, args: &[&str]) -> CommandResult {
    let output = Command::new("git").arg("-C").arg(path).args(args).output();

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
            error: Some(format!("Failed to execute git: {error}")),
        },
    }
}

fn run_git_command_at_path_with_args(path: &Path, args: &[String]) -> CommandResult {
    let output = Command::new("git").arg("-C").arg(path).args(args).output();

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
            error: Some(format!("Failed to execute git: {error}")),
        },
    }
}

fn command_output_snippet(result: &CommandResult) -> Option<String> {
    first_non_empty_line(&result.stdout)
        .or_else(|| first_non_empty_line(&result.stderr))
        .map(|line| {
            let trimmed = line.trim();
            let prefix = trimmed.chars().take(160).collect::<String>();
            if prefix.len() < trimmed.len() {
                format!("{prefix}...")
            } else {
                trimmed.to_string()
            }
        })
}

fn parse_git_porcelain_counts(output: &str) -> git_gh::GitPorcelainCounts {
    git_gh::parse_git_porcelain_counts(output)
}

fn parse_git_ahead_behind(status_sb_output: &str) -> (u32, u32) {
    git_gh::parse_git_ahead_behind(status_sb_output)
}

fn parse_git_file_states(output: &str) -> (Vec<String>, Vec<String>, Vec<String>) {
    git_gh::parse_git_file_states(output)
}

fn normalize_git_file_list(files: &[String]) -> Result<Vec<String>, String> {
    git_gh::normalize_git_file_list(files)
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

fn configured_groove_bin_path() -> Option<String> {
    if let Ok(from_env) = std::env::var("GROOVE_BIN") {
        if !from_env.trim().is_empty() {
            return Some(from_env);
        }
    }

    None
}

fn is_attempt_ready_executable(path: &Path) -> bool {
    if !path.exists() || !path.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        if let Ok(metadata) = fs::metadata(path) {
            return metadata.permissions().mode() & 0o111 != 0;
        }

        false
    }

    #[cfg(not(unix))]
    {
        true
    }
}

fn resolve_groove_binary(app: &AppHandle) -> GrooveBinaryResolution {
    if let Some(from_env) = configured_groove_bin_path() {
        return GrooveBinaryResolution {
            path: PathBuf::from(from_env),
            source: "env".to_string(),
        };
    }

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
                    return GrooveBinaryResolution {
                        path: candidate,
                        source: "bundled".to_string(),
                    };
                }
            }
        }
    }

    GrooveBinaryResolution {
        path: PathBuf::from("groove"),
        source: "path".to_string(),
    }
}

fn groove_binary_path(app: &AppHandle) -> PathBuf {
    resolve_groove_binary(app).path
}

fn evaluate_groove_bin_check_status(app: &AppHandle) -> GrooveBinCheckStatus {
    let configured_path = configured_groove_bin_path();
    let configured_path_valid = configured_path
        .as_ref()
        .map(|path| is_attempt_ready_executable(Path::new(path)));
    let has_issue = matches!(configured_path_valid, Some(false));

    let issue = if has_issue {
        Some(
            "GROOVE_BIN is set but does not point to an executable file. Repair to clear GROOVE_BIN and use bundled/PATH resolution."
                .to_string(),
        )
    } else {
        None
    };

    let resolved = resolve_groove_binary(app);

    GrooveBinCheckStatus {
        configured_path,
        configured_path_valid,
        has_issue,
        issue,
        effective_binary_path: resolved.path.display().to_string(),
        effective_binary_source: resolved.source,
    }
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
            return false;
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
                workspace_root: Some(target.workspace_root.clone()),
                is_target: true,
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
            workspace_root: Some(instance.workspace_root.clone()),
            is_target: false,
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

fn workspace_root_matches_root_name(workspace_root: &str, root_name: Option<&str>) -> bool {
    let Some(root_name) = root_name else {
        return true;
    };

    Path::new(workspace_root)
        .file_name()
        .map(|name| name.to_string_lossy() == root_name)
        .unwrap_or(false)
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
    let child_key = testing_child_key(workspace_root, worktree);

    let mut pids_to_stop: Vec<i32> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    if let Some(child) = runtime.children_by_worktree.get(&child_key) {
        let raw_child_pid = child.id();
        match i32::try_from(raw_child_pid) {
            Ok(child_pid) if child_pid > 0 => pids_to_stop.push(child_pid),
            Ok(_) => {}
            Err(_) => errors.push(format!(
                "Child PID {raw_child_pid} is out of supported range for worktree '{worktree}'."
            )),
        }
    }

    if instance.pid > 0 && !pids_to_stop.contains(&instance.pid) {
        pids_to_stop.push(instance.pid);
    }

    if pids_to_stop.is_empty() {
        let fallback_pids = resolve_node_app_pids_for_worktree(Path::new(&instance.worktree_path));
        pids_to_stop.extend(fallback_pids);
    }

    for pid in pids_to_stop {
        if let Err(error) = stop_process_by_pid(pid) {
            errors.push(format!("PID {pid}: {error}"));
        }
    }

    if !errors.is_empty() {
        return Err(format!(
            "Failed to stop testing environment process(es) for '{worktree}' in '{workspace_root}': {}",
            errors.join("; ")
        ));
    }

    if let Some(mut child) = runtime.children_by_worktree.remove(&child_key) {
        let _ = child.wait();
    }

    runtime.persisted.running_instances.remove(index);
    runtime.persisted.updated_at = Some(now_iso());
    Ok(true)
}

fn unset_testing_target_for_worktree(
    app: &AppHandle,
    state: &TestingEnvironmentState,
    workspace_root: &Path,
    worktree: &str,
    stop_running_processes_when_unset: bool,
) -> Result<bool, String> {
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|error| format!("Failed to acquire testing environment lock: {error}"))?;

    ensure_testing_runtime_loaded(app, &mut runtime)?;
    reconcile_testing_runtime_and_persist(app, &mut runtime)?;

    let workspace_root_string = workspace_root.display().to_string();
    let before_targets_len = runtime.persisted.targets.len();
    runtime.persisted.targets.retain(|target| {
        !(target.workspace_root == workspace_root_string && target.worktree == worktree)
    });
    let target_was_removed = runtime.persisted.targets.len() != before_targets_len;
    if !target_was_removed {
        return Ok(false);
    }

    if stop_running_processes_when_unset {
        let _ = stop_running_testing_instance_for_worktree(
            &mut runtime,
            &workspace_root_string,
            worktree,
        )?;
    }

    runtime.persisted.updated_at = Some(now_iso());
    write_persisted_testing_environment_state(app, &runtime.persisted)?;

    Ok(true)
}

fn testing_instance_is_effectively_running(instance: &TestingEnvironmentInstance) -> bool {
    if instance.pid <= 0 {
        return false;
    }

    is_process_running(instance.pid)
}

fn start_testing_instance_for_target(
    _app: &AppHandle,
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

    let run_local_command = run_local_command_for_workspace(Path::new(&target.workspace_root));
    let command_template = run_local_command
        .as_deref()
        .unwrap_or(DEFAULT_RUN_LOCAL_COMMAND);
    let (program, args) =
        resolve_run_local_command(command_template, Path::new(&target.worktree_path))?;
    let mut command = Command::new(&program);
    let configured_ports = testing_ports_for_workspace(Path::new(&target.workspace_root));
    let used_ports = runtime
        .persisted
        .running_instances
        .iter()
        .filter(|instance| testing_instance_is_effectively_running(instance))
        .filter_map(|instance| instance.port)
        .collect::<HashSet<_>>();
    let port = allocate_testing_port(&configured_ports, &used_ports)?;
    command
        .args(args.iter().map(|value| value.as_str()))
        .current_dir(Path::new(&target.worktree_path))
        .env("PORT", port.to_string())
        .env("GROOVE_WORKTREE", &target.worktree_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;

        command.process_group(0);
    }

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
            command: std::iter::once(program.as_str())
                .chain(args.iter().map(|value| value.as_str()))
                .collect::<Vec<_>>()
                .join(" "),
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

fn snapshot_runtime_pids_by_worktree(
    workspace_root: &Path,
    known_worktrees: &[String],
) -> HashMap<String, Option<i32>> {
    let Ok((snapshot_rows, _warning)) = list_process_snapshot_rows() else {
        return HashMap::new();
    };

    let mut runtime_by_worktree = HashMap::new();
    for worktree in known_worktrees {
        let worktree_path = workspace_root.join(".worktrees").join(worktree);
        runtime_by_worktree.insert(
            worktree.clone(),
            resolve_opencode_pid_for_worktree(&snapshot_rows, &worktree_path),
        );
    }

    runtime_by_worktree
}

fn log_backend_timing(telemetry_enabled: bool, event: &str, elapsed: Duration, details: &str) {
    if !telemetry_enabled {
        return;
    }
    eprintln!(
        "[startup-telemetry] event={event} elapsed_ms={} {details}",
        elapsed.as_millis()
    );
}

fn log_play_telemetry(telemetry_enabled: bool, event: &str, details: &str) {
    if !telemetry_enabled {
        return;
    }
    eprintln!("[play-telemetry] event={event} {details}");
}

fn log_build_workspace_context_timing(
    telemetry_enabled: bool,
    meta_elapsed: Duration,
    scan_elapsed: Duration,
    total_elapsed: Duration,
    cache_hit: bool,
) {
    if !telemetry_enabled {
        return;
    }
    eprintln!(
        "[startup-telemetry] event=build_workspace_context meta_ms={} scan_ms={} total_ms={} cache_hit={cache_hit}",
        meta_elapsed.as_millis(),
        scan_elapsed.as_millis(),
        total_elapsed.as_millis(),
    );
}

fn sorted_worktrees_key(known_worktrees: &[String]) -> String {
    let mut sorted = known_worktrees.to_vec();
    sorted.sort();
    sorted.join("|")
}

fn workspace_context_cache_key(workspace_root: &Path) -> String {
    workspace_root_storage_key(workspace_root)
}

fn workspace_context_signature(
    app: &AppHandle,
    workspace_root: &Path,
) -> Result<WorkspaceContextSignature, String> {
    let execution_state_file = worktree_execution_state_file(app)?;
    Ok(WorkspaceContextSignature {
        workspace_manifest: snapshot_entry(&workspace_root.join(".groove").join("workspace.json")),
        worktrees_dir: snapshot_entry(&workspace_root.join(".worktrees")),
        worktree_execution_state_file: snapshot_entry(&execution_state_file),
    })
}

fn try_cached_workspace_context(
    app: &AppHandle,
    workspace_root: &Path,
    request_id: &str,
) -> Option<WorkspaceContextResponse> {
    let cache_state = app.try_state::<WorkspaceContextCacheState>()?;
    let signature = workspace_context_signature(app, workspace_root).ok()?;
    let key = workspace_context_cache_key(workspace_root);
    let mut response = {
        let entries = cache_state.entries.lock().ok()?;
        let cached = entries.get(&key)?;
        if cached.signature != signature {
            return None;
        }
        cached.response.clone()
    };

    response.request_id = request_id.to_string();
    if response.ok {
        response.workspace_message = Some("Loaded existing .groove/workspace.json.".to_string());
    }
    Some(response)
}

fn store_workspace_context_cache(
    app: &AppHandle,
    workspace_root: &Path,
    response: &WorkspaceContextResponse,
) {
    if !response.ok {
        return;
    }
    let Some(cache_state) = app.try_state::<WorkspaceContextCacheState>() else {
        return;
    };
    let Ok(signature) = workspace_context_signature(app, workspace_root) else {
        return;
    };
    let Ok(mut entries) = cache_state.entries.lock() else {
        return;
    };
    entries.insert(
        workspace_context_cache_key(workspace_root),
        WorkspaceContextCacheEntry {
            signature,
            response: response.clone(),
        },
    );
}

fn invalidate_workspace_context_cache(app: &AppHandle, workspace_root: &Path) {
    let Some(cache_state) = app.try_state::<WorkspaceContextCacheState>() else {
        return;
    };
    if let Ok(mut entries) = cache_state.entries.lock() {
        entries.remove(&workspace_context_cache_key(workspace_root));
    };
}

fn clear_workspace_context_cache(app: &AppHandle) {
    let Some(cache_state) = app.try_state::<WorkspaceContextCacheState>() else {
        return;
    };
    if let Ok(mut entries) = cache_state.entries.lock() {
        entries.clear();
    };
}

fn groove_list_cache_key(
    workspace_root: &Path,
    known_worktrees: &[String],
    dir: &Option<String>,
    workspace_meta: &Option<WorkspaceMetaContext>,
) -> String {
    let meta_key = if let Some(meta) = workspace_meta {
        format!(
            "{}:{}:{}:{}:{}:{}:{}",
            meta.version.map(|v| v.to_string()).unwrap_or_default(),
            meta.root_name.as_deref().unwrap_or_default(),
            meta.created_at.as_deref().unwrap_or_default(),
            meta.updated_at.as_deref().unwrap_or_default(),
            meta.default_terminal.as_deref().unwrap_or_default(),
            meta.terminal_custom_command.as_deref().unwrap_or_default(),
            meta.telemetry_enabled
                .map(|value| value.to_string())
                .unwrap_or_default(),
        )
    } else {
        String::new()
    };

    format!(
        "root={}\nknown={}\ndir={}\nmeta={}",
        workspace_root_storage_key(workspace_root),
        sorted_worktrees_key(known_worktrees),
        dir.as_deref().unwrap_or_default(),
        meta_key,
    )
}

fn invalidate_groove_list_cache_for_workspace(app: &AppHandle, workspace_root: &Path) {
    let Some(cache_state) = app.try_state::<GrooveListCacheState>() else {
        return;
    };

    let root_prefix = format!("root={}\n", workspace_root_storage_key(workspace_root));

    if let Ok(mut entries) = cache_state.entries.lock() {
        entries.retain(|key, _| !key.starts_with(&root_prefix));
    };
}

fn clear_groove_list_cache(app: &AppHandle) {
    let Some(cache_state) = app.try_state::<GrooveListCacheState>() else {
        return;
    };
    if let Ok(mut entries) = cache_state.entries.lock() {
        entries.clear();
    };
}

#[tauri::command]
fn workspace_pick_and_open(app: AppHandle) -> WorkspaceContextResponse {
    let request_id = request_id();
    let previous_workspace_root = read_persisted_active_workspace_root(&app).ok().flatten();
    let picked = rfd::FileDialog::new().pick_folder();
    let Some(selected) = picked else {
        return WorkspaceContextResponse {
            request_id,
            ok: false,
            workspace_root: None,
            repository_remote_url: None,
            workspace_meta: None,
            workspace_message: None,
            has_worktrees_directory: None,
            rows: Vec::new(),
            cancelled: Some(true),
            error: None,
        };
    };

    if let Err(error) = ensure_git_repository_root(&selected) {
        return WorkspaceContextResponse {
            request_id,
            ok: false,
            workspace_root: Some(selected.display().to_string()),
            repository_remote_url: None,
            workspace_meta: None,
            workspace_message: None,
            has_worktrees_directory: None,
            rows: Vec::new(),
            cancelled: None,
            error: Some(error),
        };
    }

    let response = build_workspace_context(&app, &selected, request_id.clone(), true);
    if response.ok {
        let next_workspace_root = response.workspace_root.as_deref();
        if previous_workspace_root.as_deref() != next_workspace_root {
            emit_workspace_ready_event(&app, &request_id, next_workspace_root, "connection");
        }
    }

    response
}

#[tauri::command]
fn workspace_open(app: AppHandle, workspace_root: String) -> WorkspaceContextResponse {
    let request_id = request_id();
    let previous_workspace_root = read_persisted_active_workspace_root(&app).ok().flatten();
    let root = match validate_workspace_root_path(&workspace_root) {
        Ok(root) => root,
        Err(error) => {
            return WorkspaceContextResponse {
                request_id,
                ok: false,
                workspace_root: None,
                repository_remote_url: None,
                workspace_meta: None,
                workspace_message: None,
                has_worktrees_directory: None,
                rows: Vec::new(),
                cancelled: None,
                error: Some(error),
            }
        }
    };

    if let Some(cached) = try_cached_workspace_context(&app, &root, &request_id) {
        if previous_workspace_root.as_deref() != cached.workspace_root.as_deref() {
            if let Err(error) = persist_active_workspace_root(&app, &root) {
                return WorkspaceContextResponse {
                    request_id,
                    ok: false,
                    workspace_root: Some(root.display().to_string()),
                    repository_remote_url: cached.repository_remote_url,
                    workspace_meta: cached.workspace_meta,
                    workspace_message: cached.workspace_message,
                    has_worktrees_directory: cached.has_worktrees_directory,
                    rows: cached.rows,
                    cancelled: None,
                    error: Some(error),
                };
            }
            emit_workspace_ready_event(
                &app,
                &request_id,
                cached.workspace_root.as_deref(),
                "connection",
            );
        }
        return cached;
    }

    if let Err(error) = ensure_git_repository_root(&root) {
        return WorkspaceContextResponse {
            request_id,
            ok: false,
            workspace_root: None,
            repository_remote_url: None,
            workspace_meta: None,
            workspace_message: None,
            has_worktrees_directory: None,
            rows: Vec::new(),
            cancelled: None,
            error: Some(error),
        };
    }

    let response = build_workspace_context(&app, &root, request_id.clone(), true);
    if response.ok {
        let next_workspace_root = response.workspace_root.as_deref();
        if previous_workspace_root.as_deref() != next_workspace_root {
            emit_workspace_ready_event(&app, &request_id, next_workspace_root, "connection");
        }
    }

    response
}

#[tauri::command]
fn workspace_get_active(app: AppHandle) -> WorkspaceContextResponse {
    let started_at = Instant::now();
    let request_id = request_id();
    let mut telemetry_enabled = true;
    let persisted_root = match read_persisted_active_workspace_root(&app) {
        Ok(root) => root,
        Err(error) => {
            let response = WorkspaceContextResponse {
                request_id,
                ok: false,
                workspace_root: None,
                repository_remote_url: None,
                workspace_meta: None,
                workspace_message: None,
                has_worktrees_directory: None,
                rows: Vec::new(),
                cancelled: None,
                error: Some(error),
            };
            log_backend_timing(
                telemetry_enabled,
                "workspace_get_active",
                started_at.elapsed(),
                "outcome=read-state-error",
            );
            return response;
        }
    };

    let response = if let Some(persisted_root) = persisted_root {
        match validate_workspace_root_path(&persisted_root) {
            Ok(root) => {
                telemetry_enabled = telemetry_enabled_for_app(&app);
                if let Some(cached) = try_cached_workspace_context(&app, &root, &request_id) {
                    cached
                } else if let Err(error) = ensure_git_repository_root(&root) {
                    let _ = clear_persisted_active_workspace_root(&app);
                    WorkspaceContextResponse {
                        request_id,
                        ok: false,
                        workspace_root: Some(persisted_root),
                        repository_remote_url: None,
                        workspace_meta: None,
                        workspace_message: None,
                        has_worktrees_directory: None,
                        rows: Vec::new(),
                        cancelled: None,
                        error: Some(error),
                    }
                } else {
                    build_workspace_context(&app, &root, request_id, false)
                }
            }
            Err(error) => {
                let _ = clear_persisted_active_workspace_root(&app);
                WorkspaceContextResponse {
                    request_id,
                    ok: false,
                    workspace_root: Some(persisted_root),
                    repository_remote_url: None,
                    workspace_meta: None,
                    workspace_message: None,
                    has_worktrees_directory: None,
                    rows: Vec::new(),
                    cancelled: None,
                    error: Some(error),
                }
            }
        }
    } else {
        WorkspaceContextResponse {
            request_id,
            ok: true,
            workspace_root: None,
            repository_remote_url: None,
            workspace_meta: None,
            workspace_message: None,
            has_worktrees_directory: None,
            rows: Vec::new(),
            cancelled: None,
            error: None,
        }
    };

    log_backend_timing(
        telemetry_enabled,
        "workspace_get_active",
        started_at.elapsed(),
        if response.ok {
            "outcome=ok"
        } else {
            "outcome=error"
        },
    );
    response
}

#[tauri::command]
fn workspace_clear_active(
    app: AppHandle,
    testing_state: State<TestingEnvironmentState>,
    terminal_state: State<GrooveTerminalState>,
) -> WorkspaceContextResponse {
    let request_id = request_id();
    let persisted_workspace_root = read_persisted_active_workspace_root(&app).ok().flatten();
    let had_active_workspace = persisted_workspace_root.is_some();

    if let Some(workspace_root) = persisted_workspace_root.as_deref() {
        let workspace_root_key = workspace_root_storage_key(Path::new(workspace_root));
        let sessions_to_close = match terminal_state.inner.lock() {
            Ok(mut sessions_state) => {
                drain_groove_terminal_sessions(&mut sessions_state, Some(workspace_root_key.as_str()))
            }
            Err(_) => Vec::new(),
        };
        close_groove_terminal_sessions_best_effort(sessions_to_close);
    }

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
        Ok(_) => {
            clear_workspace_context_cache(&app);
            clear_groove_list_cache(&app);
            if had_active_workspace {
                emit_workspace_ready_event(&app, &request_id, None, "connection");
            }

            WorkspaceContextResponse {
                request_id,
                ok: true,
                workspace_root: None,
                repository_remote_url: None,
                workspace_meta: None,
                workspace_message: None,
                has_worktrees_directory: None,
                rows: Vec::new(),
                cancelled: None,
                error: None,
            }
        }
        Err(error) => WorkspaceContextResponse {
            request_id,
            ok: false,
            workspace_root: None,
            repository_remote_url: None,
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
fn workspace_gitignore_sanity_check(app: AppHandle) -> WorkspaceGitignoreSanityResponse {
    let request_id = request_id();
    let workspace_root = match active_workspace_root_from_state(&app) {
        Ok(workspace_root) => workspace_root,
        Err(error) => {
            return WorkspaceGitignoreSanityResponse {
                request_id,
                ok: false,
                workspace_root: None,
                is_applicable: false,
                has_groove_entry: false,
                has_workspace_entry: false,
                missing_entries: Vec::new(),
                patched: None,
                error: Some(error),
            }
        }
    };

    let gitignore_path = workspace_root.join(".gitignore");
    if !path_is_file(&gitignore_path) {
        return WorkspaceGitignoreSanityResponse {
            request_id,
            ok: true,
            workspace_root: Some(workspace_root.display().to_string()),
            is_applicable: false,
            has_groove_entry: false,
            has_workspace_entry: false,
            missing_entries: Vec::new(),
            patched: None,
            error: None,
        };
    }

    let content = match fs::read_to_string(&gitignore_path) {
        Ok(content) => content,
        Err(error) => {
            return WorkspaceGitignoreSanityResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                is_applicable: true,
                has_groove_entry: false,
                has_workspace_entry: false,
                missing_entries: Vec::new(),
                patched: None,
                error: Some(format!(
                    "Failed to read {}: {error}",
                    gitignore_path.display()
                )),
            }
        }
    };

    let (has_groove_entry, has_workspace_entry, _, missing_entries) = collect_gitignore_sanity(&content);

    WorkspaceGitignoreSanityResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        is_applicable: true,
        has_groove_entry,
        has_workspace_entry,
        missing_entries,
        patched: None,
        error: None,
    }
}

#[tauri::command]
fn workspace_gitignore_sanity_apply(app: AppHandle) -> WorkspaceGitignoreSanityResponse {
    let request_id = request_id();
    let workspace_root = match active_workspace_root_from_state(&app) {
        Ok(workspace_root) => workspace_root,
        Err(error) => {
            return WorkspaceGitignoreSanityResponse {
                request_id,
                ok: false,
                workspace_root: None,
                is_applicable: false,
                has_groove_entry: false,
                has_workspace_entry: false,
                missing_entries: Vec::new(),
                patched: Some(false),
                error: Some(error),
            }
        }
    };

    let gitignore_path = workspace_root.join(".gitignore");
    if !path_is_file(&gitignore_path) {
        return WorkspaceGitignoreSanityResponse {
            request_id,
            ok: true,
            workspace_root: Some(workspace_root.display().to_string()),
            is_applicable: false,
            has_groove_entry: false,
            has_workspace_entry: false,
            missing_entries: Vec::new(),
            patched: Some(false),
            error: None,
        };
    }

    let content = match fs::read_to_string(&gitignore_path) {
        Ok(content) => content,
        Err(error) => {
            return WorkspaceGitignoreSanityResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                is_applicable: true,
                has_groove_entry: false,
                has_workspace_entry: false,
                missing_entries: Vec::new(),
                patched: Some(false),
                error: Some(format!(
                    "Failed to read {}: {error}",
                    gitignore_path.display()
                )),
            }
        }
    };

    let (has_groove_entry, has_workspace_entry, has_groove_comment, missing_entries) =
        collect_gitignore_sanity(&content);

    if missing_entries.is_empty() {
        return WorkspaceGitignoreSanityResponse {
            request_id,
            ok: true,
            workspace_root: Some(workspace_root.display().to_string()),
            is_applicable: true,
            has_groove_entry,
            has_workspace_entry,
            missing_entries,
            patched: Some(false),
            error: None,
        };
    }

    let newline = newline_for_content(&content);
    let mut prefix_lines = Vec::new();
    if !has_groove_comment {
        prefix_lines.push(GITIGNORE_GROOVE_COMMENT.to_string());
    }
    prefix_lines.extend(missing_entries.iter().cloned());

    let mut next_content = prefix_lines.join(newline);
    if content.is_empty() {
        next_content.push_str(newline);
    } else {
        next_content.push_str(newline);
        next_content.push_str(newline);
        next_content.push_str(&content);
    }

    if let Err(error) = fs::write(&gitignore_path, next_content) {
        return WorkspaceGitignoreSanityResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            is_applicable: true,
            has_groove_entry,
            has_workspace_entry,
            missing_entries,
            patched: Some(false),
            error: Some(format!(
                "Failed to write {}: {error}",
                gitignore_path.display()
            )),
        };
    }

    WorkspaceGitignoreSanityResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        is_applicable: true,
        has_groove_entry: true,
        has_workspace_entry: true,
        missing_entries: Vec::new(),
        patched: Some(true),
        error: None,
    }
}

#[tauri::command]
fn global_settings_get(app: AppHandle) -> GlobalSettingsResponse {
    let request_id = request_id();
    match ensure_global_settings(&app) {
        Ok(global_settings) => GlobalSettingsResponse {
            request_id,
            ok: true,
            global_settings: Some(global_settings),
            error: None,
        },
        Err(error) => GlobalSettingsResponse {
            request_id,
            ok: false,
            global_settings: Some(default_global_settings()),
            error: Some(error),
        },
    }
}

#[tauri::command]
fn global_settings_update(
    app: AppHandle,
    payload: GlobalSettingsUpdatePayload,
) -> GlobalSettingsResponse {
    let request_id = request_id();
    let mut global_settings = match ensure_global_settings(&app) {
        Ok(value) => value,
        Err(error) => {
            return GlobalSettingsResponse {
                request_id,
                ok: false,
                global_settings: Some(default_global_settings()),
                error: Some(error),
            }
        }
    };

    if let Some(telemetry_enabled) = payload.telemetry_enabled {
        global_settings.telemetry_enabled = telemetry_enabled;
    }
    if let Some(disable_groove_loading_section) = payload.disable_groove_loading_section {
        global_settings.disable_groove_loading_section = disable_groove_loading_section;
    }
    if let Some(show_fps) = payload.show_fps {
        global_settings.show_fps = show_fps;
    }
    if let Some(always_show_diagnostics_sidebar) = payload.always_show_diagnostics_sidebar {
        global_settings.always_show_diagnostics_sidebar = always_show_diagnostics_sidebar;
    }
    if let Some(theme_mode) = payload.theme_mode.as_deref() {
        match normalize_theme_mode(theme_mode) {
            Ok(value) => {
                global_settings.theme_mode = value;
            }
            Err(error) => {
                return GlobalSettingsResponse {
                    request_id,
                    ok: false,
                    global_settings: Some(global_settings),
                    error: Some(error),
                }
            }
        }
    }
    let settings_file = match global_settings_file(&app) {
        Ok(path) => path,
        Err(error) => {
            return GlobalSettingsResponse {
                request_id,
                ok: false,
                global_settings: Some(global_settings),
                error: Some(error),
            }
        }
    };

    if let Err(error) = write_global_settings_file(&settings_file, &global_settings) {
        return GlobalSettingsResponse {
            request_id,
            ok: false,
            global_settings: Some(global_settings),
            error: Some(error),
        };
    }

    GlobalSettingsResponse {
        request_id,
        ok: true,
        global_settings: Some(global_settings),
        error: None,
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
    if let Some(telemetry_enabled) = payload.telemetry_enabled {
        workspace_meta.telemetry_enabled = telemetry_enabled;
    }
    if let Some(disable_groove_loading_section) = payload.disable_groove_loading_section {
        workspace_meta.disable_groove_loading_section = disable_groove_loading_section;
    }
    if let Some(show_fps) = payload.show_fps {
        workspace_meta.show_fps = show_fps;
    }
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

    invalidate_workspace_context_cache(&app, &workspace_root);

    WorkspaceTerminalSettingsResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        workspace_meta: Some(workspace_meta),
        error: None,
    }
}

#[tauri::command]
fn workspace_update_commands_settings(
    app: AppHandle,
    payload: WorkspaceCommandSettingsPayload,
) -> WorkspaceTerminalSettingsResponse {
    let request_id = request_id();

    let play_groove_command = match normalize_play_groove_command(&payload.play_groove_command) {
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
    let testing_ports = normalize_testing_ports_from_u32(&payload.testing_ports);
    let open_terminal_at_worktree_command = match normalize_open_terminal_at_worktree_command(
        payload.open_terminal_at_worktree_command.as_deref(),
    ) {
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
    let run_local_command = match normalize_run_local_command(payload.run_local_command.as_deref())
    {
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

    workspace_meta.play_groove_command = play_groove_command;
    workspace_meta.testing_ports = testing_ports;
    workspace_meta.open_terminal_at_worktree_command = open_terminal_at_worktree_command;
    workspace_meta.run_local_command = run_local_command;
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

    invalidate_workspace_context_cache(&app, &workspace_root);

    WorkspaceTerminalSettingsResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        workspace_meta: Some(workspace_meta),
        error: None,
    }
}

#[tauri::command]
fn workspace_update_worktree_symlink_paths(
    app: AppHandle,
    payload: WorkspaceWorktreeSymlinkPathsPayload,
) -> WorkspaceTerminalSettingsResponse {
    let request_id = request_id();
    let worktree_symlink_paths = match validate_worktree_symlink_paths(&payload.worktree_symlink_paths)
    {
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

    workspace_meta.worktree_symlink_paths = worktree_symlink_paths;
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

    invalidate_workspace_context_cache(&app, &workspace_root);

    WorkspaceTerminalSettingsResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        workspace_meta: Some(workspace_meta),
        error: None,
    }
}

#[tauri::command]
fn workspace_list_symlink_entries(
    app: AppHandle,
    payload: WorkspaceBrowseEntriesPayload,
) -> WorkspaceBrowseEntriesResponse {
    let request_id = request_id();
    let relative_path = match normalize_browse_relative_path(payload.relative_path.as_deref()) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceBrowseEntriesResponse {
                request_id,
                ok: false,
                workspace_root: None,
                relative_path: String::new(),
                entries: Vec::new(),
                error: Some(error),
            }
        }
    };

    let persisted_root = match read_persisted_active_workspace_root(&app) {
        Ok(Some(value)) => value,
        Ok(None) => {
            return WorkspaceBrowseEntriesResponse {
                request_id,
                ok: false,
                workspace_root: None,
                relative_path,
                entries: Vec::new(),
                error: Some("No active workspace selected.".to_string()),
            }
        }
        Err(error) => {
            return WorkspaceBrowseEntriesResponse {
                request_id,
                ok: false,
                workspace_root: None,
                relative_path,
                entries: Vec::new(),
                error: Some(error),
            }
        }
    };

    let workspace_root = match validate_workspace_root_path(&persisted_root) {
        Ok(root) => root,
        Err(error) => {
            return WorkspaceBrowseEntriesResponse {
                request_id,
                ok: false,
                workspace_root: Some(persisted_root),
                relative_path,
                entries: Vec::new(),
                error: Some(error),
            }
        }
    };

    let browse_root = if relative_path.is_empty() {
        workspace_root.clone()
    } else {
        workspace_root.join(&relative_path)
    };
    if !path_is_directory(&browse_root) {
        return WorkspaceBrowseEntriesResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            relative_path,
            entries: Vec::new(),
            error: Some("Requested path is not a directory in this workspace.".to_string()),
        };
    }

    let mut entries = Vec::new();
    let read_dir = match fs::read_dir(&browse_root) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceBrowseEntriesResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                relative_path,
                entries: Vec::new(),
                error: Some(format!(
                    "Failed to read directory \"{}\": {error}",
                    browse_root.display()
                )),
            }
        }
    };

    for entry in read_dir {
        let entry = match entry {
            Ok(value) => value,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        if name.trim().is_empty() {
            continue;
        }

        if relative_path.is_empty() && is_restricted_worktree_symlink_path(&name) {
            continue;
        }

        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        let child_relative_path = if relative_path.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", relative_path, name)
        };

        entries.push(WorkspaceBrowseEntry {
            name,
            path: child_relative_path,
            is_dir: file_type.is_dir(),
        });
    }

    entries.sort_by(|left, right| {
        right
            .is_dir
            .cmp(&left.is_dir)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    WorkspaceBrowseEntriesResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        relative_path,
        entries,
        error: None,
    }
}

#[tauri::command]
fn workspace_open_terminal(
    app: AppHandle,
    terminal_state: State<GrooveTerminalState>,
    payload: TestingEnvironmentStartPayload,
) -> GrooveCommandResponse {
    let request_id = request_id();

    let Some(worktree) = payload
        .worktree
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return GrooveCommandResponse {
            request_id,
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error: Some("worktree is required and must be a non-empty string.".to_string()),
        };
    };

    if !is_safe_path_token(worktree) {
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

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        Some(worktree),
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

    let worktree_path = match ensure_worktree_in_dir(&workspace_root, worktree, ".worktrees") {
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

    let workspace_meta = match ensure_workspace_meta(&workspace_root) {
        Ok((meta, _)) => meta,
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

    let launched_command = if workspace_meta
        .open_terminal_at_worktree_command
        .as_deref()
        .map(str::trim)
        .is_some_and(is_groove_terminal_open_command)
    {
        match open_groove_terminal_session(
            &app,
            &terminal_state,
            &workspace_root,
            worktree,
            &worktree_path,
            GrooveTerminalOpenMode::Plain,
            None,
            None,
            None,
            false,
            true,
        ) {
            Ok(session) => session.command,
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
        }
    } else {
        match launch_open_terminal_at_worktree_command(&worktree_path, &workspace_meta) {
            Ok(command) => command,
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
        }
    };

    if let Err(error) = record_worktree_last_executed_at(&app, &workspace_root, worktree) {
        return GrooveCommandResponse {
            request_id,
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error: Some(error),
        };
    }

    GrooveCommandResponse {
        request_id,
        ok: true,
        exit_code: Some(0),
        stdout: format!("Opened terminal using: {launched_command}"),
        stderr: String::new(),
        error: None,
    }
}

#[tauri::command]
fn workspace_open_workspace_terminal(
    app: AppHandle,
    payload: TestingEnvironmentStatusPayload,
) -> GrooveCommandResponse {
    let request_id = request_id();

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

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        None,
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

    let workspace_meta = match ensure_workspace_meta(&workspace_root) {
        Ok((meta, _)) => meta,
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

    let launched_command = match launch_open_terminal_at_worktree_command(&workspace_root, &workspace_meta) {
        Ok(command) => command,
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

    GrooveCommandResponse {
        request_id,
        ok: true,
        exit_code: Some(0),
        stdout: format!("Opened terminal using: {launched_command}"),
        stderr: String::new(),
        error: None,
    }
}

#[tauri::command]
fn groove_terminal_open(
    app: AppHandle,
    state: State<GrooveTerminalState>,
    payload: GrooveTerminalOpenPayload,
) -> GrooveTerminalResponse {
    let request_id = request_id();
    let worktree = payload.worktree.trim();
    if worktree.is_empty() {
        return GrooveTerminalResponse {
            request_id,
            ok: false,
            session: None,
            error: Some("worktree is required and must be a non-empty string.".to_string()),
        };
    }

    let target = match validate_groove_terminal_target(payload.target.as_deref()) {
        Ok(value) => value,
        Err(error) => {
            return GrooveTerminalResponse {
                request_id,
                ok: false,
                session: None,
                error: Some(error),
            };
        }
    };

    let open_mode = match validate_groove_terminal_open_mode(payload.open_mode.as_deref()) {
        Ok(value) => value,
        Err(error) => {
            return GrooveTerminalResponse {
                request_id,
                ok: false,
                session: None,
                error: Some(error),
            };
        }
    };

    let (workspace_root, worktree_path) = match resolve_terminal_worktree_context(
        &app,
        &payload.root_name,
        &payload.known_worktrees,
        &payload.workspace_meta,
        worktree,
    ) {
        Ok(value) => value,
        Err(error) => {
            return GrooveTerminalResponse {
                request_id,
                ok: false,
                session: None,
                error: Some(error),
            };
        }
    };

    match open_groove_terminal_session(
        &app,
        &state,
        &workspace_root,
        worktree,
        &worktree_path,
        open_mode,
        target.as_deref(),
        payload.cols,
        payload.rows,
        payload.force_restart.unwrap_or(false),
        payload.open_new.unwrap_or(false),
    ) {
        Ok(session) => GrooveTerminalResponse {
            request_id,
            ok: true,
            session: Some(session),
            error: None,
        },
        Err(error) => GrooveTerminalResponse {
            request_id,
            ok: false,
            session: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
fn groove_terminal_write(
    app: AppHandle,
    state: State<GrooveTerminalState>,
    payload: GrooveTerminalWritePayload,
) -> GrooveTerminalResponse {
    let request_id = request_id();
    let worktree = payload.worktree.trim();
    if worktree.is_empty() {
        return GrooveTerminalResponse {
            request_id,
            ok: false,
            session: None,
            error: Some("worktree is required and must be a non-empty string.".to_string()),
        };
    }

    let (workspace_root, _) = match resolve_terminal_worktree_context(
        &app,
        &payload.root_name,
        &payload.known_worktrees,
        &payload.workspace_meta,
        worktree,
    ) {
        Ok(value) => value,
        Err(error) => {
            return GrooveTerminalResponse {
                request_id,
                ok: false,
                session: None,
                error: Some(error),
            };
        }
    };

    let worktree_key = groove_terminal_session_key(&workspace_root, worktree);
    let mut sessions_state = match state.inner.lock() {
        Ok(value) => value,
        Err(error) => {
            return GrooveTerminalResponse {
                request_id,
                ok: false,
                session: None,
                error: Some(format!("Failed to acquire Groove terminal state lock: {error}")),
            }
        }
    };

    let session_id = match resolve_terminal_session_id(
        &sessions_state,
        &worktree_key,
        payload.session_id.as_deref(),
    ) {
        Ok(value) => value,
        Err(error) => {
            return GrooveTerminalResponse {
                request_id,
                ok: false,
                session: None,
                error: Some(error),
            };
        }
    };

    let Some(session) = sessions_state.sessions_by_id.get_mut(&session_id) else {
        return GrooveTerminalResponse {
            request_id,
            ok: false,
            session: None,
            error: Some("No active Groove terminal session found for this worktree.".to_string()),
        };
    };

    if let Err(error) = session.writer.write_all(payload.input.as_bytes()) {
        return GrooveTerminalResponse {
            request_id,
            ok: false,
            session: None,
            error: Some(format!("Failed to write to Groove terminal session: {error}")),
        };
    }

    GrooveTerminalResponse {
        request_id,
        ok: true,
        session: Some(groove_terminal_session_from_state(session)),
        error: None,
    }
}

#[tauri::command]
fn groove_terminal_resize(
    app: AppHandle,
    state: State<GrooveTerminalState>,
    payload: GrooveTerminalResizePayload,
) -> GrooveTerminalResponse {
    let request_id = request_id();
    let worktree = payload.worktree.trim();
    if worktree.is_empty() {
        return GrooveTerminalResponse {
            request_id,
            ok: false,
            session: None,
            error: Some("worktree is required and must be a non-empty string.".to_string()),
        };
    }

    let (workspace_root, _) = match resolve_terminal_worktree_context(
        &app,
        &payload.root_name,
        &payload.known_worktrees,
        &payload.workspace_meta,
        worktree,
    ) {
        Ok(value) => value,
        Err(error) => {
            return GrooveTerminalResponse {
                request_id,
                ok: false,
                session: None,
                error: Some(error),
            };
        }
    };

    let worktree_key = groove_terminal_session_key(&workspace_root, worktree);
    let mut sessions_state = match state.inner.lock() {
        Ok(value) => value,
        Err(error) => {
            return GrooveTerminalResponse {
                request_id,
                ok: false,
                session: None,
                error: Some(format!("Failed to acquire Groove terminal state lock: {error}")),
            }
        }
    };

    let session_id = match resolve_terminal_session_id(
        &sessions_state,
        &worktree_key,
        payload.session_id.as_deref(),
    ) {
        Ok(value) => value,
        Err(error) => {
            return GrooveTerminalResponse {
                request_id,
                ok: false,
                session: None,
                error: Some(error),
            };
        }
    };

    let Some(session) = sessions_state.sessions_by_id.get_mut(&session_id) else {
        return GrooveTerminalResponse {
            request_id,
            ok: false,
            session: None,
            error: Some("No active Groove terminal session found for this worktree.".to_string()),
        };
    };

    let cols = normalize_terminal_dimension(Some(payload.cols), DEFAULT_GROOVE_TERMINAL_COLS);
    let rows = normalize_terminal_dimension(Some(payload.rows), DEFAULT_GROOVE_TERMINAL_ROWS);
    if let Err(error) = session.master.resize(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }) {
        return GrooveTerminalResponse {
            request_id,
            ok: false,
            session: None,
            error: Some(format!("Failed to resize Groove terminal session: {error}")),
        };
    }

    session.cols = cols;
    session.rows = rows;

    GrooveTerminalResponse {
        request_id,
        ok: true,
        session: Some(groove_terminal_session_from_state(session)),
        error: None,
    }
}

#[tauri::command]
fn groove_terminal_close(
    app: AppHandle,
    state: State<GrooveTerminalState>,
    payload: GrooveTerminalClosePayload,
) -> GrooveTerminalResponse {
    let request_id = request_id();
    let telemetry_enabled = telemetry_enabled_for_app(&app);
    let worktree = payload.worktree.trim();
    if worktree.is_empty() {
        return GrooveTerminalResponse {
            request_id,
            ok: false,
            session: None,
            error: Some("worktree is required and must be a non-empty string.".to_string()),
        };
    }

    let (workspace_root, _) = match resolve_terminal_worktree_context(
        &app,
        &payload.root_name,
        &payload.known_worktrees,
        &payload.workspace_meta,
        worktree,
    ) {
        Ok(value) => value,
        Err(error) => {
            return GrooveTerminalResponse {
                request_id,
                ok: false,
                session: None,
                error: Some(error),
            };
        }
    };

    let worktree_key = groove_terminal_session_key(&workspace_root, worktree);
    let mut sessions_state = match state.inner.lock() {
        Ok(value) => value,
        Err(error) => {
            return GrooveTerminalResponse {
                request_id,
                ok: false,
                session: None,
                error: Some(format!("Failed to acquire Groove terminal state lock: {error}")),
            }
        }
    };

    let session_id = match resolve_terminal_session_id(
        &sessions_state,
        &worktree_key,
        payload.session_id.as_deref(),
    ) {
        Ok(value) => value,
        Err(error) => {
            if payload
                .session_id
                .as_deref()
                .map(str::trim)
                .filter(|candidate| !candidate.is_empty())
                .is_some()
            {
                return GrooveTerminalResponse {
                    request_id,
                    ok: false,
                    session: None,
                    error: Some(error),
                };
            }
            return GrooveTerminalResponse {
                request_id,
                ok: true,
                session: None,
                error: None,
            };
        }
    };

    let Some(mut session) = remove_session_by_id(&mut sessions_state, &session_id) else {
        return GrooveTerminalResponse {
            request_id,
            ok: true,
            session: None,
            error: None,
        };
    };
    drop(sessions_state);

    let closed_session_id = session.session_id.clone();
    let workspace_root_rendered = workspace_root.display().to_string();
    let kill_detail = match session.child.kill() {
        Ok(()) => "kill=ok".to_string(),
        Err(error) => format!("kill_error={error}"),
    };
    let exit_detail = collect_groove_terminal_exit_status(session.child.as_mut());
    let close_detail = format!("reason=requested {kill_detail} {exit_detail}");
    drop(session);
    log_play_telemetry(
        telemetry_enabled,
        "terminal.session.closed",
        format!(
            "workspace_root={} worktree={} session_id={} {}",
            workspace_root_rendered, worktree, closed_session_id, close_detail
        )
        .as_str(),
    );
    invalidate_groove_list_cache_for_workspace(&app, &workspace_root);
    emit_groove_terminal_lifecycle_event(
        &app,
        &closed_session_id,
        &workspace_root_rendered,
        worktree,
        "closed",
        Some(format!("Terminal session closed by request ({close_detail}).")),
    );

    GrooveTerminalResponse {
        request_id,
        ok: true,
        session: None,
        error: None,
    }
}

#[tauri::command]
fn groove_terminal_get_session(
    app: AppHandle,
    state: State<GrooveTerminalState>,
    payload: GrooveTerminalSessionPayload,
) -> GrooveTerminalResponse {
    let request_id = request_id();
    let worktree = payload.worktree.trim();
    if worktree.is_empty() {
        return GrooveTerminalResponse {
            request_id,
            ok: false,
            session: None,
            error: Some("worktree is required and must be a non-empty string.".to_string()),
        };
    }

    let (workspace_root, _) = match resolve_terminal_worktree_context(
        &app,
        &payload.root_name,
        &payload.known_worktrees,
        &payload.workspace_meta,
        worktree,
    ) {
        Ok(value) => value,
        Err(error) => {
            return GrooveTerminalResponse {
                request_id,
                ok: false,
                session: None,
                error: Some(error),
            };
        }
    };

    let worktree_key = groove_terminal_session_key(&workspace_root, worktree);
    let sessions_state = match state.inner.lock() {
        Ok(value) => value,
        Err(error) => {
            return GrooveTerminalResponse {
                request_id,
                ok: false,
                session: None,
                error: Some(format!("Failed to acquire Groove terminal state lock: {error}")),
            }
        }
    };

    GrooveTerminalResponse {
        request_id,
        ok: true,
        session: {
            let session_id = resolve_terminal_session_id(
                &sessions_state,
                &worktree_key,
                payload.session_id.as_deref(),
            )
            .ok();
            session_id
                .as_deref()
                .and_then(|value| sessions_state.sessions_by_id.get(value))
                .map(groove_terminal_session_with_snapshot_from_state)
        },
        error: None,
    }
}

#[tauri::command]
fn groove_terminal_list_sessions(
    app: AppHandle,
    state: State<GrooveTerminalState>,
    payload: GrooveTerminalSessionPayload,
) -> GrooveTerminalSessionsResponse {
    let request_id = request_id();
    let worktree = payload.worktree.trim();
    if worktree.is_empty() {
        return GrooveTerminalSessionsResponse {
            request_id,
            ok: false,
            sessions: Vec::new(),
            error: Some("worktree is required and must be a non-empty string.".to_string()),
        };
    }

    let (workspace_root, _) = match resolve_terminal_worktree_context(
        &app,
        &payload.root_name,
        &payload.known_worktrees,
        &payload.workspace_meta,
        worktree,
    ) {
        Ok(value) => value,
        Err(error) => {
            return GrooveTerminalSessionsResponse {
                request_id,
                ok: false,
                sessions: Vec::new(),
                error: Some(error),
            };
        }
    };

    let worktree_key = groove_terminal_session_key(&workspace_root, worktree);
    let sessions_state = match state.inner.lock() {
        Ok(value) => value,
        Err(error) => {
            return GrooveTerminalSessionsResponse {
                request_id,
                ok: false,
                sessions: Vec::new(),
                error: Some(format!("Failed to acquire Groove terminal state lock: {error}")),
            }
        }
    };

    GrooveTerminalSessionsResponse {
        request_id,
        ok: true,
        sessions: sessions_for_worktree(&sessions_state, &worktree_key),
        error: None,
    }
}

#[tauri::command]
fn git_auth_status(payload: GitAuthStatusPayload) -> GitAuthStatusResponse {
    let request_id = request_id();
    let workspace_root = match validate_workspace_root_path(&payload.workspace_root) {
        Ok(root) => root,
        Err(error) => {
            return GitAuthStatusResponse {
                request_id,
                ok: false,
                workspace_root: None,
                profile: GitProfileStatus::default(),
                ssh_status: GitSshStatus::unknown(),
                error: Some(error),
            }
        }
    };

    let mut profile = GitProfileStatus::default();
    let mut ssh_status = GitSshStatus::unknown();

    let user_name_result =
        run_capture_command(&workspace_root, "git", &["config", "--get", "user.name"]);
    if user_name_result.error.is_none() && user_name_result.exit_code == Some(0) {
        profile.user_name = first_non_empty_line(&user_name_result.stdout);
    }

    let user_email_result =
        run_capture_command(&workspace_root, "git", &["config", "--get", "user.email"]);
    if user_email_result.error.is_none() && user_email_result.exit_code == Some(0) {
        profile.user_email = first_non_empty_line(&user_email_result.stdout);
    }

    let ssh_test_result = run_capture_command_timeout(
        &workspace_root,
        "ssh",
        &[
            "-T",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=5",
            "-o",
            "StrictHostKeyChecking=no",
            "-o",
            "UserKnownHostsFile=/dev/null",
            "git@github.com",
        ],
        Duration::from_secs(8),
    );
    let combined_output = format!("{}\n{}", ssh_test_result.stdout, ssh_test_result.stderr);
    let combined_lower = combined_output.to_lowercase();

    if combined_lower.contains("successfully authenticated") {
        ssh_status.state = "authenticated".to_string();
        ssh_status.message = "Authenticated with GitHub over SSH".to_string();
    } else if combined_lower.contains("permission denied")
        || combined_lower.contains("publickey")
        || combined_lower.contains("authentication failed")
    {
        ssh_status.state = "unauthenticated".to_string();
        ssh_status.message = "SSH authentication failed".to_string();
    } else if combined_lower.contains("connection timed out")
        || combined_lower.contains("operation timed out")
        || ssh_test_result
            .error
            .as_ref()
            .map(|value| value.to_lowercase().contains("timed out"))
            .unwrap_or(false)
    {
        ssh_status.state = "unreachable".to_string();
        ssh_status.message = "GitHub SSH check timed out".to_string();
    } else if combined_lower.contains("could not resolve hostname")
        || combined_lower.contains("temporary failure in name resolution")
        || combined_lower.contains("name or service not known")
        || combined_lower.contains("network is unreachable")
        || combined_lower.contains("no route to host")
        || combined_lower.contains("connection refused")
        || combined_lower.contains("connection closed")
        || combined_lower.contains("connection reset")
    {
        ssh_status.state = "unreachable".to_string();
        ssh_status.message = "GitHub SSH endpoint unreachable".to_string();
    } else if let Some(error) = ssh_test_result.error {
        let lower_error = error.to_lowercase();
        if lower_error.contains("no such file or directory") {
            ssh_status.state = "unavailable".to_string();
            ssh_status.message = "OpenSSH is not installed".to_string();
        } else {
            ssh_status.state = "unknown".to_string();
            ssh_status.message = "SSH check unavailable".to_string();
        }
    } else {
        ssh_status.state = "unknown".to_string();
        ssh_status.message = "SSH status unavailable".to_string();
    }

    GitAuthStatusResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        profile,
        ssh_status,
        error: None,
    }
}

#[tauri::command]
fn git_status(payload: GitPathPayload) -> GitStatusResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitStatusResponse {
                request_id,
                ok: false,
                path: None,
                modified: 0,
                added: 0,
                deleted: 0,
                untracked: 0,
                dirty: false,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(&worktree_path, &["status", "--porcelain=v1"]);
    if let Some(error) = result.error.clone() {
        return GitStatusResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            modified: 0,
            added: 0,
            deleted: 0,
            untracked: 0,
            dirty: false,
            output_snippet: None,
            error: Some(error),
        };
    }
    if result.exit_code != Some(0) {
        return GitStatusResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            modified: 0,
            added: 0,
            deleted: 0,
            untracked: 0,
            dirty: false,
            output_snippet: command_output_snippet(&result),
            error: Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git status failed".to_string()),
            ),
        };
    }

    let counts = parse_git_porcelain_counts(&result.stdout);
    GitStatusResponse {
        request_id,
        ok: true,
        path: Some(worktree_path.display().to_string()),
        modified: counts.modified,
        added: counts.added,
        deleted: counts.deleted,
        untracked: counts.untracked,
        dirty: counts.dirty(),
        output_snippet: command_output_snippet(&result),
        error: None,
    }
}

#[tauri::command]
fn git_current_branch(payload: GitPathPayload) -> GitCurrentBranchResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCurrentBranchResponse {
                request_id,
                ok: false,
                path: None,
                branch: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(&worktree_path, &["branch", "--show-current"]);
    if let Some(error) = result.error {
        return GitCurrentBranchResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            branch: None,
            output_snippet: None,
            error: Some(error),
        };
    }
    if result.exit_code != Some(0) {
        return GitCurrentBranchResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            branch: None,
            output_snippet: command_output_snippet(&result),
            error: Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git branch --show-current failed".to_string()),
            ),
        };
    }

    GitCurrentBranchResponse {
        request_id,
        ok: true,
        path: Some(worktree_path.display().to_string()),
        branch: first_non_empty_line(&result.stdout),
        output_snippet: command_output_snippet(&result),
        error: None,
    }
}

#[tauri::command]
fn git_list_branches(payload: GitPathPayload) -> GitListBranchesResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitListBranchesResponse {
                request_id,
                ok: false,
                path: None,
                branches: Vec::new(),
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(&worktree_path, &["branch", "--format=%(refname:short)"]);
    if let Some(error) = result.error.clone() {
        return GitListBranchesResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            branches: Vec::new(),
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }
    if result.exit_code != Some(0) {
        return GitListBranchesResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            branches: Vec::new(),
            output_snippet: command_output_snippet(&result),
            error: Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git branch --format failed".to_string()),
            ),
        };
    }

    let branches = result
        .stdout
        .lines()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();

    GitListBranchesResponse {
        request_id,
        ok: true,
        path: Some(worktree_path.display().to_string()),
        branches,
        output_snippet: command_output_snippet(&result),
        error: None,
    }
}

#[tauri::command]
fn git_ahead_behind(payload: GitPathPayload) -> GitAheadBehindResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitAheadBehindResponse {
                request_id,
                ok: false,
                path: None,
                ahead: 0,
                behind: 0,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(&worktree_path, &["status", "-sb"]);
    if let Some(error) = result.error {
        return GitAheadBehindResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            ahead: 0,
            behind: 0,
            output_snippet: None,
            error: Some(error),
        };
    }
    if result.exit_code != Some(0) {
        return GitAheadBehindResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            ahead: 0,
            behind: 0,
            output_snippet: command_output_snippet(&result),
            error: Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git status -sb failed".to_string()),
            ),
        };
    }

    let (ahead, behind) = parse_git_ahead_behind(&result.stdout);
    GitAheadBehindResponse {
        request_id,
        ok: true,
        path: Some(worktree_path.display().to_string()),
        ahead,
        behind,
        output_snippet: command_output_snippet(&result),
        error: None,
    }
}

#[tauri::command]
fn git_pull(payload: GitPullPayload) -> GitCommandResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: None,
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let args = if payload.rebase {
        vec!["pull", "--rebase"]
    } else {
        vec!["pull"]
    };
    let result = run_git_command_at_path(&worktree_path, &args);
    if let Some(error) = result.error.clone() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }

    let ok = result.exit_code == Some(0);
    GitCommandResponse {
        request_id,
        ok,
        path: Some(worktree_path.display().to_string()),
        exit_code: result.exit_code,
        output_snippet: command_output_snippet(&result),
        error: if ok {
            None
        } else {
            Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git pull failed".to_string()),
            )
        },
    }
}

#[tauri::command]
fn git_push(payload: GitPushPayload) -> GitCommandResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: None,
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let mut args = vec!["push"];
    if payload.force_with_lease {
        args.push("--force-with-lease");
    }

    if payload.set_upstream {
        let branch = payload
            .branch
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string())
            .or_else(|| {
                let current_branch =
                    run_git_command_at_path(&worktree_path, &["branch", "--show-current"]);
                first_non_empty_line(&current_branch.stdout)
            });

        let Some(branch) = branch else {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: Some(worktree_path.display().to_string()),
                exit_code: None,
                output_snippet: None,
                error: Some("branch is required when setUpstream is enabled.".to_string()),
            };
        };

        args.extend(["-u", "origin"]);
        args.push(branch.as_str());

        let result = run_git_command_at_path(&worktree_path, &args);
        if let Some(error) = result.error.clone() {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: Some(worktree_path.display().to_string()),
                exit_code: result.exit_code,
                output_snippet: command_output_snippet(&result),
                error: Some(error),
            };
        }

        let ok = result.exit_code == Some(0);
        return GitCommandResponse {
            request_id,
            ok,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: if ok {
                None
            } else {
                Some(
                    first_non_empty_line(&result.stderr)
                        .or_else(|| first_non_empty_line(&result.stdout))
                        .unwrap_or_else(|| "git push failed".to_string()),
                )
            },
        };
    }

    let result = run_git_command_at_path(&worktree_path, &args);
    if let Some(error) = result.error.clone() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }

    let ok = result.exit_code == Some(0);
    GitCommandResponse {
        request_id,
        ok,
        path: Some(worktree_path.display().to_string()),
        exit_code: result.exit_code,
        output_snippet: command_output_snippet(&result),
        error: if ok {
            None
        } else {
            Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git push failed".to_string()),
            )
        },
    }
}

#[tauri::command]
fn git_merge(payload: GitMergePayload) -> GitCommandResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: None,
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let target_branch = payload.target_branch.trim();
    if target_branch.is_empty() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: None,
            output_snippet: None,
            error: Some("targetBranch must be a non-empty string.".to_string()),
        };
    }

    let result = if payload.ff_only {
        run_git_command_at_path(&worktree_path, &["merge", "--ff-only", target_branch])
    } else {
        run_git_command_at_path(&worktree_path, &["merge", target_branch])
    };

    if let Some(error) = result.error.clone() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }

    let ok = result.exit_code == Some(0);
    GitCommandResponse {
        request_id,
        ok,
        path: Some(worktree_path.display().to_string()),
        exit_code: result.exit_code,
        output_snippet: command_output_snippet(&result),
        error: if ok {
            None
        } else {
            Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git merge failed".to_string()),
            )
        },
    }
}

#[tauri::command]
fn git_merge_abort(payload: GitPathPayload) -> GitCommandResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: None,
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(&worktree_path, &["merge", "--abort"]);
    if let Some(error) = result.error.clone() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }

    let ok = result.exit_code == Some(0);
    GitCommandResponse {
        request_id,
        ok,
        path: Some(worktree_path.display().to_string()),
        exit_code: result.exit_code,
        output_snippet: command_output_snippet(&result),
        error: if ok {
            None
        } else {
            Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git merge --abort failed".to_string()),
            )
        },
    }
}

#[tauri::command]
fn git_has_staged_changes(payload: GitPathPayload) -> GitBooleanResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitBooleanResponse {
                request_id,
                ok: false,
                path: None,
                value: false,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(&worktree_path, &["diff", "--cached", "--name-only"]);
    if let Some(error) = result.error {
        return GitBooleanResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            value: false,
            output_snippet: None,
            error: Some(error),
        };
    }
    if result.exit_code != Some(0) {
        return GitBooleanResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            value: false,
            output_snippet: command_output_snippet(&result),
            error: Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git diff --cached --name-only failed".to_string()),
            ),
        };
    }

    GitBooleanResponse {
        request_id,
        ok: true,
        path: Some(worktree_path.display().to_string()),
        value: result.stdout.lines().any(|line| !line.trim().is_empty()),
        output_snippet: command_output_snippet(&result),
        error: None,
    }
}

#[tauri::command]
fn git_merge_in_progress(payload: GitPathPayload) -> GitBooleanResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitBooleanResponse {
                request_id,
                ok: false,
                path: None,
                value: false,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(
        &worktree_path,
        &["rev-parse", "-q", "--verify", "MERGE_HEAD"],
    );
    if let Some(error) = result.error {
        return GitBooleanResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            value: false,
            output_snippet: None,
            error: Some(error),
        };
    }

    if result.exit_code == Some(0) {
        return GitBooleanResponse {
            request_id,
            ok: true,
            path: Some(worktree_path.display().to_string()),
            value: true,
            output_snippet: command_output_snippet(&result),
            error: None,
        };
    }

    if result.exit_code == Some(1) {
        return GitBooleanResponse {
            request_id,
            ok: true,
            path: Some(worktree_path.display().to_string()),
            value: false,
            output_snippet: command_output_snippet(&result),
            error: None,
        };
    }

    GitBooleanResponse {
        request_id,
        ok: false,
        path: Some(worktree_path.display().to_string()),
        value: false,
        output_snippet: command_output_snippet(&result),
        error: Some(
            first_non_empty_line(&result.stderr)
                .or_else(|| first_non_empty_line(&result.stdout))
                .unwrap_or_else(|| "git rev-parse -q --verify MERGE_HEAD failed".to_string()),
        ),
    }
}

#[tauri::command]
fn git_has_upstream(payload: GitPathPayload) -> GitBooleanResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitBooleanResponse {
                request_id,
                ok: false,
                path: None,
                value: false,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(
        &worktree_path,
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
    );
    if let Some(error) = result.error {
        return GitBooleanResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            value: false,
            output_snippet: None,
            error: Some(error),
        };
    }

    if result.exit_code == Some(0) {
        return GitBooleanResponse {
            request_id,
            ok: true,
            path: Some(worktree_path.display().to_string()),
            value: true,
            output_snippet: command_output_snippet(&result),
            error: None,
        };
    }

    GitBooleanResponse {
        request_id,
        ok: true,
        path: Some(worktree_path.display().to_string()),
        value: false,
        output_snippet: command_output_snippet(&result),
        error: None,
    }
}

#[tauri::command]
fn git_list_file_states(payload: GitPathPayload) -> GitFileStatesResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitFileStatesResponse {
                request_id,
                ok: false,
                path: None,
                staged: Vec::new(),
                unstaged: Vec::new(),
                untracked: Vec::new(),
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(&worktree_path, &["status", "--porcelain=v1"]);
    if let Some(error) = result.error.clone() {
        return GitFileStatesResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            staged: Vec::new(),
            unstaged: Vec::new(),
            untracked: Vec::new(),
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }
    if result.exit_code != Some(0) {
        return GitFileStatesResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            staged: Vec::new(),
            unstaged: Vec::new(),
            untracked: Vec::new(),
            output_snippet: command_output_snippet(&result),
            error: Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git status --porcelain=v1 failed".to_string()),
            ),
        };
    }

    let (staged, unstaged, untracked) = parse_git_file_states(&result.stdout);
    GitFileStatesResponse {
        request_id,
        ok: true,
        path: Some(worktree_path.display().to_string()),
        staged,
        unstaged,
        untracked,
        output_snippet: command_output_snippet(&result),
        error: None,
    }
}

#[tauri::command]
fn git_stage_files(payload: GitFilesPayload) -> GitCommandResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: None,
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };
    let files = match normalize_git_file_list(&payload.files) {
        Ok(files) => files,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: Some(worktree_path.display().to_string()),
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let mut args = vec!["add".to_string(), "--".to_string()];
    args.extend(files);
    let result = run_git_command_at_path_with_args(&worktree_path, &args);
    if let Some(error) = result.error.clone() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }

    let ok = result.exit_code == Some(0);
    GitCommandResponse {
        request_id,
        ok,
        path: Some(worktree_path.display().to_string()),
        exit_code: result.exit_code,
        output_snippet: command_output_snippet(&result),
        error: if ok {
            None
        } else {
            Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git add -- failed".to_string()),
            )
        },
    }
}

#[tauri::command]
fn git_unstage_files(payload: GitFilesPayload) -> GitCommandResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: None,
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };
    let files = match normalize_git_file_list(&payload.files) {
        Ok(files) => files,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: Some(worktree_path.display().to_string()),
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let mut args = vec![
        "restore".to_string(),
        "--staged".to_string(),
        "--".to_string(),
    ];
    args.extend(files);
    let result = run_git_command_at_path_with_args(&worktree_path, &args);
    if let Some(error) = result.error.clone() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }

    let ok = result.exit_code == Some(0);
    GitCommandResponse {
        request_id,
        ok,
        path: Some(worktree_path.display().to_string()),
        exit_code: result.exit_code,
        output_snippet: command_output_snippet(&result),
        error: if ok {
            None
        } else {
            Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git restore --staged -- failed".to_string()),
            )
        },
    }
}

#[tauri::command]
fn git_add(payload: GitPathPayload) -> GitCommandResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: None,
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(&worktree_path, &["add", "-A"]);
    if let Some(error) = result.error.clone() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }

    let ok = result.exit_code == Some(0);
    GitCommandResponse {
        request_id,
        ok,
        path: Some(worktree_path.display().to_string()),
        exit_code: result.exit_code,
        output_snippet: command_output_snippet(&result),
        error: if ok {
            None
        } else {
            Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git add -A failed".to_string()),
            )
        },
    }
}

#[tauri::command]
fn git_commit(payload: GitCommitPayload) -> GitCommandResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: None,
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let message = payload
        .message
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("chore: update files");

    let result = run_git_command_at_path(&worktree_path, &["commit", "-m", message]);
    if let Some(error) = result.error.clone() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }

    let ok = result.exit_code == Some(0);
    GitCommandResponse {
        request_id,
        ok,
        path: Some(worktree_path.display().to_string()),
        exit_code: result.exit_code,
        output_snippet: command_output_snippet(&result),
        error: if ok {
            None
        } else {
            Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git commit failed".to_string()),
            )
        },
    }
}

#[tauri::command]
fn gh_detect_repo(payload: GhDetectRepoPayload) -> GhDetectRepoResponse {
    let request_id = request_id();
    let input_path = match validate_existing_path(&payload.path) {
        Ok(value) => value,
        Err(error) => {
            return GhDetectRepoResponse {
                request_id,
                ok: false,
                repository_root: None,
                remote_name: None,
                remote_url: None,
                host: None,
                owner: None,
                repo: None,
                name_with_owner: None,
                repository_url: None,
                verified: false,
                message: None,
                error: Some(error),
            }
        }
    };

    let repository_root = match git_repository_root_from_path(&input_path) {
        Ok(value) => value,
        Err(error) => {
            return GhDetectRepoResponse {
                request_id,
                ok: false,
                repository_root: None,
                remote_name: None,
                remote_url: None,
                host: None,
                owner: None,
                repo: None,
                name_with_owner: None,
                repository_url: None,
                verified: false,
                message: None,
                error: Some(error),
            }
        }
    };

    let mut response = GhDetectRepoResponse {
        request_id,
        ok: true,
        repository_root: Some(repository_root.display().to_string()),
        remote_name: None,
        remote_url: None,
        host: None,
        owner: None,
        repo: None,
        name_with_owner: None,
        repository_url: None,
        verified: false,
        message: None,
        error: None,
    };

    let Some((remote_name, remote_url)) = resolve_remote_url_with_fallback(&repository_root) else {
        response.message = Some("No git remote found for this repository.".to_string());
        return response;
    };
    response.remote_name = Some(remote_name);
    response.remote_url = Some(remote_url.clone());

    let Some((host, owner, repo)) = normalize_remote_repo_info(&remote_url) else {
        response.message =
            Some("Could not parse owner/repo from repository remote URL.".to_string());
        return response;
    };

    response.host = Some(host.clone());
    response.owner = Some(owner.clone());
    response.repo = Some(repo.clone());

    let gh_version = run_capture_command(&repository_root, "gh", &["--version"]);
    if gh_version.error.is_some() || gh_version.exit_code != Some(0) {
        response.message =
            Some("GitHub CLI not available; repository verification skipped.".to_string());
        return response;
    }

    let repo_arg = format!("{owner}/{repo}");
    let verify = run_capture_command(
        &repository_root,
        "gh",
        &[
            "repo",
            "view",
            &repo_arg,
            "--hostname",
            &host,
            "--json",
            "nameWithOwner,url",
        ],
    );

    if verify.error.is_some() || verify.exit_code != Some(0) {
        let detail = first_non_empty_line(&verify.stderr)
            .or_else(|| first_non_empty_line(&verify.stdout))
            .unwrap_or_else(|| "Repository verification failed.".to_string());
        response.message = Some(detail);
        return response;
    }

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&verify.stdout) {
        response.name_with_owner = value
            .get("nameWithOwner")
            .and_then(|field| field.as_str())
            .map(|field| field.to_string());
        response.repository_url = value
            .get("url")
            .and_then(|field| field.as_str())
            .map(|field| field.to_string());
        response.verified = true;
    } else {
        response.message = Some("Repository verification returned unparseable output.".to_string());
    }

    response
}

#[tauri::command]
fn gh_auth_status(payload: GhAuthStatusPayload) -> GhAuthStatusResponse {
    let request_id = request_id();
    let cwd = command_cwd();

    let gh_version = run_capture_command(&cwd, "gh", &["--version"]);
    if gh_version.error.is_some() || gh_version.exit_code != Some(0) {
        return GhAuthStatusResponse {
            request_id,
            ok: true,
            installed: false,
            authenticated: false,
            hostname: payload.hostname,
            username: None,
            message: "GitHub CLI is not installed or not available in PATH.".to_string(),
            error: None,
        };
    }

    let raw_hostname = payload
        .hostname
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let normalized_host = normalize_gh_hostname(raw_hostname);
    let repo_host_hint = infer_gh_host_hint_from_payload(&payload, &cwd);

    let mut used_plain_status = false;
    let mut status = if let Some(hostname) = normalized_host.as_deref() {
        run_capture_command(&cwd, "gh", &["auth", "status", "--hostname", hostname])
    } else {
        used_plain_status = true;
        run_capture_command(&cwd, "gh", &["auth", "status"])
    };

    if !used_plain_status && status.exit_code != Some(0) {
        status = run_capture_command(&cwd, "gh", &["auth", "status"]);
        used_plain_status = true;
    }

    let combined_output = format!("{}\n{}", status.stdout, status.stderr);
    let parse_preferred_host = if used_plain_status {
        repo_host_hint.as_deref()
    } else {
        normalized_host.as_deref()
    };
    let (detected_host, parsed_username) =
        parse_gh_auth_identity(&combined_output, parse_preferred_host);
    let authenticated = status.exit_code == Some(0);
    let resolved_host = detected_host.or(normalized_host).or(repo_host_hint);
    let username = if authenticated {
        parsed_username.or_else(|| {
            gh_api_user_login(&cwd, resolved_host.as_deref()).or_else(|| {
                if resolved_host.is_some() {
                    gh_api_user_login(&cwd, None)
                } else {
                    None
                }
            })
        })
    } else {
        None
    };

    let message = if authenticated {
        "Authenticated via GitHub CLI session.".to_string()
    } else {
        "Run gh auth login in your terminal".to_string()
    };

    GhAuthStatusResponse {
        request_id,
        ok: true,
        installed: true,
        authenticated,
        hostname: resolved_host,
        username,
        message,
        error: None,
    }
}

#[tauri::command]
fn gh_auth_logout(payload: GhAuthLogoutPayload) -> GhAuthLogoutResponse {
    let request_id = request_id();
    let cwd = command_cwd();

    let gh_version = run_capture_command(&cwd, "gh", &["--version"]);
    if gh_version.error.is_some() || gh_version.exit_code != Some(0) {
        return GhAuthLogoutResponse {
            request_id,
            ok: false,
            hostname: payload.hostname,
            message: "GitHub CLI is not installed or not available in PATH.".to_string(),
            error: Some("gh not installed".to_string()),
        };
    }

    let mut hostname = payload
        .hostname
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_lowercase());

    if hostname.is_none() {
        let status = run_capture_command(&cwd, "gh", &["auth", "status"]);
        let combined_output = format!("{}\n{}", status.stdout, status.stderr);
        let (detected_host, _) = parse_gh_auth_identity(&combined_output, None);
        hostname = detected_host;
    }

    let Some(hostname_value) = hostname else {
        return GhAuthLogoutResponse {
            request_id,
            ok: false,
            hostname: None,
            message: "No authenticated gh host found to log out from.".to_string(),
            error: Some("hostname unavailable".to_string()),
        };
    };

    let logout = run_capture_command(
        &cwd,
        "gh",
        &["auth", "logout", "--hostname", &hostname_value, "--yes"],
    );

    let combined = format!("{}\n{}", logout.stdout, logout.stderr).to_lowercase();
    let already_logged_out =
        combined.contains("not logged in") || combined.contains("no oauth token");
    let success = logout.exit_code == Some(0) || already_logged_out;

    GhAuthLogoutResponse {
        request_id,
        ok: success,
        hostname: Some(hostname_value),
        message: if success {
            "Logged out. Run gh auth login in your terminal".to_string()
        } else {
            "Failed to log out current gh session.".to_string()
        },
        error: if success {
            None
        } else {
            Some(
                first_non_empty_line(&logout.stderr)
                    .or_else(|| first_non_empty_line(&logout.stdout))
                    .unwrap_or_else(|| "gh auth logout failed".to_string()),
            )
        },
    }
}

#[tauri::command]
fn gh_pr_list(payload: GhPrListPayload) -> GhPrListResponse {
    let request_id = request_id();
    let repository =
        match normalize_gh_repository(&payload.owner, &payload.repo, payload.hostname.as_deref()) {
            Ok(value) => value,
            Err(error) => {
                return GhPrListResponse {
                    request_id,
                    ok: false,
                    repository: String::new(),
                    prs: Vec::new(),
                    error: Some(error),
                }
            }
        };

    let cwd = command_cwd();
    let result = run_capture_command(
        &cwd,
        "gh",
        &[
            "pr",
            "list",
            "--repo",
            &repository,
            "--json",
            "number,title,state,headRefName,baseRefName,url",
        ],
    );

    if let Some(error) = result.error {
        return GhPrListResponse {
            request_id,
            ok: false,
            repository,
            prs: Vec::new(),
            error: Some(error),
        };
    }
    if result.exit_code != Some(0) {
        return GhPrListResponse {
            request_id,
            ok: false,
            repository,
            prs: Vec::new(),
            error: Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "gh pr list failed".to_string()),
            ),
        };
    }

    let mut prs = Vec::<GhPullRequestItem>::new();
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&result.stdout) {
        if let Some(items) = value.as_array() {
            for item in items {
                prs.push(GhPullRequestItem {
                    number: item
                        .get("number")
                        .and_then(|field| field.as_i64())
                        .unwrap_or_default(),
                    title: item
                        .get("title")
                        .and_then(|field| field.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    state: item
                        .get("state")
                        .and_then(|field| field.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    head_ref_name: item
                        .get("headRefName")
                        .and_then(|field| field.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    base_ref_name: item
                        .get("baseRefName")
                        .and_then(|field| field.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    url: item
                        .get("url")
                        .and_then(|field| field.as_str())
                        .unwrap_or_default()
                        .to_string(),
                });
            }
        }
    }

    GhPrListResponse {
        request_id,
        ok: true,
        repository,
        prs,
        error: None,
    }
}

#[tauri::command]
fn gh_pr_create(payload: GhPrCreatePayload) -> GhPrCreateResponse {
    let request_id = request_id();
    let repository =
        match normalize_gh_repository(&payload.owner, &payload.repo, payload.hostname.as_deref()) {
            Ok(value) => value,
            Err(error) => {
                return GhPrCreateResponse {
                    request_id,
                    ok: false,
                    repository: String::new(),
                    url: None,
                    message: None,
                    error: Some(error),
                }
            }
        };

    let base = payload.base.trim();
    let head = payload.head.trim();
    let title = payload.title.trim();
    if base.is_empty() || head.is_empty() || title.is_empty() {
        return GhPrCreateResponse {
            request_id,
            ok: false,
            repository,
            url: None,
            message: None,
            error: Some("base, head, and title are required for PR creation.".to_string()),
        };
    }

    let cwd = command_cwd();
    let result = run_capture_command(
        &cwd,
        "gh",
        &[
            "pr",
            "create",
            "--repo",
            &repository,
            "--base",
            base,
            "--head",
            head,
            "--title",
            title,
            "--body",
            &payload.body,
        ],
    );

    if let Some(error) = result.error {
        return GhPrCreateResponse {
            request_id,
            ok: false,
            repository,
            url: None,
            message: None,
            error: Some(error),
        };
    }

    if result.exit_code != Some(0) {
        return GhPrCreateResponse {
            request_id,
            ok: false,
            repository,
            url: None,
            message: None,
            error: Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "gh pr create failed".to_string()),
            ),
        };
    }

    let url = parse_first_url(&result.stdout).or_else(|| parse_first_url(&result.stderr));
    GhPrCreateResponse {
        request_id,
        ok: true,
        repository,
        url,
        message: Some("Pull request created through GitHub CLI.".to_string()),
        error: None,
    }
}

#[tauri::command]
fn open_external_url(url: String) -> ExternalUrlOpenResponse {
    let request_id = request_id();
    let trimmed_url = url.trim();

    if trimmed_url.is_empty() {
        return ExternalUrlOpenResponse {
            request_id,
            ok: false,
            error: Some("URL must not be empty.".to_string()),
        };
    }

    if !trimmed_url.starts_with("http://") && !trimmed_url.starts_with("https://") {
        return ExternalUrlOpenResponse {
            request_id,
            ok: false,
            error: Some("URL must start with http:// or https://.".to_string()),
        };
    }

    match open_url_in_default_browser(trimmed_url) {
        Ok(()) => ExternalUrlOpenResponse {
            request_id,
            ok: true,
            error: None,
        },
        Err(error) => ExternalUrlOpenResponse {
            request_id,
            ok: false,
            error: Some(error),
        },
    }
}

#[tauri::command]
fn gh_open_branch(payload: GhBranchActionPayload) -> GhBranchActionResponse {
    let request_id = request_id();
    let (cwd, branch) = match validate_gh_branch_action_payload(&payload) {
        Ok(values) => values,
        Err(error) => {
            return GhBranchActionResponse {
                request_id,
                ok: false,
                branch: None,
                message: None,
                error: Some(error),
            }
        }
    };

    let result = run_capture_command(&cwd, "gh", &["browse", &branch]);
    if let Some(error) = result.error {
        return GhBranchActionResponse {
            request_id,
            ok: false,
            branch: Some(branch),
            message: None,
            error: Some(error),
        };
    }
    if result.exit_code != Some(0) {
        return GhBranchActionResponse {
            request_id,
            ok: false,
            branch: Some(branch),
            message: None,
            error: Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "gh browse failed".to_string()),
            ),
        };
    }

    GhBranchActionResponse {
        request_id,
        ok: true,
        branch: Some(branch),
        message: Some("Opened branch in browser via GitHub CLI.".to_string()),
        error: None,
    }
}

#[tauri::command]
fn gh_open_active_pr(payload: GhBranchActionPayload) -> GhBranchActionResponse {
    let request_id = request_id();
    let (cwd, branch) = match validate_gh_branch_action_payload(&payload) {
        Ok(values) => values,
        Err(error) => {
            return GhBranchActionResponse {
                request_id,
                ok: false,
                branch: None,
                message: None,
                error: Some(error),
            }
        }
    };

    let result = run_capture_command(&cwd, "gh", &["pr", "view", &branch, "--web"]);
    if let Some(error) = result.error {
        return GhBranchActionResponse {
            request_id,
            ok: false,
            branch: Some(branch),
            message: None,
            error: Some(error),
        };
    }
    if result.exit_code != Some(0) {
        return GhBranchActionResponse {
            request_id,
            ok: false,
            branch: Some(branch),
            message: None,
            error: Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "gh pr view failed".to_string()),
            ),
        };
    }

    GhBranchActionResponse {
        request_id,
        ok: true,
        branch: Some(branch),
        message: Some("Opened active pull request in browser via GitHub CLI.".to_string()),
        error: None,
    }
}

#[tauri::command]
fn gh_check_branch_pr(payload: GhBranchActionPayload) -> GhCheckBranchPrResponse {
    let request_id = request_id();
    let (cwd, branch) = match validate_gh_branch_action_payload(&payload) {
        Ok(values) => values,
        Err(error) => {
            return GhCheckBranchPrResponse {
                request_id,
                ok: false,
                branch: payload.branch.trim().to_string(),
                prs: Vec::new(),
                active_pr: None,
                error: Some(error),
            }
        }
    };

    let result = run_capture_command(
        &cwd,
        "gh",
        &[
            "pr",
            "list",
            "--head",
            &branch,
            "--state",
            "open",
            "--json",
            "number,title,url",
        ],
    );

    if let Some(error) = result.error {
        return GhCheckBranchPrResponse {
            request_id,
            ok: false,
            branch,
            prs: Vec::new(),
            active_pr: None,
            error: Some(error),
        };
    }
    if result.exit_code != Some(0) {
        return GhCheckBranchPrResponse {
            request_id,
            ok: false,
            branch,
            prs: Vec::new(),
            active_pr: None,
            error: Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "gh pr list failed".to_string()),
            ),
        };
    }

    let mut prs = Vec::<GhBranchPrItem>::new();
    match serde_json::from_str::<serde_json::Value>(&result.stdout) {
        Ok(value) => {
            if let Some(items) = value.as_array() {
                for item in items {
                    prs.push(GhBranchPrItem {
                        number: item
                            .get("number")
                            .and_then(|field| field.as_i64())
                            .unwrap_or_default(),
                        title: item
                            .get("title")
                            .and_then(|field| field.as_str())
                            .unwrap_or_default()
                            .to_string(),
                        url: item
                            .get("url")
                            .and_then(|field| field.as_str())
                            .unwrap_or_default()
                            .to_string(),
                    });
                }
            }
        }
        Err(error) => {
            return GhCheckBranchPrResponse {
                request_id,
                ok: false,
                branch,
                prs: Vec::new(),
                active_pr: None,
                error: Some(format!("Failed to parse gh pr list JSON: {error}")),
            }
        }
    }

    let active_pr = if prs.len() == 1 {
        prs.first().cloned()
    } else {
        None
    };

    GhCheckBranchPrResponse {
        request_id,
        ok: true,
        branch,
        prs,
        active_pr,
        error: None,
    }
}

#[tauri::command]
async fn groove_list(app: AppHandle, payload: GrooveListPayload) -> GrooveListResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || {
        groove_list_blocking(app, payload, request_id)
    })
    .await
    {
        Ok(response) => response,
        Err(error) => GrooveListResponse {
            request_id: fallback_request_id,
            ok: false,
            workspace_root: None,
            rows: HashMap::new(),
            stdout: String::new(),
            stderr: String::new(),
            error: Some(format!("Failed to run groove list worker thread: {error}")),
        },
    }
}

fn groove_list_blocking(
    app: AppHandle,
    payload: GrooveListPayload,
    request_id: String,
) -> GrooveListResponse {
    let total_started_at = Instant::now();
    let mut exec_elapsed = Duration::ZERO;
    let mut parse_elapsed = Duration::ZERO;

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

    let telemetry_enabled = telemetry_enabled_for_app(&app);

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        None,
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => root,
        Err(error) => {
            let resolve_elapsed = total_started_at.elapsed();
            if telemetry_enabled {
                eprintln!(
                    "[startup-telemetry] event=groove_list resolve_ms={} exec_ms={} parse_ms={} total_ms={} outcome=resolve-error collector=none fallback_used=false",
                    resolve_elapsed.as_millis(),
                    exec_elapsed.as_millis(),
                    parse_elapsed.as_millis(),
                    total_started_at.elapsed().as_millis(),
                );
            }
            return GrooveListResponse {
                request_id,
                ok: false,
                workspace_root: None,
                rows: HashMap::new(),
                stdout: String::new(),
                stderr: String::new(),
                error: Some(error),
            };
        }
    };
    let resolve_elapsed = total_started_at.elapsed();

    let cache_key = groove_list_cache_key(
        &workspace_root,
        &known_worktrees,
        &dir,
        &payload.workspace_meta,
    );

    let mut stale_response: Option<GrooveListResponse> = None;
    let mut previous_native_cache: Option<GrooveListNativeCache> = None;
    if let Some(cache_state) = app.try_state::<GrooveListCacheState>() {
        if let Ok(mut entries) = cache_state.entries.lock() {
            if let Some(cached) = entries.get(&cache_key) {
                previous_native_cache = cached.native_cache.clone();
                let cache_age = cached.created_at.elapsed();
                if cache_age <= GROOVE_LIST_CACHE_TTL {
                    let mut response = cached.response.clone();
                    response.request_id = request_id;
                    if telemetry_enabled {
                        eprintln!(
                            "[startup-telemetry] event=groove_list resolve_ms={} exec_ms={} parse_ms={} total_ms={} cache_hit=true collector=cache fallback_used=false",
                            resolve_elapsed.as_millis(),
                            exec_elapsed.as_millis(),
                            parse_elapsed.as_millis(),
                            total_started_at.elapsed().as_millis(),
                        );
                    }
                    return response;
                }

                if cache_age <= GROOVE_LIST_CACHE_STALE_TTL {
                    stale_response = Some(cached.response.clone());
                } else {
                    entries.remove(&cache_key);
                }
            } else {
                entries.remove(&cache_key);
            }
        }
    }

    let mut wait_cell: Option<Arc<GrooveListInFlight>> = None;
    let mut leader_cell: Option<Arc<GrooveListInFlight>> = None;
    if let Some(cache_state) = app.try_state::<GrooveListCacheState>() {
        if let Ok(mut in_flight) = cache_state.in_flight.lock() {
            if let Some(existing) = in_flight.get(&cache_key) {
                wait_cell = Some(existing.clone());
            } else {
                let cell = Arc::new(GrooveListInFlight::new());
                in_flight.insert(cache_key.clone(), cell.clone());
                leader_cell = Some(cell);
            }
        }
    }

    if let Some(wait_cell) = wait_cell {
        if let Some(mut response) = stale_response {
            response.request_id = request_id;
            if telemetry_enabled {
                eprintln!(
                    "[startup-telemetry] event=groove_list resolve_ms={} exec_ms={} parse_ms={} total_ms={} stale_while_refresh=true collector=cache fallback_used=false",
                    resolve_elapsed.as_millis(),
                    exec_elapsed.as_millis(),
                    parse_elapsed.as_millis(),
                    total_started_at.elapsed().as_millis(),
                );
            }
            return response;
        }

        let mut guard = match wait_cell.response.lock() {
            Ok(guard) => guard,
            Err(_) => {
                return GrooveListResponse {
                    request_id,
                    ok: false,
                    workspace_root: Some(workspace_root.display().to_string()),
                    rows: HashMap::new(),
                    stdout: String::new(),
                    stderr: String::new(),
                    error: Some("Failed to wait for in-flight groove list request.".to_string()),
                };
            }
        };

        while guard.is_none() {
            guard = match wait_cell.cvar.wait(guard) {
                Ok(guard) => guard,
                Err(_) => {
                    return GrooveListResponse {
                        request_id,
                        ok: false,
                        workspace_root: Some(workspace_root.display().to_string()),
                        rows: HashMap::new(),
                        stdout: String::new(),
                        stderr: String::new(),
                        error: Some(
                            "Failed while waiting for in-flight groove list result.".to_string(),
                        ),
                    };
                }
            };
        }

        let mut response = guard.clone().unwrap_or_else(|| GrooveListResponse {
            request_id: String::new(),
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            rows: HashMap::new(),
            stdout: String::new(),
            stderr: String::new(),
            error: Some("In-flight groove list request returned no response.".to_string()),
        });
        response.request_id = request_id;
        if telemetry_enabled {
            eprintln!(
                "[startup-telemetry] event=groove_list resolve_ms={} exec_ms={} parse_ms={} total_ms={} deduped=true collector=cache fallback_used=false",
                resolve_elapsed.as_millis(),
                exec_elapsed.as_millis(),
                parse_elapsed.as_millis(),
                total_started_at.elapsed().as_millis(),
            );
        }
        return response;
    }

    let collector: String;
    let mut fallback_used = false;
    let mut native_error: Option<String> = None;
    let mut native_reused_worktrees = 0usize;
    let mut native_recomputed_worktrees = 0usize;
    let mut cache_native: Option<GrooveListNativeCache> = None;

    let mut response = if groove_list_native_enabled() {
        let native_started_at = Instant::now();
        match collect_groove_list_rows_native(
            &workspace_root,
            &known_worktrees,
            &dir,
            previous_native_cache.as_ref(),
        ) {
            Ok(native) => {
                exec_elapsed = native_started_at.elapsed();
                collector = "native".to_string();
                native_reused_worktrees = native.reused_worktrees;
                native_recomputed_worktrees = native.recomputed_worktrees;
                cache_native = Some(native.cache);
                GrooveListResponse {
                    request_id,
                    ok: true,
                    workspace_root: Some(workspace_root.display().to_string()),
                    rows: native.rows,
                    stdout: String::new(),
                    stderr: native.warning.unwrap_or_default(),
                    error: None,
                }
            }
            Err(error) => {
                fallback_used = true;
                native_error = Some(error);
                collector = "shell".to_string();
                let (result, rows, shell_exec_elapsed, shell_parse_elapsed) =
                    collect_groove_list_via_shell(&app, &workspace_root, &known_worktrees, &dir);
                exec_elapsed = shell_exec_elapsed;
                parse_elapsed = shell_parse_elapsed;

                if result.exit_code != Some(0) || result.error.is_some() {
                    GrooveListResponse {
                        request_id,
                        ok: false,
                        workspace_root: Some(workspace_root.display().to_string()),
                        rows: HashMap::new(),
                        stdout: result.stdout,
                        stderr: result.stderr,
                        error: result
                            .error
                            .or_else(|| Some("groove list failed.".to_string())),
                    }
                } else {
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
            }
        }
    } else {
        collector = "shell".to_string();
        let (result, rows, shell_exec_elapsed, shell_parse_elapsed) =
            collect_groove_list_via_shell(&app, &workspace_root, &known_worktrees, &dir);
        exec_elapsed = shell_exec_elapsed;
        parse_elapsed = shell_parse_elapsed;

        if result.exit_code != Some(0) || result.error.is_some() {
            GrooveListResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                rows: HashMap::new(),
                stdout: result.stdout,
                stderr: result.stderr,
                error: result
                    .error
                    .or_else(|| Some("groove list failed.".to_string())),
            }
        } else {
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
    };

    let terminal_integration = if response.ok {
        inject_groove_terminal_sessions_into_runtime_rows(&app, &workspace_root, &mut response.rows)
    } else {
        GrooveListTerminalIntegration::default()
    };
    let injected_worktrees = if terminal_integration.injected_worktrees.is_empty() {
        "<none>".to_string()
    } else {
        terminal_integration.injected_worktrees.join(",")
    };

    if response.ok && cache_native.is_none() {
        cache_native = previous_native_cache;
    }

    if !response.ok {
        if let Some(cache_state) = app.try_state::<GrooveListCacheState>() {
            if let Some(cell) = leader_cell {
                if let Ok(mut guard) = cell.response.lock() {
                    *guard = Some(response.clone());
                    cell.cvar.notify_all();
                }
                if let Ok(mut in_flight) = cache_state.in_flight.lock() {
                    in_flight.remove(&cache_key);
                }
            }
        }

        if telemetry_enabled {
            eprintln!(
                "[startup-telemetry] event=groove_list resolve_ms={} exec_ms={} parse_ms={} total_ms={} outcome=exec-error collector={} fallback_used={} native_error={} native_reused_worktrees={} native_recomputed_worktrees={} terminal_sessions={} terminal_workspace_sessions={} terminal_injected_worktrees={} terminal_integration_error={}",
                resolve_elapsed.as_millis(),
                exec_elapsed.as_millis(),
                parse_elapsed.as_millis(),
                total_started_at.elapsed().as_millis(),
                collector,
                fallback_used,
                native_error.is_some(),
                native_reused_worktrees,
                native_recomputed_worktrees,
                terminal_integration.session_count,
                terminal_integration.workspace_session_count,
                injected_worktrees,
                terminal_integration.integration_error.is_some(),
            );
        }

        return response;
    }

    if let Some(cache_state) = app.try_state::<GrooveListCacheState>() {
        if let Ok(mut entries) = cache_state.entries.lock() {
            entries.insert(
                cache_key.clone(),
                GrooveListCacheEntry {
                    created_at: Instant::now(),
                    response: response.clone(),
                    native_cache: cache_native,
                },
            );
        }
        if let Some(cell) = leader_cell {
            if let Ok(mut guard) = cell.response.lock() {
                *guard = Some(response.clone());
                cell.cvar.notify_all();
            }
            if let Ok(mut in_flight) = cache_state.in_flight.lock() {
                in_flight.remove(&cache_key);
            }
        }
    }

    if telemetry_enabled {
        eprintln!(
            "[startup-telemetry] event=groove_list resolve_ms={} exec_ms={} parse_ms={} total_ms={} outcome=ok collector={} fallback_used={} native_error={} native_reused_worktrees={} native_recomputed_worktrees={} terminal_sessions={} terminal_workspace_sessions={} terminal_injected_worktrees={} terminal_integration_error={}",
            resolve_elapsed.as_millis(),
            exec_elapsed.as_millis(),
            parse_elapsed.as_millis(),
            total_started_at.elapsed().as_millis(),
            collector,
            fallback_used,
            native_error.is_some(),
            native_reused_worktrees,
            native_recomputed_worktrees,
            terminal_integration.session_count,
            terminal_integration.workspace_session_count,
            injected_worktrees,
            terminal_integration.integration_error.is_some(),
        );
    }

    response
}

#[tauri::command]
fn groove_restore(
    app: AppHandle,
    terminal_state: State<GrooveTerminalState>,
    payload: GrooveRestorePayload,
) -> GrooveCommandResponse {
    let request_id = request_id();
    let telemetry_enabled = telemetry_enabled_for_app(&app);

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

    log_play_telemetry(
        telemetry_enabled,
        "groove_restore.start",
        format!(
            "request_id={} action={} worktree={} target={} root_name_present={} known_worktrees={}",
            request_id,
            action,
            worktree,
            target.as_deref().unwrap_or("<none>"),
            payload.root_name.is_some(),
            payload.known_worktrees.len()
        )
        .as_str(),
    );

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

    let (workspace_root, root_fallback_used) = match resolve_workspace_root(
        &app,
        &payload.root_name,
        Some(&worktree),
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => (root, false),
        Err(primary_error) => {
            log_play_telemetry(
                telemetry_enabled,
                "groove_restore.resolve_root_primary_failed",
                format!("request_id={} worktree={} error={primary_error}", request_id, worktree)
                    .as_str(),
            );
            match resolve_workspace_root(
                &app,
                &payload.root_name,
                None,
                &known_worktrees,
                &payload.workspace_meta,
            ) {
                Ok(root) => (root, true),
                Err(_) => {
                    log_play_telemetry(
                        telemetry_enabled,
                        "groove_restore.resolve_root_failed",
                        format!("request_id={} worktree={} error={primary_error}", request_id, worktree)
                            .as_str(),
                    );
                    return GrooveCommandResponse {
                        request_id,
                        ok: false,
                        exit_code: None,
                        stdout: String::new(),
                        stderr: String::new(),
                        error: Some(primary_error),
                    };
                }
            }
        }
    };
    let workspace_root_rendered = workspace_root.display().to_string();
    log_play_telemetry(
        telemetry_enabled,
        "groove_restore.resolve_root_ok",
        format!(
            "request_id={} workspace_root={} fallback_used={}",
            request_id, workspace_root_rendered, root_fallback_used
        )
        .as_str(),
    );

    let tombstone = match read_worktree_tombstone(&app, &workspace_root, &worktree) {
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

    let inferred_worktree_dir = if dir.is_none() {
        tombstone.as_ref().and_then(|value| {
            let tombstone_path = Path::new(&value.worktree_path);
            tombstone_path
                .parent()
                .and_then(|parent| parent.strip_prefix(&workspace_root).ok())
                .and_then(|relative| {
                    let rendered = relative.display().to_string();
                    if rendered.is_empty() {
                        None
                    } else {
                        Some(rendered)
                    }
                })
        })
    } else {
        None
    };

    let worktree_dir = dir
        .clone()
        .or(inferred_worktree_dir)
        .unwrap_or_else(|| ".worktrees".to_string());
    let expected_suffix = Path::new(&worktree_dir).join(&worktree);
    let expected_worktree_path = if workspace_root.ends_with(&expected_suffix) {
        workspace_root.clone()
    } else {
        workspace_root.join(&worktree_dir).join(&worktree)
    };
    log_play_telemetry(
        telemetry_enabled,
        "groove_restore.resolve_worktree",
        format!(
            "request_id={} workspace_root={} worktree_dir={} expected_worktree_path={}",
            request_id,
            workspace_root_rendered,
            worktree_dir,
            expected_worktree_path.display()
        )
        .as_str(),
    );
    if !path_is_directory(&expected_worktree_path) {
        let recreate_branch = tombstone
            .as_ref()
            .and_then(|value| value.branch_name.as_deref())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string())
            .unwrap_or_else(|| branch_guess_from_worktree_name(&worktree));

        log_play_telemetry(
            telemetry_enabled,
            "groove_restore.recreate_missing_worktree",
            format!(
                "request_id={} worktree={} recreate_branch={} worktree_dir={}",
                request_id, worktree, recreate_branch, worktree_dir
            )
            .as_str(),
        );

        let mut create_args = vec!["create".to_string(), recreate_branch];
        if worktree_dir != ".worktrees" {
            create_args.push("--dir".to_string());
            create_args.push(worktree_dir.clone());
        }

        let recreate_result = run_command(&groove_binary_path(&app), &create_args, &workspace_root);
        if recreate_result.exit_code != Some(0) || recreate_result.error.is_some() {
            log_play_telemetry(
                telemetry_enabled,
                "groove_restore.recreate_failed",
                format!(
                    "request_id={} worktree={} exit_code={:?} error={}",
                    request_id,
                    worktree,
                    recreate_result.exit_code,
                    recreate_result
                        .error
                        .as_deref()
                        .unwrap_or("Failed to recreate missing worktree before restore.")
                )
                .as_str(),
            );
            return GrooveCommandResponse {
                request_id,
                ok: false,
                exit_code: recreate_result.exit_code,
                stdout: recreate_result.stdout,
                stderr: recreate_result.stderr,
                error: recreate_result.error.or_else(|| {
                    Some("Failed to recreate missing worktree before restore.".to_string())
                }),
            };
        }

        if !path_is_directory(&expected_worktree_path) {
            return GrooveCommandResponse {
                request_id,
                ok: false,
                exit_code: recreate_result.exit_code,
                stdout: recreate_result.stdout,
                stderr: recreate_result.stderr,
                error: Some(format!(
                    "Worktree directory is still missing after recreation at \"{}\".",
                    expected_worktree_path.display()
                )),
            };
        }
    }

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

    let mut result = if action == "go" {
        let play_groove_command = play_groove_command_for_workspace(&workspace_root);
        let command_template = play_groove_command.trim();
        let play_target = target.clone().unwrap_or_default();
        log_play_telemetry(
            telemetry_enabled,
            "groove_restore.go_mode",
            format!(
                "request_id={} workspace_root={} worktree={} target={} mode={}",
                request_id,
                workspace_root_rendered,
                worktree,
                play_target,
                if is_groove_terminal_play_command(command_template) {
                    "sentinel"
                } else {
                    "custom"
                }
            )
            .as_str(),
        );
        if is_groove_terminal_play_command(command_template) {
            match open_groove_terminal_session(
                &app,
                &terminal_state,
                &workspace_root,
                &worktree,
                &expected_worktree_path,
                GrooveTerminalOpenMode::Opencode,
                Some(play_target.as_str()),
                None,
                None,
                false,
                true,
            ) {
                Ok(session) => {
                    log_play_telemetry(
                        telemetry_enabled,
                        "groove_restore.go_terminal_session_ok",
                        format!(
                            "request_id={} worktree={} session_id={} command={} cwd={}",
                            request_id,
                            worktree,
                            session.session_id,
                            session.command,
                            session.worktree_path
                        )
                        .as_str(),
                    );
                    CommandResult {
                        exit_code: Some(0),
                        stdout: format!(
                            "Started Groove terminal session {} using: {}",
                            session.session_id, session.command
                        ),
                        stderr: String::new(),
                        error: None,
                    }
                }
                Err(error) => {
                    log_play_telemetry(
                        telemetry_enabled,
                        "groove_restore.go_terminal_session_failed",
                        format!("request_id={} worktree={} error={error}", request_id, worktree)
                            .as_str(),
                    );
                    CommandResult {
                        exit_code: None,
                        stdout: String::new(),
                        stderr: String::new(),
                        error: Some(error),
                    }
                }
            }
        } else {
            let (program, command_args) = match resolve_play_groove_command(
                command_template,
                &play_target,
                &expected_worktree_path,
            ) {
                Ok(value) => value,
                Err(error) => {
                    log_play_telemetry(
                        telemetry_enabled,
                        "groove_restore.go_command_resolve_failed",
                        format!("request_id={} worktree={} error={error}", request_id, worktree)
                            .as_str(),
                    );
                    return GrooveCommandResponse {
                        request_id,
                        ok: false,
                        exit_code: None,
                        stdout: String::new(),
                        stderr: String::new(),
                        error: Some(error),
                    };
                }
            };

            match spawn_terminal_process(
                &program,
                &command_args,
                &expected_worktree_path,
                &expected_worktree_path,
            ) {
                Ok(()) => {
                    log_play_telemetry(
                        telemetry_enabled,
                        "groove_restore.go_custom_command_ok",
                        format!("request_id={} worktree={} program={}", request_id, worktree, program)
                            .as_str(),
                    );
                    CommandResult {
                        exit_code: Some(0),
                        stdout: std::iter::once(program.as_str())
                            .chain(command_args.iter().map(|value| value.as_str()))
                            .collect::<Vec<_>>()
                            .join(" "),
                        stderr: String::new(),
                        error: None,
                    }
                }
                Err(error) => {
                    log_play_telemetry(
                        telemetry_enabled,
                        "groove_restore.go_custom_command_failed",
                        format!(
                            "request_id={} worktree={} program={} error={error}",
                            request_id, worktree, program
                        )
                        .as_str(),
                    );
                    CommandResult {
                        exit_code: None,
                        stdout: String::new(),
                        stderr: String::new(),
                        error: Some(format!(
                            "Failed to launch Play Groove command {program}: {error}"
                        )),
                    }
                }
            }
        }
    } else {
        let mut args = vec!["restore".to_string(), worktree.clone()];
        if let Some(dir) = dir {
            args.push("--dir".to_string());
            args.push(dir);
        }
        if let Some(log_file) = log_file {
            args.push("--opencode-log-file".to_string());
            args.push(log_file);
        }
        run_command(&groove_binary_path(&app), &args, &workspace_root)
    };
    let ok = result.exit_code == Some(0) && result.error.is_none();
    if ok {
        let stamped_worktree = payload.worktree.trim();
        if let Err(error) =
            record_worktree_last_executed_at(&app, &workspace_root, stamped_worktree)
        {
            log_play_telemetry(
                telemetry_enabled,
                "groove_restore.record_last_executed_failed",
                format!("request_id={} worktree={} error={error}", request_id, worktree).as_str(),
            );
            return GrooveCommandResponse {
                request_id,
                ok: false,
                exit_code: result.exit_code,
                stdout: result.stdout,
                stderr: result.stderr,
                error: Some(error),
            };
        }

        if let Err(error) = clear_worktree_tombstone(&app, &workspace_root, &worktree) {
            log_play_telemetry(
                telemetry_enabled,
                "groove_restore.clear_tombstone_failed",
                format!("request_id={} worktree={} error={error}", request_id, worktree).as_str(),
            );
            return GrooveCommandResponse {
                request_id,
                ok: false,
                exit_code: result.exit_code,
                stdout: result.stdout,
                stderr: result.stderr,
                error: Some(error),
            };
        }

        if action == "restore" {
            let symlink_warnings =
                apply_configured_worktree_symlinks(&workspace_root, &expected_worktree_path);
            if !symlink_warnings.is_empty() {
                if !result.stderr.trim().is_empty() {
                    result.stderr.push('\n');
                }
                result.stderr.push_str(&format!(
                    "Warning: {}",
                    symlink_warnings.join("; ")
                ));
            }
        }

        invalidate_workspace_context_cache(&app, &workspace_root);
        invalidate_groove_list_cache_for_workspace(&app, &workspace_root);
    }

    log_play_telemetry(
        telemetry_enabled,
        "groove_restore.result",
        format!(
            "request_id={} action={} worktree={} ok={} exit_code={:?} error={}",
            request_id,
            action,
            worktree,
            ok,
            result.exit_code,
            result.error.as_deref().unwrap_or("<none>")
        )
        .as_str(),
    );

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

    let worktree_dir = dir.clone().unwrap_or_else(|| ".worktrees".to_string());

    let mut args = vec!["create".to_string(), branch.to_string()];
    if let Some(base) = base {
        args.push("--base".to_string());
        args.push(base);
    }
    if let Some(dir) = dir {
        args.push("--dir".to_string());
        args.push(dir);
    }

    let mut result = run_command(&groove_binary_path(&app), &args, &workspace_root);
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

        if let Ok(worktree_path) = ensure_worktree_in_dir(&workspace_root, &stamped_worktree, &worktree_dir) {
            let symlink_warnings = apply_configured_worktree_symlinks(&workspace_root, &worktree_path);
            if !symlink_warnings.is_empty() {
                if !result.stderr.trim().is_empty() {
                    result.stderr.push('\n');
                }
                result.stderr.push_str(&format!(
                    "Warning: {}",
                    symlink_warnings.join("; ")
                ));
            }
        }

        invalidate_workspace_context_cache(&app, &workspace_root);
        invalidate_groove_list_cache_for_workspace(&app, &workspace_root);
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
fn groove_rm(
    app: AppHandle,
    state: State<TestingEnvironmentState>,
    payload: GrooveRmPayload,
) -> GrooveCommandResponse {
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
        Err(primary_error) => {
            match resolve_workspace_root(
                &app,
                &payload.root_name,
                None,
                &known_worktrees,
                &payload.workspace_meta,
            ) {
                Ok(root) => root,
                Err(_) => {
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

    let worktree_dir = dir.clone().unwrap_or_else(|| ".worktrees".to_string());
    let target_path =
        match ensure_worktree_in_dir(&workspace_root, &resolution_worktree, &worktree_dir) {
            Ok(path) => path,
            Err(error) => {
                if is_worktree_missing_error_message(&error) {
                    if let Err(cleanup_error) = clear_stale_worktree_state(
                        &app,
                        &state,
                        &workspace_root,
                        &resolution_worktree,
                    ) {
                        return GrooveCommandResponse {
                            request_id,
                            ok: false,
                            exit_code: None,
                            stdout: String::new(),
                            stderr: String::new(),
                            error: Some(format!(
                                "{error} Failed to clear stale groove state: {cleanup_error}"
                            )),
                        };
                    }

                    return GrooveCommandResponse {
                        request_id,
                        ok: true,
                        exit_code: Some(0),
                        stdout: String::new(),
                        stderr: format!(
                            "{error} Removed stale groove entry from local app state."
                        ),
                        error: None,
                    };
                }
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
    let branch_name = resolve_branch_from_worktree(&target_path);

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

    let mut result = run_command(&binary, &args, &workspace_root);
    let mut ok = result.exit_code == Some(0) && result.error.is_none();
    let mut handled_as_stale = false;
    if !ok
        && !path_is_directory(&target_path)
        && (is_worktree_missing_error_message(&result.stderr)
            || result
                .error
                .as_deref()
                .map(is_worktree_missing_error_message)
                .unwrap_or(false))
    {
        if let Err(cleanup_error) = clear_stale_worktree_state(
            &app,
            &state,
            &workspace_root,
            &resolution_worktree,
        ) {
            if !result.stderr.trim().is_empty() {
                result.stderr.push('\n');
            }
            result.stderr.push_str(&format!(
                "Warning: failed to clear stale groove state after missing worktree error: {cleanup_error}"
            ));
        } else {
            ok = true;
            handled_as_stale = true;
            result.exit_code = Some(0);
            result.error = None;
            if !result.stderr.trim().is_empty() {
                result.stderr.push('\n');
            }
            result
                .stderr
                .push_str("Removed stale groove entry from local app state.");
        }
    }
    if ok && !handled_as_stale {
        if let Err(tombstone_error) = record_worktree_tombstone(
            &app,
            &workspace_root,
            &resolution_worktree,
            &target_path,
            branch_name,
        ) {
            if !result.stderr.trim().is_empty() {
                result.stderr.push('\n');
            }
            result.stderr.push_str(&format!(
                "Warning: failed to persist worktree tombstone after deletion: {tombstone_error}"
            ));
        }

        match unset_testing_target_for_worktree(
            &app,
            &state,
            &workspace_root,
            &resolution_worktree,
            true,
        ) {
            Ok(_) => {}
            Err(unset_error) => {
                if !result.stderr.trim().is_empty() {
                    result.stderr.push('\n');
                }
                result.stderr.push_str(&format!(
                    "Warning: failed to unset testing target during cut groove: {unset_error}"
                ));
            }
        }

        invalidate_workspace_context_cache(&app, &workspace_root);
        invalidate_groove_list_cache_for_workspace(&app, &workspace_root);
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

    let response = match stop_process_by_pid(pid) {
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
    };

    if response.ok {
        invalidate_groove_list_cache_for_workspace(&app, &workspace_root);
    }

    response
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

    if !enabled {
        let mut runtime = match state.runtime.lock() {
            Ok(guard) => guard,
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
                    error: Some(format!(
                        "Failed to acquire testing environment lock: {error}"
                    )),
                }
            }
        };

        if let Err(error) = ensure_testing_runtime_loaded(&app, &mut runtime) {
            return build_testing_environment_response(
                request_id,
                None,
                &runtime.persisted,
                Some(error),
            );
        }

        if let Err(error) = reconcile_testing_runtime_and_persist(&app, &mut runtime) {
            return build_testing_environment_response(
                request_id,
                None,
                &runtime.persisted,
                Some(error),
            );
        }

        let root_name_hint = payload
            .root_name
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty());

        let provided_workspace_root = payload
            .workspace_root
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string());

        let mut workspace_roots = Vec::<String>::new();
        let mut seen_workspace_roots = HashSet::<String>::new();

        if let Some(workspace_root) = provided_workspace_root {
            if seen_workspace_roots.insert(workspace_root.clone()) {
                workspace_roots.push(workspace_root);
            }
        }

        if let Ok(resolved_workspace_root) = resolve_workspace_root(
            &app,
            &payload.root_name,
            Some(worktree),
            &known_worktrees,
            &payload.workspace_meta,
        ) {
            let workspace_root = resolved_workspace_root.display().to_string();
            if seen_workspace_roots.insert(workspace_root.clone()) {
                workspace_roots.push(workspace_root);
            }
        } else if let Ok(resolved_workspace_root) = resolve_workspace_root(
            &app,
            &payload.root_name,
            None,
            &known_worktrees,
            &payload.workspace_meta,
        ) {
            let workspace_root = resolved_workspace_root.display().to_string();
            if seen_workspace_roots.insert(workspace_root.clone()) {
                workspace_roots.push(workspace_root);
            }
        }

        for target in &runtime.persisted.targets {
            if target.worktree != worktree {
                continue;
            }
            if !workspace_root_matches_root_name(&target.workspace_root, root_name_hint) {
                continue;
            }
            if seen_workspace_roots.insert(target.workspace_root.clone()) {
                workspace_roots.push(target.workspace_root.clone());
            }
        }
        for instance in &runtime.persisted.running_instances {
            if instance.worktree != worktree {
                continue;
            }
            if !workspace_root_matches_root_name(&instance.workspace_root, root_name_hint) {
                continue;
            }
            if seen_workspace_roots.insert(instance.workspace_root.clone()) {
                workspace_roots.push(instance.workspace_root.clone());
            }
        }

        if workspace_roots.is_empty() {
            for target in &runtime.persisted.targets {
                if target.worktree == worktree {
                    if seen_workspace_roots.insert(target.workspace_root.clone()) {
                        workspace_roots.push(target.workspace_root.clone());
                    }
                }
            }
            for instance in &runtime.persisted.running_instances {
                if instance.worktree == worktree {
                    if seen_workspace_roots.insert(instance.workspace_root.clone()) {
                        workspace_roots.push(instance.workspace_root.clone());
                    }
                }
            }
        }

        for workspace_root in &workspace_roots {
            runtime.persisted.targets.retain(|target| {
                !(target.workspace_root == *workspace_root && target.worktree == worktree)
            });

            if payload.stop_running_processes_when_unset.unwrap_or(true) {
                if let Err(error) = stop_running_testing_instance_for_worktree(
                    &mut runtime,
                    workspace_root,
                    worktree,
                ) {
                    let workspace_root_path = PathBuf::from(workspace_root);
                    return build_testing_environment_response(
                        request_id,
                        Some(&workspace_root_path),
                        &runtime.persisted,
                        Some(error),
                    );
                }
            }
        }

        runtime.persisted.updated_at = Some(now_iso());

        if let Err(error) = write_persisted_testing_environment_state(&app, &runtime.persisted) {
            let workspace_root_path = workspace_roots.first().map(PathBuf::from);
            return build_testing_environment_response(
                request_id,
                workspace_root_path.as_deref(),
                &runtime.persisted,
                Some(error),
            );
        }

        let workspace_root_path = workspace_roots.first().map(PathBuf::from);
        return build_testing_environment_response(
            request_id,
            workspace_root_path.as_deref(),
            &runtime.persisted,
            None,
        );
    }

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
            if let Err(error) = start_testing_instance_for_target(&app, &target, &mut runtime) {
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
        if payload.stop_running_processes_when_unset.unwrap_or(true) {
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
        if let Err(error) = start_testing_instance_for_target(&app, &target, &mut runtime) {
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
            if let Err(error) = start_testing_instance_for_target(&app, &target, &mut runtime) {
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
        );
        }
    };
    let configured_terminal = if workspace_meta.default_terminal == "none" {
        "auto".to_string()
    } else {
        workspace_meta.default_terminal.clone()
    };
    let configured_ports = testing_ports_for_workspace(&workspace_root);
    let mut used_ports = runtime
        .persisted
        .running_instances
        .iter()
        .filter(|instance| testing_instance_is_effectively_running(instance))
        .filter_map(|instance| instance.port)
        .collect::<HashSet<_>>();

    for target in targets_to_start {
        let port = match allocate_testing_port(&configured_ports, &used_ports) {
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
        used_ports.insert(port);
        let args = vec![
            "run".to_string(),
            target.worktree.clone(),
            "--terminal".to_string(),
            configured_terminal.clone(),
        ];
        let (result, command_for_state) = (
            run_command_timeout(
                &groove_binary_path(&app),
                &args,
                &workspace_root,
                SEPARATE_TERMINAL_COMMAND_TIMEOUT,
                Some(port),
            ),
            format!("groove {}", args.join(" ")),
        );

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
fn groove_bin_status(app: AppHandle, state: State<GrooveBinStatusState>) -> GrooveBinStatusResponse {
    let request_id = request_id();

    match state.status.lock() {
        Ok(mut stored) => {
            let status = stored
                .clone()
                .unwrap_or_else(|| evaluate_groove_bin_check_status(&app));
            *stored = Some(status.clone());
            GrooveBinStatusResponse {
                request_id,
                ok: true,
                status,
                error: None,
            }
        }
        Err(error) => {
            let status = evaluate_groove_bin_check_status(&app);
            GrooveBinStatusResponse {
                request_id,
                ok: false,
                status,
                error: Some(format!("Failed to persist GROOVE_BIN status: {error}")),
            }
        }
    }
}

#[tauri::command]
fn groove_bin_repair(app: AppHandle, state: State<GrooveBinStatusState>) -> GrooveBinRepairResponse {
    let request_id = request_id();
    let mut changed = false;
    let mut action = "noop".to_string();
    let mut cleared_path = None;

    let pre_status = evaluate_groove_bin_check_status(&app);
    if pre_status.has_issue {
        if let Some(path) = pre_status.configured_path.clone() {
            std::env::remove_var("GROOVE_BIN");
            changed = true;
            action = "cleared-invalid-env".to_string();
            cleared_path = Some(path);
        }
    }

    let post_status = evaluate_groove_bin_check_status(&app);

    match state.status.lock() {
        Ok(mut stored) => {
            *stored = Some(post_status.clone());
            GrooveBinRepairResponse {
                request_id,
                ok: true,
                changed,
                action,
                cleared_path,
                status: post_status,
                error: None,
            }
        }
        Err(error) => GrooveBinRepairResponse {
            request_id,
            ok: false,
            changed,
            action,
            cleared_path,
            status: post_status,
            error: Some(format!("Failed to persist GROOVE_BIN status after repair: {error}")),
        },
    }
}

#[tauri::command]
fn diagnostics_list_opencode_instances(app: AppHandle) -> DiagnosticsOpencodeInstancesResponse {
    let started_at = Instant::now();
    let request_id = request_id();
    let telemetry_enabled = telemetry_enabled_for_app(&app);

    let response = match list_opencode_process_rows() {
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
    };

    let details = format!(
        "outcome={} rows={}",
        if response.ok { "ok" } else { "error" },
        response.rows.len(),
    );
    log_backend_timing(
        telemetry_enabled,
        "diagnostics.list_opencode_instances",
        started_at.elapsed(),
        details.as_str(),
    );
    response
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
fn diagnostics_stop_all_non_worktree_opencode_instances() -> DiagnosticsStopAllResponse {
    let request_id = request_id();

    let rows = match list_non_worktree_opencode_process_rows() {
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
fn diagnostics_list_worktree_node_apps(app: AppHandle) -> DiagnosticsNodeAppsResponse {
    let started_at = Instant::now();
    let request_id = request_id();
    let telemetry_enabled = telemetry_enabled_for_app(&app);

    let response = match list_worktree_node_app_rows() {
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
    };

    let details = format!(
        "outcome={} rows={} has_warning={}",
        if response.ok { "ok" } else { "error" },
        response.rows.len(),
        response.warning.is_some(),
    );
    log_backend_timing(
        telemetry_enabled,
        "diagnostics.list_worktree_node_apps",
        started_at.elapsed(),
        details.as_str(),
    );
    response
}

#[tauri::command]
fn diagnostics_clean_all_dev_servers(app: AppHandle) -> DiagnosticsStopAllResponse {
    let started_at = Instant::now();
    let request_id = request_id();
    let telemetry_enabled = telemetry_enabled_for_app(&app);
    let (snapshot_rows, _warning) = match list_process_snapshot_rows() {
        Ok(value) => value,
        Err(error) => {
            let response = DiagnosticsStopAllResponse {
                request_id,
                ok: false,
                attempted: 0,
                stopped: 0,
                already_stopped: 0,
                failed: 0,
                errors: Vec::new(),
                error: Some(error),
            };
            log_backend_timing(
                telemetry_enabled,
                "diagnostics.clean_all_dev_servers",
                started_at.elapsed(),
                "outcome=error attempted=0 stopped=0 already_stopped=0 failed=0",
            );
            return response;
        }
    };

    let pids = snapshot_rows
        .into_iter()
        .filter(|row| {
            is_worktree_opencode_process(row.process_name.as_deref(), &row.command)
                || is_worktree_node_process(row.process_name.as_deref(), &row.command)
                || command_matches_turbo_dev(&row.command)
        })
        .map(|row| row.pid)
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    let (stopped, already_stopped, failed, errors) = stop_pid_set(&pids);

    let response = DiagnosticsStopAllResponse {
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
    };

    let details = format!(
        "outcome={} attempted={} stopped={} already_stopped={} failed={}",
        if response.ok { "ok" } else { "error" },
        response.attempted,
        response.stopped,
        response.already_stopped,
        response.failed,
    );
    log_backend_timing(
        telemetry_enabled,
        "diagnostics.clean_all_dev_servers",
        started_at.elapsed(),
        details.as_str(),
    );
    response
}

#[tauri::command]
fn diagnostics_get_msot_consuming_programs(app: AppHandle) -> DiagnosticsMostConsumingProgramsResponse {
    let started_at = Instant::now();
    let request_id = request_id();
    let telemetry_enabled = telemetry_enabled_for_app(&app);

    let response = match get_msot_consuming_programs_output() {
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
    };

    let details = format!(
        "outcome={} output_len={}",
        if response.ok { "ok" } else { "error" },
        response.output.len(),
    );
    log_backend_timing(
        telemetry_enabled,
        "diagnostics.get_msot_consuming_programs",
        started_at.elapsed(),
        details.as_str(),
    );
    response
}

#[tauri::command]
fn diagnostics_get_system_overview(app: AppHandle) -> DiagnosticsSystemOverviewResponse {
    let started_at = Instant::now();
    let request_id = request_id();
    let telemetry_enabled = telemetry_enabled_for_app(&app);

    let overview = collect_system_overview();
    let response = DiagnosticsSystemOverviewResponse {
        request_id,
        ok: true,
        overview: Some(overview),
        error: None,
    };

    let details = if let Some(overview) = response.overview.as_ref() {
        format!(
            "outcome=ok cpu={} ram={} swap={} disk={} platform={}",
            overview.cpu_usage_percent.is_some(),
            overview.ram_usage_percent.is_some(),
            overview.swap_usage_percent.is_some(),
            overview.disk_usage_percent.is_some(),
            overview.platform,
        )
    } else {
        "outcome=ok overview=false".to_string()
    };
    log_backend_timing(
        telemetry_enabled,
        "diagnostics.get_system_overview",
        started_at.elapsed(),
        details.as_str(),
    );

    response
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

    let workspace_root_display = workspace_root.display().to_string();

    if let Some(existing) = worker.as_ref() {
        if existing.workspace_root == workspace_root_display && !existing.handle.is_finished() {
            return WorkspaceEventsResponse {
                request_id,
                ok: true,
                workspace_root: Some(workspace_root_display),
                error: None,
            };
        }
    }

    let worker_generation = state.worker_generation.clone();
    let generation = worker_generation.fetch_add(1, Ordering::Relaxed) + 1;

    if let Some(previous) = worker.take() {
        previous.stop.store(true, Ordering::Relaxed);
    }

    let stop = Arc::new(AtomicBool::new(false));
    let stop_signal = stop.clone();
    let app_handle = app.clone();
    let request_id_clone = request_id.clone();
    let workspace_root_clone = workspace_root.clone();
    let known_worktrees_clone = known_worktrees.clone();
    let worker_generation_clone = worker_generation.clone();

    let handle = thread::spawn(move || {
        if worker_generation_clone.load(Ordering::Relaxed) != generation {
            return;
        }

        let mut snapshots = HashMap::<PathBuf, SnapshotEntry>::new();
        for target in &poll_targets {
            snapshots.insert(target.clone(), snapshot_entry(target));
        }

        let workspace_root_display = workspace_root_clone.display().to_string();
        let mut runtime_pids_by_worktree =
            snapshot_runtime_pids_by_worktree(&workspace_root_clone, &known_worktrees_clone);

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
        let mut pending_runtime_sources = HashSet::<String>::new();
        let mut last_emit_at = Instant::now()
            .checked_sub(WORKSPACE_EVENTS_MIN_EMIT_INTERVAL)
            .unwrap_or_else(Instant::now);

        while !stop_signal.load(Ordering::Relaxed)
            && worker_generation_clone.load(Ordering::Relaxed) == generation
        {
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

            let next_runtime_pids_by_worktree =
                snapshot_runtime_pids_by_worktree(&workspace_root_clone, &known_worktrees_clone);
            for worktree in &known_worktrees_clone {
                let previous_pid = runtime_pids_by_worktree
                    .get(worktree)
                    .copied()
                    .unwrap_or(None);
                let next_pid = next_runtime_pids_by_worktree
                    .get(worktree)
                    .copied()
                    .unwrap_or(None);

                if previous_pid != next_pid {
                    pending_runtime_sources.insert(format!(".worktrees/{worktree}"));
                }
            }
            runtime_pids_by_worktree = next_runtime_pids_by_worktree;

            if !pending_runtime_sources.is_empty()
                && last_emit_at.elapsed() >= WORKSPACE_EVENTS_MIN_EMIT_INTERVAL
            {
                index += 1;
                let mut sources = pending_runtime_sources.drain().collect::<Vec<_>>();
                sources.sort();
                let source_count = sources.len();

                invalidate_groove_list_cache_for_workspace(&app_handle, &workspace_root_clone);
                let _ = app_handle.emit(
                    "workspace-change",
                    serde_json::json!({
                        "index": index,
                        "source": sources.first().cloned().unwrap_or_default(),
                        "sources": sources,
                        "sourceCount": source_count,
                        "workspaceRoot": workspace_root_display,
                        "kind": "runtime"
                    }),
                );
                last_emit_at = Instant::now();
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

            let sleep_started = Instant::now();
            while sleep_started.elapsed() < WORKSPACE_EVENTS_POLL_INTERVAL {
                if stop_signal.load(Ordering::Relaxed)
                    || worker_generation_clone.load(Ordering::Relaxed) != generation
                {
                    break;
                }
                thread::sleep(WORKSPACE_EVENTS_STOP_POLL_INTERVAL);
            }
        }

        if worker_generation_clone.load(Ordering::Relaxed) != generation {
            eprintln!("[workspace-events] worker superseded; exiting poll loop");
        }
    });

    *worker = Some(WorkspaceWorker {
        workspace_root: workspace_root_display.clone(),
        stop,
        handle,
    });

    WorkspaceEventsResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root_display),
        error: None,
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(WorkspaceEventState::default())
        .manage(TestingEnvironmentState::default())
        .manage(WorkspaceContextCacheState::default())
        .manage(GrooveListCacheState::default())
        .manage(GrooveBinStatusState::default())
        .manage(GrooveTerminalState::default())
        .setup(|app| {
            let status = evaluate_groove_bin_check_status(&app.handle());
            if status.has_issue {
                eprintln!(
                    "[startup-warning] GROOVE_BIN is invalid and may break groove command execution: {}",
                    status.configured_path.as_deref().unwrap_or("<unset>")
                );
            }

            let state = app.state::<GrooveBinStatusState>();
            if let Ok(mut stored) = state.status.lock() {
                *stored = Some(status);
            }

            let _ = ensure_global_settings(&app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspace_pick_and_open,
            workspace_open,
            workspace_get_active,
            workspace_clear_active,
            workspace_gitignore_sanity_check,
            workspace_gitignore_sanity_apply,
            global_settings_get,
            global_settings_update,
            workspace_update_terminal_settings,
            workspace_update_commands_settings,
            workspace_update_worktree_symlink_paths,
            workspace_list_symlink_entries,
            workspace_open_terminal,
            workspace_open_workspace_terminal,
            groove_terminal_open,
            groove_terminal_write,
            groove_terminal_resize,
            groove_terminal_close,
            groove_terminal_get_session,
            groove_terminal_list_sessions,
            git_auth_status,
            git_status,
            git_current_branch,
            git_list_branches,
            git_ahead_behind,
            git_pull,
            git_push,
            git_merge,
            git_merge_abort,
            git_has_staged_changes,
            git_merge_in_progress,
            git_has_upstream,
            git_list_file_states,
            git_stage_files,
            git_unstage_files,
            git_add,
            git_commit,
            gh_detect_repo,
            gh_auth_status,
            gh_auth_logout,
            gh_pr_list,
            gh_pr_create,
            open_external_url,
            gh_open_branch,
            gh_open_active_pr,
            gh_check_branch_pr,
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
            groove_bin_status,
            groove_bin_repair,
            diagnostics_list_opencode_instances,
            diagnostics_stop_process,
            diagnostics_stop_all_opencode_instances,
            diagnostics_stop_all_non_worktree_opencode_instances,
            diagnostics_list_worktree_node_apps,
            diagnostics_clean_all_dev_servers,
            diagnostics_get_msot_consuming_programs,
            diagnostics_get_system_overview,
            workspace_events
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
