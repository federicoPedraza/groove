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

