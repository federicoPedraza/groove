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

