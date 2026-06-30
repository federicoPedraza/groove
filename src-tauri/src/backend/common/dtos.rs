#[derive(Default)]
struct WorkspaceEventState {
    worker: Mutex<Option<WorkspaceWorker>>,
    worker_generation: Arc<AtomicU64>,
}

#[derive(Default)]
struct WorkspaceContextCacheState {
    entries: Mutex<HashMap<String, WorkspaceContextCacheEntry>>,
}

/// Caches the resolved `(workspace_root, worktree_path)` for terminal commands.
/// Without it, every terminal IPC (including each keystroke via
/// `groove_terminal_write` and the periodic activity poll) re-runs
/// `resolve_workspace_root`, which stats every known worktree directory and
/// re-parses `workspace.json` — O(worktree count) filesystem work per call.
#[derive(Default)]
struct TerminalResolutionCacheState {
    entries: Mutex<HashMap<String, TerminalResolutionCacheEntry>>,
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

#[derive(Debug, Clone)]
struct WorkspaceContextCacheEntry {
    signature: WorkspaceContextSignature,
    response: WorkspaceContextResponse,
}

#[derive(Debug, Clone)]
struct TerminalResolutionCacheEntry {
    workspace_root: PathBuf,
    worktree_path: PathBuf,
    signature: TerminalResolutionSignature,
}

/// Cheap (a few `stat`s, no parsing) fingerprint of the inputs that can change a
/// terminal worktree resolution: the active-workspace pointer file, the
/// workspace manifest, and the worktree directory itself.
#[derive(Debug, Clone, PartialEq, Eq)]
struct TerminalResolutionSignature {
    active_state_file: SnapshotEntry,
    workspace_manifest: SnapshotEntry,
    worktree_dir: SnapshotEntry,
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

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedWorktreeExecutionState {
    #[serde(default)]
    last_executed_at_by_workspace: HashMap<String, HashMap<String, String>>,
    #[serde(default)]
    tombstones_by_workspace: HashMap<String, HashMap<String, WorktreeTombstone>>,
    #[serde(default)]
    running_by_workspace: HashMap<String, HashMap<String, RunningGrooveRecord>>,
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

/// A groove that was actively playing an in-app PTY session. Persisted on play
/// and removed when the session ends cleanly, so survivors after an unexpected
/// shutdown can be surfaced for recovery on the next launch.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunningGrooveRecord {
    workspace_root: String,
    worktree: String,
    worktree_path: String,
    command: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    target: Option<String>,
    session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pid: Option<u32>,
    started_at: String,
    /// Best-effort liveness annotation set only when returned to the frontend;
    /// never persisted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    still_running: Option<bool>,
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
    #[serde(alias = "disableGrooveLoadingSection")]
    disable_groove_business: Option<bool>,
    hide_mascot: Option<bool>,
    hide_labels: Option<bool>,
    show_fps: Option<bool>,
    play_groove_command: Option<String>,
    open_terminal_at_worktree_command: Option<String>,
    worktree_symlink_paths: Option<Vec<String>>,
    opencode_settings: Option<OpencodeSettings>,
    worktree_records: Option<HashMap<String, WorktreeRecord>>,
    #[serde(default)]
    root_directory: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpencodeSettings {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    default_model: Option<String>,
    #[serde(default = "default_opencode_settings_directory")]
    settings_directory: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpencodeSkillEntry {
    name: String,
    path: String,
    is_directory: bool,
    has_skill_markdown: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpencodeSkillScope {
    scope: String,
    root_path: String,
    skills_path: String,
    skills_directory_exists: bool,
    skills: Vec<OpencodeSkillEntry>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeProfileCommands {
    init: String,
    new_change: String,
    #[serde(rename = "continue")]
    continue_phase: String,
    apply: String,
    verify: String,
    archive: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeProfileTimeouts {
    phase_seconds: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeProfileSafety {
    require_user_approval_between_phases: bool,
    allow_parallel_spec_design: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeProfile {
    version: String,
    enabled: bool,
    artifact_store: String,
    default_flow: String,
    commands: OpenCodeProfileCommands,
    timeouts: OpenCodeProfileTimeouts,
    safety: OpenCodeProfileSafety,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeProfileCommandsPatch {
    #[serde(default)]
    init: Option<String>,
    #[serde(default)]
    new_change: Option<String>,
    #[serde(default, rename = "continue")]
    continue_phase: Option<String>,
    #[serde(default)]
    apply: Option<String>,
    #[serde(default)]
    verify: Option<String>,
    #[serde(default)]
    archive: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeProfileTimeoutsPatch {
    #[serde(default)]
    phase_seconds: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeProfileSafetyPatch {
    #[serde(default)]
    require_user_approval_between_phases: Option<bool>,
    #[serde(default)]
    allow_parallel_spec_design: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeProfilePatch {
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    enabled: Option<bool>,
    #[serde(default)]
    artifact_store: Option<String>,
    #[serde(default)]
    default_flow: Option<String>,
    #[serde(default)]
    commands: Option<OpenCodeProfileCommandsPatch>,
    #[serde(default)]
    timeouts: Option<OpenCodeProfileTimeoutsPatch>,
    #[serde(default)]
    safety: Option<OpenCodeProfileSafetyPatch>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetOpenCodeProfilePayload {
    patch: OpenCodeProfilePatch,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunOpenCodeFlowPayload {
    phase: String,
    #[serde(default)]
    args: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeErrorDetail {
    code: String,
    message: String,
    hint: String,
    #[serde(default)]
    paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeSanityChecks {
    agent_teams_lite_available: bool,
    required_refs_present: bool,
    profile_exists_and_valid: bool,
    sync_artifact_applied: bool,
    artifact_store_ready: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeSanityStatus {
    applied: bool,
    checks: OpenCodeSanityChecks,
    #[serde(default)]
    hard_blockers: Vec<String>,
    #[serde(default)]
    recommendations: Vec<String>,
    #[serde(default)]
    diagnostics: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeStatus {
    worktree_path: String,
    worktree_exists: bool,
    git_repo: bool,
    opencode_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    opencode_binary_path: Option<String>,
    agent_teams_lite_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    agent_teams_lite_dir: Option<String>,
    required_commands_available: bool,
    #[serde(default)]
    missing_commands: Vec<String>,
    profile_present: bool,
    profile_path: String,
    sync_target_exists: bool,
    sync_target_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    artifact_store: Option<String>,
    artifact_store_ready: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    engram_binary_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    engram_opencode_mcp_config_present: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    engram_opencode_plugin_present: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    engram_opencode_config_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    engram_opencode_plugin_path: Option<String>,
    profile_valid: bool,
    #[serde(default)]
    warnings: Vec<String>,
    sanity: OpenCodeSanityStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncResult {
    ok: bool,
    changed: bool,
    profile_path: String,
    sync_artifact_path: String,
    #[serde(default)]
    warnings: Vec<String>,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeRepairResult {
    repaired: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    backup_path: Option<String>,
    #[serde(default)]
    actions: Vec<String>,
    post_repair_status: OpenCodeStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeRunResult {
    run_id: String,
    phase: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    exit_code: Option<i32>,
    duration_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    summary: Option<String>,
    stdout: String,
    stderr: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<OpenCodeErrorDetail>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CancelResult {
    run_id: String,
    supported: bool,
    cancelled: bool,
    status: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<OpenCodeErrorDetail>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SummaryRecord {
    worktree_ids: Vec<String>,
    created_at: String,
    summary: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    one_liner: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum CommentState {
    Uncommitted,
    Committed,
}

fn default_comment_state() -> CommentState {
    CommentState::Uncommitted
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommentRecord {
    worktree_id: String,
    created_at: String,
    message: String,
    #[serde(default = "default_comment_state")]
    state: CommentState,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestRecord {
    number: i64,
    url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    base: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    head: Option<String>,
    added_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum WorktreeState {
    Pending,
    // "On diagnosis" in Groove-business mode — created/triaged, not yet worked.
    Hunting,
    Fighting,
    // Backward-compat: older workspace.json files have "trial" — map to wounded.
    #[serde(alias = "trial")]
    Wounded,
    // Backward-compat: older "done" → defeated.
    #[serde(alias = "done")]
    Defeated,
    Blocked,
    // Backward-compat: older "archived" → forgotten.
    #[serde(alias = "archived")]
    Forgotten,
}

fn default_worktree_state() -> WorktreeState {
    WorktreeState::Pending
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum WorktreeUnitKind {
    Bug,
    Goldmine,
    Gems,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorktreeLootEntry {
    item_id: String,
    rarity: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorktreeUnit {
    kind: WorktreeUnitKind,
    level: u8,
    reward: u32,
    #[serde(default)]
    name: String,
    #[serde(default)]
    rewarded: bool,
    /// `false` (or absent) means "not looted yet" — the player still has to
    /// open the looting interface to roll and collect items. Decoupled from
    /// `rewarded` so gold and loot are two independent steps.
    #[serde(default)]
    looted: bool,
    /// Empty until the player triggers the loot step. Loot is rolled lazily
    /// in `loot_worktree` (0..=3 items), not at unit creation time.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    loot: Vec<WorktreeLootEntry>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorktreeRecord {
    id: String,
    created_at: String,
    #[serde(default)]
    claude_session_started: bool,
    #[serde(default = "default_worktree_state")]
    state: WorktreeState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    unit: Option<WorktreeUnit>,
    #[serde(default)]
    summaries: Vec<SummaryRecord>,
    #[serde(default)]
    comments: Vec<CommentRecord>,
    #[serde(default)]
    pull_requests: Vec<PullRequestRecord>,
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
    #[serde(default, alias = "disableGrooveLoadingSection")]
    disable_groove_business: bool,
    #[serde(default)]
    hide_mascot: bool,
    #[serde(default)]
    hide_labels: bool,
    #[serde(default)]
    show_fps: bool,
    #[serde(default = "default_play_groove_command")]
    play_groove_command: String,
    #[serde(default)]
    open_terminal_at_worktree_command: Option<String>,
    #[serde(default = "default_worktree_symlink_paths")]
    worktree_symlink_paths: Vec<String>,
    #[serde(default = "default_opencode_settings")]
    opencode_settings: OpencodeSettings,
    #[serde(default)]
    onboarding_symlinks_configured: bool,
    #[serde(default)]
    onboarding_commands_configured: bool,
    #[serde(default)]
    worktree_records: HashMap<String, WorktreeRecord>,
    #[serde(default)]
    summaries: Vec<SummaryRecord>,
    #[serde(default)]
    root_directory: Option<String>,
    #[serde(default)]
    gold: u64,
    #[serde(default)]
    defeated_count: u64,
    /// Bug names that have ever been rolled in this workspace. Populated
    /// whenever Discover produces a `Bug` unit; used by the UI as a
    /// "bestiary" of encountered creatures.
    #[serde(default)]
    known_bugs: Vec<String>,
    /// Item-id → count of items collected over the workspace's lifetime.
    /// Bumped on reward claim alongside `gold`.
    #[serde(default)]
    inventory: HashMap<String, u32>,
    /// Optional cap on how many worktrees are kept on disk. When a new
    /// worktree is created past this limit, the least-recently-used worktree
    /// that is neither running nor dirty is auto-removed. `None`/`Some(0)`
    /// means unlimited.
    #[serde(default)]
    max_worktree_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceScanRow {
    worktree: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    worktree_id: Option<String>,
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
    patched_worktree: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    play_started: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceTermSanityResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    term_value: Option<String>,
    is_usable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    applied: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fixed_value: Option<String>,
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
    workspace_root: Option<String>,
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
struct WorkspaceOpenTerminalPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    worktree: Option<String>,
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
    disable_groove_business: Option<bool>,
    hide_mascot: Option<bool>,
    hide_labels: Option<bool>,
    show_fps: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceCommandSettingsPayload {
    play_groove_command: String,
    open_terminal_at_worktree_command: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceMaxWorktreeCountPayload {
    #[serde(default)]
    max_worktree_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceMaxWorktreeCountResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_meta: Option<WorkspaceMeta>,
    /// Worktrees auto-removed to bring the count down to the new limit.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    evicted_worktrees: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorktreeStorageStatsPayload {
    /// Disk-size calculation walks every file in each worktree (`du`), which is
    /// expensive for worktrees with large `node_modules`. Off by default so the
    /// panel can show counts instantly; opted into on demand.
    #[serde(default)]
    include_sizes: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorktreeStorageRow {
    worktree: String,
    path: String,
    /// Only meaningful when the response's `sizesIncluded` is true; otherwise 0.
    bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_executed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorktreeStorageStatsResponse {
    request_id: String,
    ok: bool,
    total_count: usize,
    total_bytes: u64,
    /// Whether disk sizes were computed for this response.
    sizes_included: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_worktree_count: Option<u32>,
    worktrees: Vec<WorktreeStorageRow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceMarkOnboardingPayload {
    #[serde(default)]
    symlinks_configured: bool,
    #[serde(default)]
    commands_configured: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceRootDirectoryPayload {
    #[serde(default)]
    root_directory: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceWorktreeSymlinkPathsPayload {
    #[serde(default)]
    worktree_symlink_paths: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetWorktreeStatePayload {
    worktree: String,
    state: WorktreeState,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpencodeSettingsUpdatePayload {
    enabled: bool,
    #[serde(default)]
    default_model: Option<String>,
    #[serde(default)]
    settings_directory: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpencodeCopySkillsPayload {
    global_skills_path: String,
    workspace_skills_path: String,
    #[serde(default)]
    global_to_workspace: Vec<String>,
    #[serde(default)]
    workspace_to_global: Vec<String>,
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
    disable_groove_business: Option<bool>,
    hide_mascot: Option<bool>,
    hide_labels: Option<bool>,
    show_fps: Option<bool>,
    always_show_diagnostics_sidebar: Option<bool>,
    periodic_rerender_enabled: Option<bool>,
    theme_mode: Option<String>,
    keyboard_shortcut_leader: Option<String>,
    keyboard_leader_bindings: Option<HashMap<String, String>>,
    opencode_settings: Option<OpencodeSettingsUpdatePayload>,
    sound_library: Option<Vec<SoundLibraryEntry>>,
    claude_code_sound_settings: Option<ClaudeCodeSoundSettings>,
    groove_sound_settings: Option<GrooveSoundSettings>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SoundLibraryRemovePayload {
    sound_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SoundLibraryReadPayload {
    file_name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SoundLibraryRenamePayload {
    sound_id: String,
    new_name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SoundLibraryGetPathPayload {
    sound_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SoundLibraryPathResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    folder_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SoundLibraryReadResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitAuthStatusPayload {
    workspace_root: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhSwitchPayload {
    user: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhLogoutPayload {
    user: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhLoginPayload {
    token: String,
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
    log_state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    log_target: Option<String>,
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
struct WorkspaceOpenDirectoryResponse {
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
struct GrooveRecoverableListResponse {
    request_id: String,
    ok: bool,
    grooves: Vec<RunningGrooveRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrooveRecoverableClearPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    /// Worktrees to clear; an empty list clears every running record for the workspace.
    #[serde(default)]
    worktrees: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GrooveRecoverableClearResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrooveSummaryPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    session_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscoverWorktreeUnitPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    worktree: String,
    session_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaimWorktreeRewardPayload {
    worktree: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClaimWorktreeRewardResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    unit: Option<WorktreeUnit>,
    #[serde(skip_serializing_if = "Option::is_none")]
    gold: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LootWorktreePayload {
    worktree: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LootWorktreeResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    unit: Option<WorktreeUnit>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    loot: Vec<WorktreeLootEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    inventory: Option<HashMap<String, u32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscoverWorktreeUnitResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    unit: Option<WorktreeUnit>,
    #[serde(skip_serializing_if = "Option::is_none")]
    level: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    raw_claude_output: Option<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    was_new_discovery: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GrooveSummaryResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    summaries: Vec<GrooveSummaryEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    compiled_summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrooveCommentPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    worktree: String,
    /// When true, also feed the Claude conversation since the last commit into
    /// the drafting prompt (the Changes-panel "Draft commit comment" button).
    #[serde(default)]
    include_session: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GrooveCommentResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    comment: Option<CommentRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrooveCommentMarkCommittedPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    worktree: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GrooveCommentMarkCommittedResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    comment: Option<CommentRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GroovePrAttachPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    worktree: String,
    url: String,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    base: Option<String>,
    #[serde(default)]
    head: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GroovePrDetachPayload {
    root_name: Option<String>,
    #[serde(default)]
    known_worktrees: Vec<String>,
    workspace_meta: Option<WorkspaceMetaContext>,
    worktree: String,
    url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GroovePrResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pull_request: Option<PullRequestRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GrooveSummaryEntry {
    session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    worktree: Option<String>,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    summary: Option<String>,
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
struct GrooveTerminalActiveWorktreesResponse {
    request_id: String,
    ok: bool,
    worktrees: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GrooveTerminalActivityEntry {
    session_id: String,
    has_activity: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GrooveTerminalActivityResponse {
    request_id: String,
    ok: bool,
    entries: Vec<GrooveTerminalActivityEntry>,
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
struct SetWorktreeStateResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    worktree: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    record: Option<WorktreeRecord>,
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
pub(crate) struct SoundLibraryEntry {
    pub id: String,
    pub name: String,
    pub file_name: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClaudeCodeHookSoundEntry {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sound_id: Option<String>,
}

impl Default for ClaudeCodeHookSoundEntry {
    fn default() -> Self {
        Self {
            enabled: false,
            sound_id: None,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClaudeCodeSoundSettings {
    #[serde(default)]
    pub notification: ClaudeCodeHookSoundEntry,
    #[serde(default)]
    pub stop: ClaudeCodeHookSoundEntry,
}

impl Default for ClaudeCodeSoundSettings {
    fn default() -> Self {
        Self {
            notification: ClaudeCodeHookSoundEntry::default(),
            stop: ClaudeCodeHookSoundEntry::default(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GrooveSoundHookEntry {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sound_id: Option<String>,
}

impl Default for GrooveSoundHookEntry {
    fn default() -> Self {
        Self {
            enabled: false,
            sound_id: None,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GrooveSoundSettings {
    #[serde(default)]
    pub play: GrooveSoundHookEntry,
    #[serde(default)]
    pub pause: GrooveSoundHookEntry,
    #[serde(default)]
    pub summary_start: GrooveSoundHookEntry,
    #[serde(default)]
    pub summary_end: GrooveSoundHookEntry,
    #[serde(default)]
    pub emergency: GrooveSoundHookEntry,
    #[serde(default)]
    pub remove: GrooveSoundHookEntry,
}

impl Default for GrooveSoundSettings {
    fn default() -> Self {
        Self {
            play: GrooveSoundHookEntry::default(),
            pause: GrooveSoundHookEntry::default(),
            summary_start: GrooveSoundHookEntry::default(),
            summary_end: GrooveSoundHookEntry::default(),
            emergency: GrooveSoundHookEntry::default(),
            remove: GrooveSoundHookEntry::default(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct GlobalSettings {
    #[serde(default = "default_true")]
    telemetry_enabled: bool,
    #[serde(default, alias = "disableGrooveLoadingSection")]
    disable_groove_business: bool,
    #[serde(default)]
    hide_mascot: bool,
    #[serde(default)]
    hide_labels: bool,
    #[serde(default)]
    show_fps: bool,
    #[serde(default)]
    always_show_diagnostics_sidebar: bool,
    #[serde(default)]
    periodic_rerender_enabled: bool,
    #[serde(default = "default_theme_mode")]
    theme_mode: String,
    #[serde(default = "default_keyboard_shortcut_leader")]
    keyboard_shortcut_leader: String,
    #[serde(default = "default_keyboard_leader_bindings")]
    keyboard_leader_bindings: HashMap<String, String>,
    #[serde(default = "default_opencode_settings")]
    opencode_settings: OpencodeSettings,
    #[serde(default)]
    sound_library: Vec<SoundLibraryEntry>,
    #[serde(default)]
    claude_code_sound_settings: ClaudeCodeSoundSettings,
    #[serde(default)]
    groove_sound_settings: GrooveSoundSettings,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpencodeIntegrationStatusResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    workspace_scope_available: bool,
    global_scope_available: bool,
    effective_scope: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_settings: Option<OpencodeSettings>,
    #[serde(skip_serializing_if = "Option::is_none")]
    global_settings: Option<OpencodeSettings>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpencodeWorkspaceSettingsResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    settings: Option<OpencodeSettings>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpencodeGlobalSettingsResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    settings: Option<OpencodeSettings>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeStatusResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<OpenCodeStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpencodeSettingsDirectoryValidationResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    resolved_path: Option<String>,
    directory_exists: bool,
    opencode_config_exists: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpencodeSkillsListResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    global_scope: Option<OpencodeSkillScope>,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_scope: Option<OpencodeSkillScope>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpencodeCopySkillsResponse {
    request_id: String,
    ok: bool,
    copied_to_workspace: usize,
    copied_to_global: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeProfileResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    profile: Option<OpenCodeProfile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeSyncResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<SyncResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeRepairResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<OpenCodeRepairResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeRunResponse {
    request_id: String,
    ok: bool,
    result: OpenCodeRunResult,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeCancelResponse {
    request_id: String,
    ok: bool,
    result: CancelResult,
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
struct GhAccount {
    login: String,
    active: bool,
    scopes: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    protocol: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhAuthStatusResponse {
    request_id: String,
    ok: bool,
    installed: bool,
    logged_in: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    active_account: Option<String>,
    accounts: Vec<GhAccount>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhCommandResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhSshOverviewPayload {
    #[serde(default)]
    workspace_root: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhSshSetIdentityPayload {
    workspace_root: String,
    alias: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhSshIdentity {
    alias: String,
    hostname: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    identity_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    username: Option<String>,
    auth_state: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhRemoteOrigin {
    url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    owner: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    repo: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    matched_alias: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhSshOverviewResponse {
    request_id: String,
    ok: bool,
    config_found: bool,
    identities: Vec<GhSshIdentity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    origin: Option<GhRemoteOrigin>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhWorktreePayload {
    worktree_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPrViewPayload {
    worktree_path: String,
    selector: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPrCreateWebPayload {
    worktree_path: String,
    base: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhRepoDefaultBranchResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    default_branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// One PR as returned by `gh pr list --json ...`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPrSummary {
    number: i64,
    title: String,
    state: String,
    url: String,
    #[serde(default)]
    is_draft: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhPrListResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    branch: Option<String>,
    prs: Vec<GhPrSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhPrComment {
    #[serde(skip_serializing_if = "Option::is_none")]
    author: Option<String>,
    body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhPrDetail {
    number: i64,
    title: String,
    state: String,
    url: String,
    is_draft: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    base_ref_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    head_ref_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    review_decision: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    author: Option<String>,
    labels: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    additions: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    deletions: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    updated_at: Option<String>,
    comments: Vec<GhPrComment>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhPrViewResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pr: Option<GhPrDetail>,
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
struct GitDiffLine {
    kind: String,
    content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitDiffHunk {
    header: String,
    old_start: u32,
    old_lines: u32,
    new_start: u32,
    new_lines: u32,
    lines: Vec<GitDiffLine>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitDiffFile {
    file_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    old_path: Option<String>,
    status: String,
    additions: u32,
    deletions: u32,
    binary: bool,
    hunks: Vec<GitDiffHunk>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitDiffResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(default)]
    files: Vec<GitDiffFile>,
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    warnings: Vec<String>,
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

/// Result of registering Groove's embedded MCP server as an HTTP transport in
/// Claude Code (`claude mcp add`). `already_connected` distinguishes a no-op
/// re-add from a fresh registration so the UI can phrase it accurately.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AssistantConnectResponse {
    request_id: String,
    ok: bool,
    already_connected: bool,
    endpoint: String,
    scope: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Health snapshot for the Assistant settings page. `server_running` is a
/// direct probe of Groove's local MCP endpoint; `registered_in_claude` and
/// `claude_connection_ok` come from `claude mcp list` (which live-pings each
/// configured server). `ok` is the AND of all three.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AssistantValidateResponse {
    request_id: String,
    ok: bool,
    server_running: bool,
    registered_in_claude: bool,
    claude_connection_ok: bool,
    endpoint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Project + global assistant rules for the Settings → Assistant UI.
/// `project_workspace` is null when no workspace is open (project rules N/A).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AssistantRulesListResponse {
    request_id: String,
    ok: bool,
    global: Vec<AssistantRule>,
    project: Vec<AssistantRule>,
    #[serde(skip_serializing_if = "Option::is_none")]
    project_workspace: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}
