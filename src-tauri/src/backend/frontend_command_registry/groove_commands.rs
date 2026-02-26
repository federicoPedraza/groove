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

