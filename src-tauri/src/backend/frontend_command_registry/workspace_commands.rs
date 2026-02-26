#[tauri::command]
fn workspace_pick_and_open(app: AppHandle) -> WorkspaceContextResponse {
    let request_id = request_id();
    let previous_workspace_root = read_persisted_active_workspace_root(&app).ok().flatten();
    let picked = rfd::FileDialog::new().pick_folder();
    let Some(selected) = picked else {
        return WorkspaceContextResponse {
            request_id,
            ok: false,
            workspace_root: None,
            repository_remote_url: None,
            workspace_meta: None,
            workspace_message: None,
            has_worktrees_directory: None,
            rows: Vec::new(),
            cancelled: Some(true),
            error: None,
        };
    };

    if let Err(error) = ensure_git_repository_root(&selected) {
        return WorkspaceContextResponse {
            request_id,
            ok: false,
            workspace_root: Some(selected.display().to_string()),
            repository_remote_url: None,
            workspace_meta: None,
            workspace_message: None,
            has_worktrees_directory: None,
            rows: Vec::new(),
            cancelled: None,
            error: Some(error),
        };
    }

    let response = build_workspace_context(&app, &selected, request_id.clone(), true);
    if response.ok {
        let next_workspace_root = response.workspace_root.as_deref();
        if previous_workspace_root.as_deref() != next_workspace_root {
            emit_workspace_ready_event(&app, &request_id, next_workspace_root, "connection");
        }
    }

    response
}

#[tauri::command]
fn workspace_open(app: AppHandle, workspace_root: String) -> WorkspaceContextResponse {
    let request_id = request_id();
    let previous_workspace_root = read_persisted_active_workspace_root(&app).ok().flatten();
    let root = match validate_workspace_root_path(&workspace_root) {
        Ok(root) => root,
        Err(error) => {
            return WorkspaceContextResponse {
                request_id,
                ok: false,
                workspace_root: None,
                repository_remote_url: None,
                workspace_meta: None,
                workspace_message: None,
                has_worktrees_directory: None,
                rows: Vec::new(),
                cancelled: None,
                error: Some(error),
            }
        }
    };

    if let Some(cached) = try_cached_workspace_context(&app, &root, &request_id) {
        if previous_workspace_root.as_deref() != cached.workspace_root.as_deref() {
            if let Err(error) = persist_active_workspace_root(&app, &root) {
                return WorkspaceContextResponse {
                    request_id,
                    ok: false,
                    workspace_root: Some(root.display().to_string()),
                    repository_remote_url: cached.repository_remote_url,
                    workspace_meta: cached.workspace_meta,
                    workspace_message: cached.workspace_message,
                    has_worktrees_directory: cached.has_worktrees_directory,
                    rows: cached.rows,
                    cancelled: None,
                    error: Some(error),
                };
            }
            emit_workspace_ready_event(
                &app,
                &request_id,
                cached.workspace_root.as_deref(),
                "connection",
            );
        }
        return cached;
    }

    if let Err(error) = ensure_git_repository_root(&root) {
        return WorkspaceContextResponse {
            request_id,
            ok: false,
            workspace_root: None,
            repository_remote_url: None,
            workspace_meta: None,
            workspace_message: None,
            has_worktrees_directory: None,
            rows: Vec::new(),
            cancelled: None,
            error: Some(error),
        };
    }

    let response = build_workspace_context(&app, &root, request_id.clone(), true);
    if response.ok {
        let next_workspace_root = response.workspace_root.as_deref();
        if previous_workspace_root.as_deref() != next_workspace_root {
            emit_workspace_ready_event(&app, &request_id, next_workspace_root, "connection");
        }
    }

    response
}

#[tauri::command]
fn workspace_get_active(app: AppHandle) -> WorkspaceContextResponse {
    let started_at = Instant::now();
    let request_id = request_id();
    let mut telemetry_enabled = true;
    let persisted_root = match read_persisted_active_workspace_root(&app) {
        Ok(root) => root,
        Err(error) => {
            let response = WorkspaceContextResponse {
                request_id,
                ok: false,
                workspace_root: None,
                repository_remote_url: None,
                workspace_meta: None,
                workspace_message: None,
                has_worktrees_directory: None,
                rows: Vec::new(),
                cancelled: None,
                error: Some(error),
            };
            log_backend_timing(
                telemetry_enabled,
                "workspace_get_active",
                started_at.elapsed(),
                "outcome=read-state-error",
            );
            return response;
        }
    };

    let response = if let Some(persisted_root) = persisted_root {
        match validate_workspace_root_path(&persisted_root) {
            Ok(root) => {
                telemetry_enabled = telemetry_enabled_for_app(&app);
                if let Some(cached) = try_cached_workspace_context(&app, &root, &request_id) {
                    cached
                } else if let Err(error) = ensure_git_repository_root(&root) {
                    let _ = clear_persisted_active_workspace_root(&app);
                    WorkspaceContextResponse {
                        request_id,
                        ok: false,
                        workspace_root: Some(persisted_root),
                        repository_remote_url: None,
                        workspace_meta: None,
                        workspace_message: None,
                        has_worktrees_directory: None,
                        rows: Vec::new(),
                        cancelled: None,
                        error: Some(error),
                    }
                } else {
                    build_workspace_context(&app, &root, request_id, false)
                }
            }
            Err(error) => {
                let _ = clear_persisted_active_workspace_root(&app);
                WorkspaceContextResponse {
                    request_id,
                    ok: false,
                    workspace_root: Some(persisted_root),
                    repository_remote_url: None,
                    workspace_meta: None,
                    workspace_message: None,
                    has_worktrees_directory: None,
                    rows: Vec::new(),
                    cancelled: None,
                    error: Some(error),
                }
            }
        }
    } else {
        WorkspaceContextResponse {
            request_id,
            ok: true,
            workspace_root: None,
            repository_remote_url: None,
            workspace_meta: None,
            workspace_message: None,
            has_worktrees_directory: None,
            rows: Vec::new(),
            cancelled: None,
            error: None,
        }
    };

    log_backend_timing(
        telemetry_enabled,
        "workspace_get_active",
        started_at.elapsed(),
        if response.ok {
            "outcome=ok"
        } else {
            "outcome=error"
        },
    );
    response
}

#[tauri::command]
fn workspace_clear_active(
    app: AppHandle,
    testing_state: State<TestingEnvironmentState>,
    terminal_state: State<GrooveTerminalState>,
) -> WorkspaceContextResponse {
    let request_id = request_id();
    let persisted_workspace_root = read_persisted_active_workspace_root(&app).ok().flatten();
    let had_active_workspace = persisted_workspace_root.is_some();

    if let Some(workspace_root) = persisted_workspace_root.as_deref() {
        let workspace_root_key = workspace_root_storage_key(Path::new(workspace_root));
        let sessions_to_close = match terminal_state.inner.lock() {
            Ok(mut sessions_state) => {
                drain_groove_terminal_sessions(&mut sessions_state, Some(workspace_root_key.as_str()))
            }
            Err(_) => Vec::new(),
        };
        close_groove_terminal_sessions_best_effort(sessions_to_close);
    }

    if let Ok(mut runtime) = testing_state.runtime.lock() {
        if ensure_testing_runtime_loaded(&app, &mut runtime).is_ok() {
            let instances = runtime.persisted.running_instances.clone();
            for instance in instances {
                let _ = stop_running_testing_instance_for_worktree(
                    &mut runtime,
                    &instance.workspace_root,
                    &instance.worktree,
                );
            }
            runtime.persisted = PersistedTestingEnvironmentState::default();
            runtime.loaded = true;
            let _ = clear_persisted_testing_environment_state(&app);
        }
    }

    match clear_persisted_active_workspace_root(&app) {
        Ok(_) => {
            clear_workspace_context_cache(&app);
            clear_groove_list_cache(&app);
            if had_active_workspace {
                emit_workspace_ready_event(&app, &request_id, None, "connection");
            }

            WorkspaceContextResponse {
                request_id,
                ok: true,
                workspace_root: None,
                repository_remote_url: None,
                workspace_meta: None,
                workspace_message: None,
                has_worktrees_directory: None,
                rows: Vec::new(),
                cancelled: None,
                error: None,
            }
        }
        Err(error) => WorkspaceContextResponse {
            request_id,
            ok: false,
            workspace_root: None,
            repository_remote_url: None,
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
fn workspace_gitignore_sanity_check(app: AppHandle) -> WorkspaceGitignoreSanityResponse {
    let request_id = request_id();
    let workspace_root = match active_workspace_root_from_state(&app) {
        Ok(workspace_root) => workspace_root,
        Err(error) => {
            return WorkspaceGitignoreSanityResponse {
                request_id,
                ok: false,
                workspace_root: None,
                is_applicable: false,
                has_groove_entry: false,
                has_workspace_entry: false,
                missing_entries: Vec::new(),
                patched: None,
                error: Some(error),
            }
        }
    };

    let gitignore_path = workspace_root.join(".gitignore");
    if !path_is_file(&gitignore_path) {
        return WorkspaceGitignoreSanityResponse {
            request_id,
            ok: true,
            workspace_root: Some(workspace_root.display().to_string()),
            is_applicable: false,
            has_groove_entry: false,
            has_workspace_entry: false,
            missing_entries: Vec::new(),
            patched: None,
            error: None,
        };
    }

    let content = match fs::read_to_string(&gitignore_path) {
        Ok(content) => content,
        Err(error) => {
            return WorkspaceGitignoreSanityResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                is_applicable: true,
                has_groove_entry: false,
                has_workspace_entry: false,
                missing_entries: Vec::new(),
                patched: None,
                error: Some(format!(
                    "Failed to read {}: {error}",
                    gitignore_path.display()
                )),
            }
        }
    };

    let (has_groove_entry, has_workspace_entry, _, missing_entries) = collect_gitignore_sanity(&content);

    WorkspaceGitignoreSanityResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        is_applicable: true,
        has_groove_entry,
        has_workspace_entry,
        missing_entries,
        patched: None,
        error: None,
    }
}

#[tauri::command]
fn workspace_gitignore_sanity_apply(app: AppHandle) -> WorkspaceGitignoreSanityResponse {
    let request_id = request_id();
    let workspace_root = match active_workspace_root_from_state(&app) {
        Ok(workspace_root) => workspace_root,
        Err(error) => {
            return WorkspaceGitignoreSanityResponse {
                request_id,
                ok: false,
                workspace_root: None,
                is_applicable: false,
                has_groove_entry: false,
                has_workspace_entry: false,
                missing_entries: Vec::new(),
                patched: Some(false),
                error: Some(error),
            }
        }
    };

    let gitignore_path = workspace_root.join(".gitignore");
    if !path_is_file(&gitignore_path) {
        return WorkspaceGitignoreSanityResponse {
            request_id,
            ok: true,
            workspace_root: Some(workspace_root.display().to_string()),
            is_applicable: false,
            has_groove_entry: false,
            has_workspace_entry: false,
            missing_entries: Vec::new(),
            patched: Some(false),
            error: None,
        };
    }

    let content = match fs::read_to_string(&gitignore_path) {
        Ok(content) => content,
        Err(error) => {
            return WorkspaceGitignoreSanityResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                is_applicable: true,
                has_groove_entry: false,
                has_workspace_entry: false,
                missing_entries: Vec::new(),
                patched: Some(false),
                error: Some(format!(
                    "Failed to read {}: {error}",
                    gitignore_path.display()
                )),
            }
        }
    };

    let (has_groove_entry, has_workspace_entry, has_groove_comment, missing_entries) =
        collect_gitignore_sanity(&content);

    if missing_entries.is_empty() {
        return WorkspaceGitignoreSanityResponse {
            request_id,
            ok: true,
            workspace_root: Some(workspace_root.display().to_string()),
            is_applicable: true,
            has_groove_entry,
            has_workspace_entry,
            missing_entries,
            patched: Some(false),
            error: None,
        };
    }

    let newline = newline_for_content(&content);
    let mut prefix_lines = Vec::new();
    if !has_groove_comment {
        prefix_lines.push(GITIGNORE_GROOVE_COMMENT.to_string());
    }
    prefix_lines.extend(missing_entries.iter().cloned());

    let mut next_content = prefix_lines.join(newline);
    if content.is_empty() {
        next_content.push_str(newline);
    } else {
        next_content.push_str(newline);
        next_content.push_str(newline);
        next_content.push_str(&content);
    }

    if let Err(error) = fs::write(&gitignore_path, next_content) {
        return WorkspaceGitignoreSanityResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            is_applicable: true,
            has_groove_entry,
            has_workspace_entry,
            missing_entries,
            patched: Some(false),
            error: Some(format!(
                "Failed to write {}: {error}",
                gitignore_path.display()
            )),
        };
    }

    WorkspaceGitignoreSanityResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        is_applicable: true,
        has_groove_entry: true,
        has_workspace_entry: true,
        missing_entries: Vec::new(),
        patched: Some(true),
        error: None,
    }
}

#[tauri::command]
fn global_settings_get(app: AppHandle) -> GlobalSettingsResponse {
    let request_id = request_id();
    match ensure_global_settings(&app) {
        Ok(global_settings) => GlobalSettingsResponse {
            request_id,
            ok: true,
            global_settings: Some(global_settings),
            error: None,
        },
        Err(error) => GlobalSettingsResponse {
            request_id,
            ok: false,
            global_settings: Some(default_global_settings()),
            error: Some(error),
        },
    }
}

#[tauri::command]
fn global_settings_update(
    app: AppHandle,
    payload: GlobalSettingsUpdatePayload,
) -> GlobalSettingsResponse {
    let request_id = request_id();
    let mut global_settings = match ensure_global_settings(&app) {
        Ok(value) => value,
        Err(error) => {
            return GlobalSettingsResponse {
                request_id,
                ok: false,
                global_settings: Some(default_global_settings()),
                error: Some(error),
            }
        }
    };

    if let Some(telemetry_enabled) = payload.telemetry_enabled {
        global_settings.telemetry_enabled = telemetry_enabled;
    }
    if let Some(disable_groove_loading_section) = payload.disable_groove_loading_section {
        global_settings.disable_groove_loading_section = disable_groove_loading_section;
    }
    if let Some(show_fps) = payload.show_fps {
        global_settings.show_fps = show_fps;
    }
    if let Some(always_show_diagnostics_sidebar) = payload.always_show_diagnostics_sidebar {
        global_settings.always_show_diagnostics_sidebar = always_show_diagnostics_sidebar;
    }
    if let Some(periodic_rerender_enabled) = payload.periodic_rerender_enabled {
        global_settings.periodic_rerender_enabled = periodic_rerender_enabled;
    }
    if let Some(theme_mode) = payload.theme_mode.as_deref() {
        match normalize_theme_mode(theme_mode) {
            Ok(value) => {
                global_settings.theme_mode = value;
            }
            Err(error) => {
                return GlobalSettingsResponse {
                    request_id,
                    ok: false,
                    global_settings: Some(global_settings),
                    error: Some(error),
                }
            }
        }
    }
    let settings_file = match global_settings_file(&app) {
        Ok(path) => path,
        Err(error) => {
            return GlobalSettingsResponse {
                request_id,
                ok: false,
                global_settings: Some(global_settings),
                error: Some(error),
            }
        }
    };

    if let Err(error) = write_global_settings_file(&settings_file, &global_settings) {
        return GlobalSettingsResponse {
            request_id,
            ok: false,
            global_settings: Some(global_settings),
            error: Some(error),
        };
    }

    GlobalSettingsResponse {
        request_id,
        ok: true,
        global_settings: Some(global_settings),
        error: None,
    }
}

#[tauri::command]
fn workspace_update_terminal_settings(
    app: AppHandle,
    payload: WorkspaceTerminalSettingsPayload,
) -> WorkspaceTerminalSettingsResponse {
    let request_id = request_id();

    let default_terminal = match normalize_default_terminal(&payload.default_terminal) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                workspace_meta: None,
                error: Some(error),
            }
        }
    };

    let terminal_custom_command = payload
        .terminal_custom_command
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());

    if default_terminal == "custom" && terminal_custom_command.is_none() {
        return WorkspaceTerminalSettingsResponse {
            request_id,
            ok: false,
            workspace_root: None,
            workspace_meta: None,
            error: Some(
                "terminalCustomCommand is required when defaultTerminal is set to custom."
                    .to_string(),
            ),
        };
    }

    let persisted_root = match read_persisted_active_workspace_root(&app) {
        Ok(Some(value)) => value,
        Ok(None) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                workspace_meta: None,
                error: Some("No active workspace selected.".to_string()),
            }
        }
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                workspace_meta: None,
                error: Some(error),
            }
        }
    };

    let workspace_root = match validate_workspace_root_path(&persisted_root) {
        Ok(root) => root,
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: Some(persisted_root),
                workspace_meta: None,
                error: Some(error),
            }
        }
    };

    let (mut workspace_meta, _) = match ensure_workspace_meta(&workspace_root) {
        Ok(result) => result,
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                workspace_meta: None,
                error: Some(error),
            }
        }
    };

    workspace_meta.default_terminal = default_terminal;
    workspace_meta.terminal_custom_command = terminal_custom_command;
    if let Some(telemetry_enabled) = payload.telemetry_enabled {
        workspace_meta.telemetry_enabled = telemetry_enabled;
    }
    if let Some(disable_groove_loading_section) = payload.disable_groove_loading_section {
        workspace_meta.disable_groove_loading_section = disable_groove_loading_section;
    }
    if let Some(show_fps) = payload.show_fps {
        workspace_meta.show_fps = show_fps;
    }
    workspace_meta.updated_at = now_iso();

    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    if let Err(error) = write_workspace_meta_file(&workspace_json, &workspace_meta) {
        return WorkspaceTerminalSettingsResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            workspace_meta: None,
            error: Some(error),
        };
    }

    invalidate_workspace_context_cache(&app, &workspace_root);

    WorkspaceTerminalSettingsResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        workspace_meta: Some(workspace_meta),
        error: None,
    }
}

#[tauri::command]
fn workspace_update_commands_settings(
    app: AppHandle,
    payload: WorkspaceCommandSettingsPayload,
) -> WorkspaceTerminalSettingsResponse {
    let request_id = request_id();

    let play_groove_command = match normalize_play_groove_command(&payload.play_groove_command) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                workspace_meta: None,
                error: Some(error),
            }
        }
    };
    let testing_ports = normalize_testing_ports_from_u32(&payload.testing_ports);
    let open_terminal_at_worktree_command = match normalize_open_terminal_at_worktree_command(
        payload.open_terminal_at_worktree_command.as_deref(),
    ) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                workspace_meta: None,
                error: Some(error),
            }
        }
    };
    let run_local_command = match normalize_run_local_command(payload.run_local_command.as_deref())
    {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                workspace_meta: None,
                error: Some(error),
            }
        }
    };

    let persisted_root = match read_persisted_active_workspace_root(&app) {
        Ok(Some(value)) => value,
        Ok(None) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                workspace_meta: None,
                error: Some("No active workspace selected.".to_string()),
            }
        }
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                workspace_meta: None,
                error: Some(error),
            }
        }
    };

    let workspace_root = match validate_workspace_root_path(&persisted_root) {
        Ok(root) => root,
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: Some(persisted_root),
                workspace_meta: None,
                error: Some(error),
            }
        }
    };

    let (mut workspace_meta, _) = match ensure_workspace_meta(&workspace_root) {
        Ok(result) => result,
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                workspace_meta: None,
                error: Some(error),
            }
        }
    };

    workspace_meta.play_groove_command = play_groove_command;
    workspace_meta.testing_ports = testing_ports;
    workspace_meta.open_terminal_at_worktree_command = open_terminal_at_worktree_command;
    workspace_meta.run_local_command = run_local_command;
    workspace_meta.updated_at = now_iso();

    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    if let Err(error) = write_workspace_meta_file(&workspace_json, &workspace_meta) {
        return WorkspaceTerminalSettingsResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            workspace_meta: None,
            error: Some(error),
        };
    }

    invalidate_workspace_context_cache(&app, &workspace_root);

    WorkspaceTerminalSettingsResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        workspace_meta: Some(workspace_meta),
        error: None,
    }
}

#[tauri::command]
fn workspace_update_worktree_symlink_paths(
    app: AppHandle,
    payload: WorkspaceWorktreeSymlinkPathsPayload,
) -> WorkspaceTerminalSettingsResponse {
    let request_id = request_id();
    let worktree_symlink_paths = match validate_worktree_symlink_paths(&payload.worktree_symlink_paths)
    {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                workspace_meta: None,
                error: Some(error),
            }
        }
    };

    let persisted_root = match read_persisted_active_workspace_root(&app) {
        Ok(Some(value)) => value,
        Ok(None) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                workspace_meta: None,
                error: Some("No active workspace selected.".to_string()),
            }
        }
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                workspace_meta: None,
                error: Some(error),
            }
        }
    };

    let workspace_root = match validate_workspace_root_path(&persisted_root) {
        Ok(root) => root,
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: Some(persisted_root),
                workspace_meta: None,
                error: Some(error),
            }
        }
    };

    let (mut workspace_meta, _) = match ensure_workspace_meta(&workspace_root) {
        Ok(result) => result,
        Err(error) => {
            return WorkspaceTerminalSettingsResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                workspace_meta: None,
                error: Some(error),
            }
        }
    };

    workspace_meta.worktree_symlink_paths = worktree_symlink_paths;
    workspace_meta.updated_at = now_iso();

    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    if let Err(error) = write_workspace_meta_file(&workspace_json, &workspace_meta) {
        return WorkspaceTerminalSettingsResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            workspace_meta: None,
            error: Some(error),
        };
    }

    invalidate_workspace_context_cache(&app, &workspace_root);

    WorkspaceTerminalSettingsResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        workspace_meta: Some(workspace_meta),
        error: None,
    }
}

#[tauri::command]
fn workspace_list_symlink_entries(
    app: AppHandle,
    payload: WorkspaceBrowseEntriesPayload,
) -> WorkspaceBrowseEntriesResponse {
    let request_id = request_id();
    let relative_path = match normalize_browse_relative_path(payload.relative_path.as_deref()) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceBrowseEntriesResponse {
                request_id,
                ok: false,
                workspace_root: None,
                relative_path: String::new(),
                entries: Vec::new(),
                error: Some(error),
            }
        }
    };

    let persisted_root = match read_persisted_active_workspace_root(&app) {
        Ok(Some(value)) => value,
        Ok(None) => {
            return WorkspaceBrowseEntriesResponse {
                request_id,
                ok: false,
                workspace_root: None,
                relative_path,
                entries: Vec::new(),
                error: Some("No active workspace selected.".to_string()),
            }
        }
        Err(error) => {
            return WorkspaceBrowseEntriesResponse {
                request_id,
                ok: false,
                workspace_root: None,
                relative_path,
                entries: Vec::new(),
                error: Some(error),
            }
        }
    };

    let workspace_root = match validate_workspace_root_path(&persisted_root) {
        Ok(root) => root,
        Err(error) => {
            return WorkspaceBrowseEntriesResponse {
                request_id,
                ok: false,
                workspace_root: Some(persisted_root),
                relative_path,
                entries: Vec::new(),
                error: Some(error),
            }
        }
    };

    let browse_root = if relative_path.is_empty() {
        workspace_root.clone()
    } else {
        workspace_root.join(&relative_path)
    };
    if !path_is_directory(&browse_root) {
        return WorkspaceBrowseEntriesResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            relative_path,
            entries: Vec::new(),
            error: Some("Requested path is not a directory in this workspace.".to_string()),
        };
    }

    let mut entries = Vec::new();
    let read_dir = match fs::read_dir(&browse_root) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceBrowseEntriesResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                relative_path,
                entries: Vec::new(),
                error: Some(format!(
                    "Failed to read directory \"{}\": {error}",
                    browse_root.display()
                )),
            }
        }
    };

    for entry in read_dir {
        let entry = match entry {
            Ok(value) => value,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        if name.trim().is_empty() {
            continue;
        }

        if relative_path.is_empty() && is_restricted_worktree_symlink_path(&name) {
            continue;
        }

        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        let child_relative_path = if relative_path.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", relative_path, name)
        };

        entries.push(WorkspaceBrowseEntry {
            name,
            path: child_relative_path,
            is_dir: file_type.is_dir(),
        });
    }

    entries.sort_by(|left, right| {
        right
            .is_dir
            .cmp(&left.is_dir)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    WorkspaceBrowseEntriesResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        relative_path,
        entries,
        error: None,
    }
}

