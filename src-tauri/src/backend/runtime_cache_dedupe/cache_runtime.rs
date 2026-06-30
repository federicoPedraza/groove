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
    _workspace_root: &Path,
    known_worktrees: &[String],
) -> HashMap<String, Option<i32>> {
    known_worktrees
        .iter()
        .map(|worktree| (worktree.clone(), None))
        .collect()
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
    let effective_root = ensure_workspace_meta(workspace_root)
        .map(|(meta, _)| effective_workspace_root(workspace_root, &meta))
        .unwrap_or_else(|_| workspace_root.to_path_buf());
    Ok(WorkspaceContextSignature {
        workspace_manifest: snapshot_entry(&workspace_root.join(".groove").join("workspace.json")),
        worktrees_dir: snapshot_entry(&effective_root.join(".worktrees")),
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

fn terminal_resolution_cache_key(root_name: &Option<String>, worktree: &str) -> String {
    format!("{}|{}", root_name.as_deref().unwrap_or_default(), worktree)
}

fn terminal_resolution_signature(
    app: &AppHandle,
    workspace_root: &Path,
    worktree_path: &Path,
) -> TerminalResolutionSignature {
    let active_state_file = workspace_state_file(app)
        .map(|path| snapshot_entry(&path))
        .unwrap_or(SnapshotEntry {
            exists: false,
            mtime_ms: 0,
        });
    TerminalResolutionSignature {
        active_state_file,
        workspace_manifest: snapshot_entry(&workspace_root.join(".groove").join("workspace.json")),
        worktree_dir: snapshot_entry(worktree_path),
    }
}

/// Returns the cached resolution if its cheap signature still matches the
/// filesystem. The signature recompute (a few `stat`s) replaces the O(worktree
/// count) directory walk + manifest parse that a full resolve performs.
fn try_cached_terminal_resolution(
    app: &AppHandle,
    root_name: &Option<String>,
    worktree: &str,
) -> Option<(PathBuf, PathBuf)> {
    let cache_state = app.try_state::<TerminalResolutionCacheState>()?;
    let key = terminal_resolution_cache_key(root_name, worktree);
    let (workspace_root, worktree_path, cached_signature) = {
        let entries = cache_state.entries.lock().ok()?;
        let cached = entries.get(&key)?;
        (
            cached.workspace_root.clone(),
            cached.worktree_path.clone(),
            cached.signature.clone(),
        )
    };
    // Compute the current signature without holding the cache lock.
    if cached_signature != terminal_resolution_signature(app, &workspace_root, &worktree_path) {
        return None;
    }
    Some((workspace_root, worktree_path))
}

fn store_terminal_resolution(
    app: &AppHandle,
    root_name: &Option<String>,
    worktree: &str,
    workspace_root: &Path,
    worktree_path: &Path,
) {
    let Some(cache_state) = app.try_state::<TerminalResolutionCacheState>() else {
        return;
    };
    let signature = terminal_resolution_signature(app, workspace_root, worktree_path);
    let Ok(mut entries) = cache_state.entries.lock() else {
        return;
    };
    entries.insert(
        terminal_resolution_cache_key(root_name, worktree),
        TerminalResolutionCacheEntry {
            workspace_root: workspace_root.to_path_buf(),
            worktree_path: worktree_path.to_path_buf(),
            signature,
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

/// Mutates the cached `WorkspaceContextResponse` in place (if any) and
/// refreshes the signature so the next `try_cached_workspace_context` call
/// continues to serve the patched response without going through the full
/// `build_workspace_context` rebuild.
///
/// Used by mutation handlers that already know exactly what changed (e.g.,
/// `workspace_set_worktree_state`) — saves a full re-`scan_workspace_worktrees`
/// after the mutation.
fn patch_workspace_context_cache(
    app: &AppHandle,
    workspace_root: &Path,
    patch: impl FnOnce(&mut WorkspaceContextResponse),
) {
    let Some(cache_state) = app.try_state::<WorkspaceContextCacheState>() else {
        return;
    };
    let Ok(signature) = workspace_context_signature(app, workspace_root) else {
        return;
    };
    let Ok(mut entries) = cache_state.entries.lock() else {
        return;
    };
    let key = workspace_context_cache_key(workspace_root);
    let Some(entry) = entries.get_mut(&key) else {
        return;
    };
    patch(&mut entry.response);
    entry.signature = signature;
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

