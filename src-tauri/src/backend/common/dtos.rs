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
    consellour_settings: Option<ConsellourSettings>,
    jira_settings: Option<JiraSettings>,
    tasks: Option<Vec<WorkspaceTask>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct JiraSettings {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    site_url: String,
    #[serde(default)]
    account_email: String,
    #[serde(default)]
    default_project_key: Option<String>,
    #[serde(default)]
    jql: Option<String>,
    #[serde(default)]
    sync_enabled: bool,
    #[serde(default)]
    sync_open_issues_only: bool,
    #[serde(default)]
    last_sync_at: Option<String>,
    #[serde(default)]
    last_sync_error: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum TaskPriority {
    Low,
    Medium,
    High,
    Urgent,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum TaskOrigin {
    ConsellourTool,
    ExternalSync,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceTask {
    id: String,
    title: String,
    description: String,
    priority: TaskPriority,
    consellour_priority: TaskPriority,
    created_at: String,
    updated_at: String,
    last_interacted_at: String,
    origin: TaskOrigin,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    external_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    external_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConsellourSettings {
    #[serde(default)]
    openai_api_key: Option<String>,
    #[serde(default = "default_consellour_model")]
    model: String,
    #[serde(default = "default_consellour_reasoning_level")]
    reasoning_level: String,
    updated_at: String,
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
    #[serde(default = "default_consellour_settings")]
    consellour_settings: ConsellourSettings,
    #[serde(default = "default_jira_settings")]
    jira_settings: JiraSettings,
    #[serde(default)]
    tasks: Vec<WorkspaceTask>,
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
struct ConsellourSettingsUpdatePayload {
    #[serde(default)]
    openai_api_key: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    reasoning_level: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceTaskQueryPayload {
    #[serde(default)]
    title_query: Option<String>,
    #[serde(default)]
    description_query: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConsellourToolCreateTaskPayload {
    title: String,
    description: String,
    priority: TaskPriority,
    consellour_priority: TaskPriority,
    #[serde(default)]
    origin: Option<TaskOrigin>,
    #[serde(default)]
    external_id: Option<String>,
    #[serde(default)]
    external_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConsellourToolEditTaskPayload {
    id: String,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    priority: Option<TaskPriority>,
    #[serde(default)]
    consellour_priority: Option<TaskPriority>,
    #[serde(default)]
    last_interacted_at: Option<String>,
    #[serde(default)]
    origin: Option<TaskOrigin>,
    #[serde(default)]
    external_id: Option<String>,
    #[serde(default)]
    external_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JiraConnectApiTokenPayload {
    site_url: String,
    email: String,
    api_token: String,
    #[serde(default)]
    default_project_key: Option<String>,
    #[serde(default)]
    jql: Option<String>,
    #[serde(default)]
    sync_enabled: Option<bool>,
    #[serde(default)]
    sync_open_issues_only: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JiraProjectsListPayload {
    #[serde(default)]
    include_archived: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JiraSyncPullPayload {
    #[serde(default)]
    jql_override: Option<String>,
    #[serde(default)]
    max_results: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JiraIssueOpenInBrowserPayload {
    issue_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GlobalSettingsUpdatePayload {
    telemetry_enabled: Option<bool>,
    disable_groove_loading_section: Option<bool>,
    show_fps: Option<bool>,
    always_show_diagnostics_sidebar: Option<bool>,
    periodic_rerender_enabled: Option<bool>,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConsellourSettingsResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    settings: Option<ConsellourSettings>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceTasksResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    #[serde(default)]
    tasks: Vec<WorkspaceTask>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceTaskResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    task: Option<WorkspaceTask>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JiraApiError {
    code: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    retry_after_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JiraConnectionStatusResponse {
    request_id: String,
    ok: bool,
    connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    settings: Option<JiraSettings>,
    #[serde(skip_serializing_if = "Option::is_none")]
    has_token: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    jira_error: Option<JiraApiError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JiraConnectResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    settings: Option<JiraSettings>,
    #[serde(skip_serializing_if = "Option::is_none")]
    account_display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    jira_error: Option<JiraApiError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JiraDisconnectResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    settings: Option<JiraSettings>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JiraProjectSummary {
    key: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    project_type_key: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JiraProjectsListResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    #[serde(default)]
    projects: Vec<JiraProjectSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    jira_error: Option<JiraApiError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JiraSyncPullResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    imported_count: usize,
    updated_count: usize,
    skipped_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    settings: Option<JiraSettings>,
    #[serde(skip_serializing_if = "Option::is_none")]
    jira_error: Option<JiraApiError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JiraIssueOpenInBrowserResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct JiraMyselfResponse {
    #[serde(rename = "displayName")]
    #[serde(default)]
    display_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct JiraProjectSearchResponse {
    #[serde(default)]
    values: Vec<JiraProjectWire>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JiraProjectWire {
    key: String,
    name: String,
    #[serde(default)]
    project_type_key: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JiraIssueSearchJqlRequest {
    jql: String,
    max_results: u32,
    fields: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    next_page_token: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JiraIssueSearchResponse {
    #[serde(default)]
    issues: Vec<JiraIssueWire>,
    #[serde(default)]
    next_page_token: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct JiraIssueWire {
    key: String,
    fields: JiraIssueFieldsWire,
}

#[derive(Debug, Clone, Deserialize)]
struct JiraIssueFieldsWire {
    #[serde(default)]
    summary: String,
    #[serde(default)]
    description: Option<serde_json::Value>,
    #[serde(default)]
    status: Option<JiraIssueStatusWire>,
    #[serde(default)]
    priority: Option<JiraIssuePriorityWire>,
}

#[derive(Debug, Clone, Deserialize)]
struct JiraIssueStatusWire {
    #[serde(default)]
    name: String,
}

#[derive(Debug, Clone, Deserialize)]
struct JiraIssuePriorityWire {
    #[serde(default)]
    name: String,
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
    #[serde(default)]
    periodic_rerender_enabled: bool,
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
