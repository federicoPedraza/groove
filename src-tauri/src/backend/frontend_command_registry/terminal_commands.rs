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

