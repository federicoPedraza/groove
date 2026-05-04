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

    let list_effective_root = ensure_workspace_meta(&workspace_root)
        .map(|(meta, _)| effective_workspace_root(&workspace_root, &meta))
        .unwrap_or_else(|_| workspace_root.clone());

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
            &list_effective_root,
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
                    collect_groove_list_via_shell(&app, &list_effective_root, &known_worktrees, &dir);
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

    let mut root_resolution_attempts = Vec::new();
    let explicit_workspace_root = payload
        .workspace_root
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let (workspace_root, root_fallback_used) = if let Some(workspace_root_hint) = explicit_workspace_root
    {
        match validate_workspace_root_path(workspace_root_hint) {
            Ok(root) => {
                root_resolution_attempts.push(format!(
                    "payload.workspaceRoot={} (validated)",
                    root.display()
                ));
                (root, false)
            }
            Err(error) => {
                root_resolution_attempts.push(format!(
                    "payload.workspaceRoot={} (invalid: {error})",
                    workspace_root_hint
                ));
                let primary_result = resolve_workspace_root(
                    &app,
                    &payload.root_name,
                    Some(&worktree),
                    &known_worktrees,
                    &payload.workspace_meta,
                );

                match primary_result {
                    Ok(root) => {
                        root_resolution_attempts.push(
                            "active-workspace/rootName with required worktree (resolved)".to_string(),
                        );
                        (root, false)
                    }
                    Err(primary_error) => {
                        root_resolution_attempts.push(format!(
                            "active-workspace/rootName with required worktree (failed: {primary_error})"
                        ));
                        log_play_telemetry(
                            telemetry_enabled,
                            "groove_restore.resolve_root_primary_failed",
                            format!(
                                "request_id={} worktree={} error={primary_error}",
                                request_id, worktree
                            )
                            .as_str(),
                        );

                        match resolve_workspace_root(
                            &app,
                            &payload.root_name,
                            None,
                            &known_worktrees,
                            &payload.workspace_meta,
                        ) {
                            Ok(root) => {
                                root_resolution_attempts.push(
                                    "active-workspace/rootName without required worktree (resolved)"
                                        .to_string(),
                                );
                                (root, true)
                            }
                            Err(secondary_error) => {
                                root_resolution_attempts.push(format!(
                                    "active-workspace/rootName without required worktree (failed: {secondary_error})"
                                ));
                                let combined_error = format!(
                                    "Could not resolve workspace root for Play Groove. Attempted {}.",
                                    root_resolution_attempts.join("; ")
                                );
                                log_play_telemetry(
                                    telemetry_enabled,
                                    "groove_restore.resolve_root_failed",
                                    format!(
                                        "request_id={} worktree={} error={combined_error}",
                                        request_id, worktree
                                    )
                                    .as_str(),
                                );
                                return GrooveCommandResponse {
                                    request_id,
                                    ok: false,
                                    exit_code: None,
                                    stdout: String::new(),
                                    stderr: String::new(),
                                    error: Some(combined_error),
                                };
                            }
                        }
                    }
                }
            }
        }
    } else {
        root_resolution_attempts
            .push("payload.workspaceRoot (not provided)".to_string());
        let primary_result = resolve_workspace_root(
            &app,
            &payload.root_name,
            Some(&worktree),
            &known_worktrees,
            &payload.workspace_meta,
        );

        match primary_result {
            Ok(root) => {
                root_resolution_attempts
                    .push("active-workspace/rootName with required worktree (resolved)".to_string());
                (root, false)
            }
            Err(primary_error) => {
                root_resolution_attempts.push(format!(
                    "active-workspace/rootName with required worktree (failed: {primary_error})"
                ));
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
                    Ok(root) => {
                        root_resolution_attempts.push(
                            "active-workspace/rootName without required worktree (resolved)"
                                .to_string(),
                        );
                        (root, true)
                    }
                    Err(secondary_error) => {
                        root_resolution_attempts.push(format!(
                            "active-workspace/rootName without required worktree (failed: {secondary_error})"
                        ));
                        let combined_error = format!(
                            "Could not resolve workspace root for Play Groove. Attempted {}.",
                            root_resolution_attempts.join("; ")
                        );
                        log_play_telemetry(
                            telemetry_enabled,
                            "groove_restore.resolve_root_failed",
                            format!("request_id={} worktree={} error={combined_error}", request_id, worktree)
                                .as_str(),
                        );
                        return GrooveCommandResponse {
                            request_id,
                            ok: false,
                            exit_code: None,
                            stdout: String::new(),
                            stderr: String::new(),
                            error: Some(combined_error),
                        };
                    }
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
    let effective_root = ensure_workspace_meta(&workspace_root)
        .map(|(meta, _)| effective_workspace_root(&workspace_root, &meta))
        .unwrap_or_else(|_| workspace_root.clone());
    let worktree_candidates = worktree_path_token_candidates(&worktree);
    let mut expected_worktree_path = resolve_worktree_path_for_candidates(
        &effective_root,
        &worktree_dir,
        &worktree_candidates,
    )
    .unwrap_or_else(|| effective_root.join(&worktree_dir).join(&worktree_candidates[0]));
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

        let recreate_result = run_command(&groove_binary_path(&app), &create_args, &effective_root);
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

        expected_worktree_path = resolve_worktree_path_for_candidates(
            &effective_root,
            &worktree_dir,
            &worktree_candidates,
        )
        .unwrap_or(expected_worktree_path);

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

    let mut ensure_errors = Vec::new();
    let ensured_worktree_path = worktree_candidates
        .iter()
        .find_map(|candidate| match ensure_worktree_in_dir(&effective_root, candidate, &worktree_dir)
        {
            Ok(path) => Some(path),
            Err(error) => {
                ensure_errors.push(error);
                None
            }
        });
    let Some(ensured_worktree_path) = ensured_worktree_path else {
        return GrooveCommandResponse {
            request_id,
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error: Some(ensure_errors.join(" ")),
        };
    };
    expected_worktree_path = ensured_worktree_path;

    ensure_claude_hooks(&expected_worktree_path, &worktree);

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
            let terminal_open_mode = if is_groove_terminal_claude_code_command(command_template) {
                GrooveTerminalOpenMode::ClaudeCode
            } else {
                GrooveTerminalOpenMode::Opencode
            };
            match open_groove_terminal_session(
                &app,
                &terminal_state,
                &workspace_root,
                &worktree,
                &expected_worktree_path,
                terminal_open_mode,
                Some(play_target.as_str()),
                None,
                None,
                false,
                true,
            ) {
                Ok(session) => {
                    if is_groove_terminal_claude_code_command(command_template) {
                        mark_claude_session_started(&workspace_root, &worktree);
                    }
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
        run_command(&groove_binary_path(&app), &args, &effective_root)
    };
    let ok = result.exit_code == Some(0) && result.error.is_none();
    if ok {
        let stamped_worktree = expected_worktree_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_else(|| payload.worktree.trim());
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

fn worktree_path_token_candidates(worktree: &str) -> Vec<String> {
    let mut candidates = vec![worktree.to_string()];
    let stamped = worktree.replace('/', "_");
    if stamped != worktree {
        candidates.push(stamped);
    }
    candidates
}

fn resolve_worktree_path_for_candidates(
    workspace_root: &Path,
    worktree_dir: &str,
    candidates: &[String],
) -> Option<PathBuf> {
    for candidate in candidates {
        let expected_suffix = Path::new(worktree_dir).join(candidate);
        let candidate_path = if workspace_root.ends_with(&expected_suffix) {
            workspace_root.to_path_buf()
        } else {
            workspace_root.join(worktree_dir).join(candidate)
        };

        if path_is_directory(&candidate_path) {
            return Some(candidate_path);
        }
    }

    None
}

#[tauri::command]
async fn groove_summary(app: AppHandle, payload: GrooveSummaryPayload) -> GrooveSummaryResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || {
        groove_summary_blocking(app, payload, request_id)
    })
    .await
    {
        Ok(response) => response,
        Err(error) => GrooveSummaryResponse {
            request_id: fallback_request_id,
            ok: false,
            summaries: Vec::new(),
            compiled_summary: None,
            error: Some(format!("Failed to run groove summary worker thread: {error}")),
        },
    }
}

/// Parse "RESUMEN: <one_liner>\n---\n<content>" format. Falls back gracefully.
fn parse_summary_parts(raw: &str) -> (String, String) {
    if let Some(rest) = raw.strip_prefix("RESUMEN:").or_else(|| raw.strip_prefix("Resumen:")) {
        if let Some(sep_pos) = rest.find("\n---") {
            let one_liner = rest[..sep_pos].trim().to_string();
            let content = rest[sep_pos..].trim_start_matches('\n').trim_start_matches("---").trim().to_string();
            return (one_liner, content);
        }
    }
    // Fallback: no structured format detected
    (String::new(), raw.to_string())
}

fn groove_summary_blocking(
    app: AppHandle,
    payload: GrooveSummaryPayload,
    request_id: String,
) -> GrooveSummaryResponse {
    if payload.session_ids.is_empty() {
        return GrooveSummaryResponse {
            request_id,
            ok: false,
            summaries: Vec::new(),
            compiled_summary: None,
            error: Some("session_ids is required and must not be empty.".to_string()),
        };
    }

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(known_worktrees) => known_worktrees,
        Err(error) => {
            return GrooveSummaryResponse {
                request_id,
                ok: false,
                summaries: Vec::new(),
                compiled_summary: None,
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
            return GrooveSummaryResponse {
                request_id,
                ok: false,
                summaries: Vec::new(),
                compiled_summary: None,
                error: Some(error),
            }
        }
    };

    let claude_bin = resolve_claude_code_bin();

    // Build a reverse map from session ID to worktree name
    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    let parsed_meta_for_summary = read_workspace_meta_file(&workspace_json).ok();
    let summary_effective_root = parsed_meta_for_summary
        .as_ref()
        .map(|meta| effective_workspace_root(&workspace_root, meta))
        .unwrap_or_else(|| workspace_root.clone());
    let id_to_worktree: HashMap<String, String> = if let Some(meta) = parsed_meta_for_summary {
        meta.worktree_records
            .iter()
            .map(|(name, record)| (record.id.clone(), name.clone()))
            .collect()
    } else {
        HashMap::new()
    };

    let prompt = "Summarize the work done in this session. The content will be used as a Pull Request description. Use this exact format:\n\nRESUMEN: <one-liner in Spanish describing the work, no technical details>\n---\n<concise PR-ready summary of what was accomplished and what remains, using markdown>";
    let mut summaries = Vec::new();

    for session_id in &payload.session_ids {
        let worktree_name = id_to_worktree.get(session_id);
        let cwd = match worktree_name {
            Some(name) => {
                let wt_path = summary_effective_root.join(".worktrees").join(name);
                if wt_path.is_dir() { wt_path } else { summary_effective_root.clone() }
            }
            None => summary_effective_root.clone(),
        };

        let resolved_session_id =
            resolve_existing_claude_session_id(&cwd, session_id).unwrap_or_else(|| session_id.clone());

        eprintln!(
            "[groove-summary] running claude --resume {} (stored={}) -p '...' --output-format text",
            resolved_session_id, session_id
        );
        eprintln!("[groove-summary] claude_bin={} cwd={}", claude_bin, cwd.display());

        let output = Command::new(&claude_bin)
            .args([
                "--resume",
                &resolved_session_id,
                "-p",
                prompt,
                "--output-format",
                "text",
            ])
            .current_dir(&cwd)
            .output();

        let worktree = id_to_worktree.get(session_id).cloned();

        match output {
            Ok(out) if out.status.success() => {
                let summary_text = String::from_utf8_lossy(&out.stdout).trim().to_string();
                eprintln!("[groove-summary] session {} ok, summary_len={}", session_id, summary_text.len());
                summaries.push(GrooveSummaryEntry {
                    session_id: session_id.clone(),
                    worktree,
                    ok: true,
                    summary: Some(summary_text),
                    error: None,
                });
            }
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                eprintln!("[groove-summary] session {} failed, exit={:?} stdout={} stderr={}", session_id, out.status.code(), stdout, stderr);
                summaries.push(GrooveSummaryEntry {
                    session_id: session_id.clone(),
                    worktree,
                    ok: false,
                    summary: None,
                    error: Some(if stderr.is_empty() {
                        format!("Claude exited with status {:?}. stdout: {}", out.status.code(), stdout)
                    } else {
                        stderr
                    }),
                });
            }
            Err(error) => {
                eprintln!("[groove-summary] session {} exec error: {}", session_id, error);
                summaries.push(GrooveSummaryEntry {
                    session_id: session_id.clone(),
                    worktree,
                    ok: false,
                    summary: None,
                    error: Some(format!("Failed to execute claude: {error}")),
                });
            }
        }
    }

    // If multiple sessions, compile into a daily summary
    let compiled_summary = if summaries.len() > 1 {
        let successful: Vec<&GrooveSummaryEntry> =
            summaries.iter().filter(|s| s.ok).collect();

        if successful.is_empty() {
            None
        } else {
            let mut compile_input = String::new();
            for entry in &successful {
                let label = entry
                    .worktree
                    .as_deref()
                    .unwrap_or(&entry.session_id);
                compile_input.push_str(&format!(
                    "## {}\n{}\n\n",
                    label,
                    entry.summary.as_deref().unwrap_or("")
                ));
            }

            let compile_prompt = format!(
                "Based on these worktree summaries, give a concise overview. The content will be used as a Pull Request description. Use this exact format:\n\nRESUMEN: <one-liner in Spanish describing the work, no technical details>\n---\n<concise PR-ready summary of what was accomplished and what remains, using markdown>\n\nSummaries:\n\n{}",
                compile_input
            );

            let compile_output = Command::new(&claude_bin)
                .args(["-p", &compile_prompt, "--output-format", "text"])
                .current_dir(&workspace_root)
                .output();

            match compile_output {
                Ok(out) if out.status.success() => {
                    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
                }
                _ => None,
            }
        }
    } else {
        None
    };

    // Persist summaries to workspace.json
    if let Ok(mut workspace_meta) = read_workspace_meta_file(&workspace_json) {
        let now = now_iso();

        // Store individual summaries in each worktree record
        for entry in &summaries {
            if !entry.ok {
                continue;
            }
            let Some(summary_text) = entry.summary.as_ref() else {
                continue;
            };
            let Some(worktree_name) = id_to_worktree.get(&entry.session_id) else {
                continue;
            };
            if let Some(record) = workspace_meta.worktree_records.get_mut(worktree_name) {
                let (one_liner, content) = parse_summary_parts(summary_text);
                record.summaries.push(SummaryRecord {
                    worktree_ids: vec![entry.session_id.clone()],
                    created_at: now.clone(),
                    summary: content,
                    one_liner,
                });
            }
        }

        // Store compiled summary at workspace level
        if let Some(ref compiled_text) = compiled_summary {
            let involved_ids: Vec<String> = summaries
                .iter()
                .filter(|s| s.ok)
                .map(|s| s.session_id.clone())
                .collect();
            let (one_liner, content) = parse_summary_parts(compiled_text);
            workspace_meta.summaries.push(SummaryRecord {
                worktree_ids: involved_ids,
                created_at: now,
                summary: content,
                one_liner,
            });
        }

        workspace_meta.updated_at = now_iso();
        let _ = write_workspace_meta_file(&workspace_json, &workspace_meta);
    }

    GrooveSummaryResponse {
        request_id,
        ok: true,
        summaries,
        compiled_summary,
        error: None,
    }
}

#[tauri::command]
async fn groove_comment(app: AppHandle, payload: GrooveCommentPayload) -> GrooveCommentResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || {
        groove_comment_blocking(app, payload, request_id)
    })
    .await
    {
        Ok(response) => response,
        Err(error) => GrooveCommentResponse {
            request_id: fallback_request_id,
            ok: false,
            comment: None,
            error: Some(format!("Failed to run groove comment worker thread: {error}")),
        },
    }
}

const GROOVE_COMMENT_DIFF_BUDGET: usize = 48 * 1024;

fn truncate_to_budget(value: &str, budget: usize) -> String {
    if value.len() <= budget {
        return value.to_string();
    }
    let mut truncated = value[..budget].to_string();
    truncated.push_str("\n... [truncated]\n");
    truncated
}

fn groove_comment_blocking(
    app: AppHandle,
    payload: GrooveCommentPayload,
    request_id: String,
) -> GrooveCommentResponse {
    let trimmed_worktree = payload.worktree.trim();
    if trimmed_worktree.is_empty() {
        return GrooveCommentResponse {
            request_id,
            ok: false,
            comment: None,
            error: Some("worktree is required.".to_string()),
        };
    }

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(value) => value,
        Err(error) => {
            return GrooveCommentResponse {
                request_id,
                ok: false,
                comment: None,
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
            return GrooveCommentResponse {
                request_id,
                ok: false,
                comment: None,
                error: Some(error),
            }
        }
    };

    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    let parsed_meta = match read_workspace_meta_file(&workspace_json) {
        Ok(meta) => meta,
        Err(error) => {
            return GrooveCommentResponse {
                request_id,
                ok: false,
                comment: None,
                error: Some(format!("Failed to read workspace.json: {error}")),
            }
        }
    };
    let effective_root = effective_workspace_root(&workspace_root, &parsed_meta);

    let worktree_path = effective_root.join(".worktrees").join(trimmed_worktree);
    if !worktree_path.is_dir() {
        return GrooveCommentResponse {
            request_id,
            ok: false,
            comment: None,
            error: Some(format!(
                "Worktree directory not found: {}",
                worktree_path.display()
            )),
        };
    }

    let worktree_id = parsed_meta
        .worktree_records
        .get(trimmed_worktree)
        .map(|record| record.id.clone());
    let Some(worktree_id) = worktree_id else {
        return GrooveCommentResponse {
            request_id,
            ok: false,
            comment: None,
            error: Some(format!(
                "No worktree record for \"{trimmed_worktree}\". Discover the worktree first."
            )),
        };
    };

    let status_result = run_git_command_at_path(&worktree_path, &["status", "--porcelain"]);
    if let Some(error) = status_result.error.clone() {
        return GrooveCommentResponse {
            request_id,
            ok: false,
            comment: None,
            error: Some(error),
        };
    }
    let status_output = status_result.stdout.trim();
    if status_output.is_empty() {
        return GrooveCommentResponse {
            request_id,
            ok: false,
            comment: None,
            error: Some("No changes to comment on. Working tree is clean.".to_string()),
        };
    }

    let diff_unstaged = run_git_command_at_path(&worktree_path, &["diff"]);
    let diff_staged = run_git_command_at_path(&worktree_path, &["diff", "--cached"]);

    let mut diff_text = String::new();
    let unstaged = diff_unstaged.stdout.trim();
    let staged = diff_staged.stdout.trim();
    if !staged.is_empty() {
        diff_text.push_str("# Staged diff\n");
        diff_text.push_str(staged);
        diff_text.push_str("\n\n");
    }
    if !unstaged.is_empty() {
        diff_text.push_str("# Unstaged diff\n");
        diff_text.push_str(unstaged);
    }
    let diff_text = truncate_to_budget(&diff_text, GROOVE_COMMENT_DIFF_BUDGET);

    let prompt = format!(
        "Write a single conventional-commit message for the changes below. \
Output ONLY the commit message text — no quotes, no markdown fences, no preamble. \
First line: type(scope?): subject (<= 72 chars, imperative, lowercase after type). \
If meaningful, add a blank line and a short body explaining the why. \
Do not include file lists or trivia.\n\n# git status --porcelain\n{}\n\n{}",
        status_output, diff_text
    );

    let claude_bin = resolve_claude_code_bin();
    eprintln!(
        "[groove-comment] running claude -p ... at {}",
        worktree_path.display()
    );
    let output = Command::new(&claude_bin)
        .args(["-p", &prompt, "--output-format", "text"])
        .current_dir(&worktree_path)
        .output();

    let message = match output {
        Ok(out) if out.status.success() => {
            let raw = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if raw.is_empty() {
                return GrooveCommentResponse {
                    request_id,
                    ok: false,
                    comment: None,
                    error: Some("Claude returned an empty commit message.".to_string()),
                };
            }
            raw
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            return GrooveCommentResponse {
                request_id,
                ok: false,
                comment: None,
                error: Some(if !stderr.is_empty() {
                    stderr
                } else if !stdout.is_empty() {
                    stdout
                } else {
                    format!("Claude exited with status {:?}", out.status.code())
                }),
            };
        }
        Err(error) => {
            return GrooveCommentResponse {
                request_id,
                ok: false,
                comment: None,
                error: Some(format!("Failed to execute claude: {error}")),
            };
        }
    };

    let now = now_iso();
    let new_record = CommentRecord {
        worktree_id: worktree_id.clone(),
        created_at: now.clone(),
        message: message.clone(),
        state: CommentState::Uncommitted,
    };

    if let Ok(mut workspace_meta) = read_workspace_meta_file(&workspace_json) {
        if let Some(record) = workspace_meta.worktree_records.get_mut(trimmed_worktree) {
            record.comments.push(new_record.clone());
            workspace_meta.updated_at = now_iso();
            let _ = write_workspace_meta_file(&workspace_json, &workspace_meta);
        }
    }

    GrooveCommentResponse {
        request_id,
        ok: true,
        comment: Some(new_record),
        error: None,
    }
}

#[tauri::command]
async fn groove_comment_mark_committed(
    app: AppHandle,
    payload: GrooveCommentMarkCommittedPayload,
) -> GrooveCommentMarkCommittedResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || {
        groove_comment_mark_committed_blocking(app, payload, request_id)
    })
    .await
    {
        Ok(response) => response,
        Err(error) => GrooveCommentMarkCommittedResponse {
            request_id: fallback_request_id,
            ok: false,
            comment: None,
            error: Some(format!(
                "Failed to run groove comment mark-committed worker thread: {error}"
            )),
        },
    }
}

fn groove_comment_mark_committed_blocking(
    app: AppHandle,
    payload: GrooveCommentMarkCommittedPayload,
    request_id: String,
) -> GrooveCommentMarkCommittedResponse {
    let trimmed_worktree = payload.worktree.trim();
    if trimmed_worktree.is_empty() {
        return GrooveCommentMarkCommittedResponse {
            request_id,
            ok: false,
            comment: None,
            error: Some("worktree is required.".to_string()),
        };
    }
    let trimmed_created_at = payload.created_at.trim();
    if trimmed_created_at.is_empty() {
        return GrooveCommentMarkCommittedResponse {
            request_id,
            ok: false,
            comment: None,
            error: Some("createdAt is required.".to_string()),
        };
    }

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(value) => value,
        Err(error) => {
            return GrooveCommentMarkCommittedResponse {
                request_id,
                ok: false,
                comment: None,
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
            return GrooveCommentMarkCommittedResponse {
                request_id,
                ok: false,
                comment: None,
                error: Some(error),
            }
        }
    };

    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    let mut workspace_meta = match read_workspace_meta_file(&workspace_json) {
        Ok(meta) => meta,
        Err(error) => {
            return GrooveCommentMarkCommittedResponse {
                request_id,
                ok: false,
                comment: None,
                error: Some(format!("Failed to read workspace.json: {error}")),
            }
        }
    };

    let Some(record) = workspace_meta.worktree_records.get_mut(trimmed_worktree) else {
        return GrooveCommentMarkCommittedResponse {
            request_id,
            ok: false,
            comment: None,
            error: Some(format!("No worktree record for \"{trimmed_worktree}\".")),
        };
    };

    let Some(comment) = record
        .comments
        .iter_mut()
        .find(|c| c.created_at == trimmed_created_at)
    else {
        return GrooveCommentMarkCommittedResponse {
            request_id,
            ok: false,
            comment: None,
            error: Some(format!(
                "No comment with createdAt={trimmed_created_at} for worktree \"{trimmed_worktree}\"."
            )),
        };
    };

    comment.state = CommentState::Committed;
    let updated = comment.clone();
    workspace_meta.updated_at = now_iso();
    if let Err(error) = write_workspace_meta_file(&workspace_json, &workspace_meta) {
        return GrooveCommentMarkCommittedResponse {
            request_id,
            ok: false,
            comment: None,
            error: Some(error),
        };
    }

    GrooveCommentMarkCommittedResponse {
        request_id,
        ok: true,
        comment: Some(updated),
        error: None,
    }
}

#[cfg(test)]
mod groove_commands_tests {
    use super::*;

    #[test]
    fn resolves_existing_stamped_worktree_path_from_branch_like_token() {
        let temp_root = std::env::temp_dir().join(format!("groove-test-{}", Uuid::new_v4()));
        let stamped = temp_root.join(".worktrees").join("groove_patch.123");
        fs::create_dir_all(&stamped).expect("create stamped worktree directory");

        let candidates = worktree_path_token_candidates("groove/patch.123");
        let resolved = resolve_worktree_path_for_candidates(&temp_root, ".worktrees", &candidates)
            .expect("resolve worktree path");

        assert_eq!(resolved, stamped);

        fs::remove_dir_all(&temp_root).expect("cleanup temp workspace");
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
    let effective_root = ensure_workspace_meta(&workspace_root)
        .map(|(meta, _)| effective_workspace_root(&workspace_root, &meta))
        .unwrap_or_else(|_| workspace_root.clone());

    let mut args = vec!["create".to_string(), branch.to_string()];
    if let Some(base) = base {
        args.push("--base".to_string());
        args.push(base);
    }
    if let Some(dir) = dir {
        args.push("--dir".to_string());
        args.push(dir);
    }

    let mut result = run_command(&groove_binary_path(&app), &args, &effective_root);
    let ok = result.exit_code == Some(0) && result.error.is_none();
    if ok {
        let stamped_worktree = branch.replace('/', "_");
        if let Err(error) = register_worktree_record(&workspace_root, &stamped_worktree).map(|_| ()) {
            return GrooveCommandResponse {
                request_id,
                ok: false,
                exit_code: result.exit_code,
                stdout: result.stdout,
                stderr: result.stderr,
                error: Some(error),
            };
        }
        if let Err(sync_error) =
            sync_worktree_records_with_disk(&workspace_root, &effective_root)
        {
            if !result.stderr.trim().is_empty() {
                result.stderr.push('\n');
            }
            result.stderr.push_str(&format!(
                "Warning: failed to sync worktree records with disk: {sync_error}"
            ));
        }
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

        if let Ok(worktree_path) = ensure_worktree_in_dir(&effective_root, &stamped_worktree, &worktree_dir) {
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

            ensure_claude_hooks(&worktree_path, &stamped_worktree);
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
    let effective_root = ensure_workspace_meta(&workspace_root)
        .map(|(meta, _)| effective_workspace_root(&workspace_root, &meta))
        .unwrap_or_else(|_| workspace_root.clone());
    let target_path =
        match ensure_worktree_in_dir(&effective_root, &resolution_worktree, &worktree_dir) {
            Ok(path) => path,
            Err(error) => {
                if is_worktree_missing_error_message(&error) {
                    if let Err(cleanup_error) = clear_stale_worktree_state(
                        &app,
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

    let mut result = run_command(&binary, &args, &effective_root);
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

    if let Err(error) = validate_optional_relative_path(&payload.dir, "dir") {
        return GrooveStopResponse {
            request_id,
            ok: false,
            already_stopped: None,
            pid: None,
            source: None,
            error: Some(error),
        };
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

const DISCOVER_PROMPT: &str = "Analyze the work done in this Claude session. Rate its difficulty on a scale 1-5 based on the following cheatsheet, then respond with ONLY a single digit (1, 2, 3, 4, or 5). No words, no punctuation, no explanation.\n\nCheatsheet:\n- 1: UI fixes, fixes that look accidentally placed on someone else's PR.\n- 2: Bugs, crashing bugs, backend weird-to-find or missing things.\n- 3: Features, complex backend discovery, many attempts at fixing this bug because of PR reviewers.\n- 4: Complex, weird-to-explain, weird-to-find, non-features, complex backend analysis (few attempts).\n- 5: Same as 4 but with many attempts.\n\nRespond with a single digit only.";

#[tauri::command]
async fn groove_discover_worktree_unit(
    app: AppHandle,
    payload: DiscoverWorktreeUnitPayload,
) -> DiscoverWorktreeUnitResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || {
        groove_discover_worktree_unit_blocking(app, payload, request_id)
    })
    .await
    {
        Ok(response) => response,
        Err(error) => DiscoverWorktreeUnitResponse {
            request_id: fallback_request_id,
            ok: false,
            unit: None,
            level: None,
            raw_claude_output: None,
            was_new_discovery: false,
            error: Some(format!(
                "Failed to run groove discover worker thread: {error}"
            )),
        },
    }
}

fn groove_discover_worktree_unit_blocking(
    app: AppHandle,
    payload: DiscoverWorktreeUnitPayload,
    request_id: String,
) -> DiscoverWorktreeUnitResponse {
    let worktree = payload.worktree.trim();
    if worktree.is_empty() {
        return DiscoverWorktreeUnitResponse {
            request_id,
            ok: false,
            unit: None,
            level: None,
            raw_claude_output: None,
            was_new_discovery: false,
            error: Some("worktree is required.".to_string()),
        };
    }
    let session_id = payload.session_id.trim();
    if session_id.is_empty() {
        return DiscoverWorktreeUnitResponse {
            request_id,
            ok: false,
            unit: None,
            level: None,
            raw_claude_output: None,
            was_new_discovery: false,
            error: Some("sessionId is required.".to_string()),
        };
    }

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(value) => value,
        Err(error) => {
            return DiscoverWorktreeUnitResponse {
                request_id,
                ok: false,
                unit: None,
                level: None,
                raw_claude_output: None,
                was_new_discovery: false,
                error: Some(error),
            };
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
            return DiscoverWorktreeUnitResponse {
                request_id,
                ok: false,
                unit: None,
                level: None,
                raw_claude_output: None,
                was_new_discovery: false,
                error: Some(error),
            };
        }
    };

    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    let parsed_meta = read_workspace_meta_file(&workspace_json).ok();
    let effective_root = parsed_meta
        .as_ref()
        .map(|meta| effective_workspace_root(&workspace_root, meta))
        .unwrap_or_else(|| workspace_root.clone());
    let cwd = {
        let candidate = effective_root.join(".worktrees").join(worktree);
        if candidate.is_dir() {
            candidate
        } else {
            effective_root
        }
    };

    let resolved_session_id = match resolve_existing_claude_session_id(&cwd, session_id) {
        Some(value) => value,
        None => {
            return DiscoverWorktreeUnitResponse {
                request_id,
                ok: false,
                unit: None,
                level: None,
                raw_claude_output: None,
                was_new_discovery: false,
                error: Some("No Claude session for this worktree.".to_string()),
            };
        }
    };

    let claude_bin = resolve_claude_code_bin();
    eprintln!(
        "[groove-discover] running claude --resume {} (stored={}) -p '...' --output-format text in {}",
        resolved_session_id,
        session_id,
        cwd.display(),
    );

    let output = Command::new(&claude_bin)
        .args([
            "--resume",
            &resolved_session_id,
            "-p",
            DISCOVER_PROMPT,
            "--output-format",
            "text",
        ])
        .current_dir(&cwd)
        .output();

    let raw = match output {
        Ok(out) if out.status.success() => {
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        }
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return DiscoverWorktreeUnitResponse {
                request_id,
                ok: false,
                unit: None,
                level: None,
                raw_claude_output: Some(if stdout.is_empty() { stderr } else { stdout }),
                was_new_discovery: false,
                error: Some(format!(
                    "Claude exited with status {:?}",
                    out.status.code(),
                )),
            };
        }
        Err(error) => {
            return DiscoverWorktreeUnitResponse {
                request_id,
                ok: false,
                unit: None,
                level: None,
                raw_claude_output: None,
                was_new_discovery: false,
                error: Some(format!("Failed to spawn claude: {error}")),
            };
        }
    };

    let level = parse_claude_difficulty(&raw);
    eprintln!(
        "[groove-discover] worktree={} raw={:?} parsed_level={}",
        worktree, raw, level,
    );

    // Read the freshest meta, roll the unit at the discovered level, and
    // persist the unit on the worktree's record.
    let mut meta = match read_workspace_meta_file(&workspace_json) {
        Ok(meta) => meta,
        Err(error) => {
            return DiscoverWorktreeUnitResponse {
                request_id,
                ok: false,
                unit: None,
                level: Some(level),
                raw_claude_output: Some(raw),
                was_new_discovery: false,
                error: Some(error),
            };
        }
    };

    let unit = roll_worktree_unit_with_level(level);

    // If a new bug, register it in the workspace's `known_bugs` bestiary.
    let was_new_discovery = unit.kind == WorktreeUnitKind::Bug
        && !unit.name.is_empty()
        && !meta.known_bugs.contains(&unit.name);
    if was_new_discovery {
        meta.known_bugs.push(unit.name.clone());
    }

    let record = meta
        .worktree_records
        .entry(worktree.to_string())
        .or_insert_with(|| WorktreeRecord {
            id: Uuid::new_v4().to_string(),
            created_at: now_iso(),
            claude_session_started: false,
            state: default_worktree_state(),
            unit: None,
            summaries: Vec::new(),
            comments: Vec::new(),
        });
    record.unit = Some(unit.clone());
    meta.updated_at = now_iso();

    if let Err(error) = write_workspace_meta_file(&workspace_json, &meta) {
        return DiscoverWorktreeUnitResponse {
            request_id,
            ok: false,
            unit: None,
            level: Some(level),
            raw_claude_output: Some(raw),
            was_new_discovery: false,
            error: Some(error),
        };
    }

    let patched_unit = unit.clone();
    let patched_worktree = worktree.to_string();
    let patched_updated_at = meta.updated_at.clone();
    patch_workspace_context_cache(&app, &workspace_root, |response| {
        let Some(meta) = response.workspace_meta.as_mut() else {
            return;
        };
        if let Some(record) = meta.worktree_records.get_mut(&patched_worktree) {
            record.unit = Some(patched_unit);
        }
        meta.updated_at = patched_updated_at;
    });

    DiscoverWorktreeUnitResponse {
        request_id,
        ok: true,
        unit: Some(unit),
        level: Some(level),
        raw_claude_output: Some(raw),
        was_new_discovery,
        error: None,
    }
}
