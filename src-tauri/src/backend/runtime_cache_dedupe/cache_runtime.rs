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

