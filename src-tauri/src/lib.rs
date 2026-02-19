use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use uuid::Uuid;
use walkdir::WalkDir;

const MAX_DISCOVERY_DEPTH: usize = 4;
const MAX_DISCOVERY_DIRECTORIES: usize = 2500;

#[derive(Default)]
struct WorkspaceEventState {
    worker: Mutex<Option<WorkspaceWorker>>,
}

struct WorkspaceWorker {
    stop: Arc<AtomicBool>,
    handle: JoinHandle<()>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceMetaContext {
    version: Option<i64>,
    root_name: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceMeta {
    version: i64,
    root_name: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceScanRow {
    worktree: String,
    branch_guess: String,
    path: String,
    status: String,
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
            if workspace_meta.root_name != expected_root_name {
                workspace_meta.root_name = expected_root_name;
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
    workspace_root: &Path,
) -> Result<(bool, Vec<WorkspaceScanRow>), String> {
    let worktrees_dir = workspace_root.join(".worktrees");
    if !path_is_directory(&worktrees_dir) {
        return Ok((false, Vec::new()));
    }

    let mut rows = Vec::new();
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
            "ready"
        } else {
            "missing .groove"
        };

        rows.push(WorkspaceScanRow {
            branch_guess: branch_guess_from_worktree_name(&worktree),
            path: path.display().to_string(),
            status: status.to_string(),
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

    let (has_worktrees_directory, rows) = match scan_workspace_worktrees(workspace_root) {
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

    if version.is_none() && root_name.is_none() && created_at.is_none() && updated_at.is_none() {
        return None;
    }

    Some(WorkspaceMetaContext {
        version,
        root_name,
        created_at,
        updated_at,
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
}

fn stop_process_by_pid(pid: i32) -> Result<(bool, i32), String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("taskkill")
            .args(["/PID", &pid.to_string()])
            .output()
            .map_err(|error| format!("Failed to execute taskkill: {error}"))?;

        if output.status.success() {
            return Ok((false, pid));
        }

        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if should_treat_as_already_stopped(&stderr) {
            return Ok((true, pid));
        }

        return Err(format!("Failed to stop PID {pid}: {stderr}"));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .output()
            .map_err(|error| format!("Failed to execute kill: {error}"))?;

        if output.status.success() {
            return Ok((false, pid));
        }

        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if should_treat_as_already_stopped(&stderr) {
            return Ok((true, pid));
        }

        Err(format!("Failed to stop PID {pid}: {stderr}"))
    }
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
fn workspace_clear_active(app: AppHandle) -> WorkspaceContextResponse {
    let request_id = request_id();
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

        let _ = app_handle.emit(
            "workspace-ready",
            serde_json::json!({
                "requestId": request_id_clone,
                "workspaceRoot": workspace_root_clone,
                "kind": "filesystem"
            }),
        );

        let mut index: u64 = 0;
        while !stop_signal.load(Ordering::Relaxed) {
            for target in &poll_targets {
                let next = snapshot_entry(target);
                let previous = snapshots.get(target).cloned().unwrap_or(SnapshotEntry {
                    exists: false,
                    mtime_ms: 0,
                });

                if previous.exists != next.exists || previous.mtime_ms != next.mtime_ms {
                    snapshots.insert(target.clone(), next);
                    index += 1;
                    let _ = app_handle.emit(
                        "workspace-change",
                        serde_json::json!({
                            "index": index,
                            "source": target.file_name().map(|v| v.to_string_lossy().to_string()).unwrap_or_default(),
                            "kind": "filesystem"
                        }),
                    );
                }
            }

            thread::sleep(Duration::from_millis(1800));
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
        .invoke_handler(tauri::generate_handler![
            workspace_pick_and_open,
            workspace_open,
            workspace_get_active,
            workspace_clear_active,
            groove_list,
            groove_restore,
            groove_rm,
            groove_stop,
            workspace_events
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
