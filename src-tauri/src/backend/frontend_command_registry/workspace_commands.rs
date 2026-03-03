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
            Ok(mut sessions_state) => drain_groove_terminal_sessions(
                &mut sessions_state,
                Some(workspace_root_key.as_str()),
            ),
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
                patched_worktree: None,
                play_started: None,
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
            patched_worktree: None,
            play_started: None,
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
                patched_worktree: None,
                play_started: None,
                error: Some(format!(
                    "Failed to read {}: {error}",
                    gitignore_path.display()
                )),
            }
        }
    };

    let (has_groove_entry, has_workspace_entry, _, missing_entries) =
        collect_gitignore_sanity(&content);

    WorkspaceGitignoreSanityResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        is_applicable: true,
        has_groove_entry,
        has_workspace_entry,
        missing_entries,
        patched: None,
        patched_worktree: None,
        play_started: None,
        error: None,
    }
}

#[tauri::command]
fn workspace_gitignore_sanity_apply(
    app: AppHandle,
    terminal_state: State<GrooveTerminalState>,
) -> WorkspaceGitignoreSanityResponse {
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
                patched_worktree: None,
                play_started: Some(false),
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
            patched_worktree: None,
            play_started: Some(false),
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
                patched_worktree: None,
                play_started: Some(false),
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
            patched_worktree: None,
            play_started: Some(false),
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

    let version = env!("CARGO_PKG_VERSION");
    let random_suffix = (Uuid::new_v4().as_u128() % 1000) as u16;
    let patch_worktree_branch = format!("groove/patch.{version}-{random_suffix:03}");
    let patch_worktree = patch_worktree_branch.replace('/', "_");

    let create_result = run_command(
        &groove_binary_path(&app),
        &["create".to_string(), patch_worktree_branch],
        &workspace_root,
    );
    if create_result.exit_code != Some(0) || create_result.error.is_some() {
        return WorkspaceGitignoreSanityResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            is_applicable: true,
            has_groove_entry,
            has_workspace_entry,
            missing_entries,
            patched: Some(false),
            patched_worktree: Some(patch_worktree),
            play_started: Some(false),
            error: create_result.error.or_else(|| {
                Some("Failed to create patch worktree for .gitignore sanity apply.".to_string())
            }),
        };
    }

    let patch_worktree_path = match resolve_patch_worktree_path(&workspace_root, &patch_worktree) {
        Ok(path) => path,
        Err(error) => {
            return WorkspaceGitignoreSanityResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                is_applicable: true,
                has_groove_entry,
                has_workspace_entry,
                missing_entries,
                patched: Some(false),
                patched_worktree: Some(patch_worktree),
                play_started: Some(false),
                error: Some(error),
            }
        }
    };

    let worktree_gitignore_path = patch_worktree_path.join(".gitignore");
    if let Err(error) = fs::write(&worktree_gitignore_path, next_content) {
        return WorkspaceGitignoreSanityResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            is_applicable: true,
            has_groove_entry,
            has_workspace_entry,
            missing_entries,
            patched: Some(false),
            patched_worktree: Some(patch_worktree),
            play_started: Some(false),
            error: Some(format!(
                "Failed to write {}: {error}",
                worktree_gitignore_path.display()
            )),
        };
    }

    let play_result = groove_restore(
        app,
        terminal_state,
        GrooveRestorePayload {
            workspace_root: Some(workspace_root.display().to_string()),
            root_name: None,
            known_worktrees: vec![patch_worktree.clone()],
            workspace_meta: None,
            worktree: patch_worktree.clone(),
            action: Some("go".to_string()),
            target: Some(patch_worktree.clone()),
            dir: None,
            opencode_log_file: None,
        },
    );
    if !play_result.ok {
        return WorkspaceGitignoreSanityResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            is_applicable: true,
            has_groove_entry: true,
            has_workspace_entry: true,
            missing_entries: Vec::new(),
            patched: Some(true),
            patched_worktree: Some(patch_worktree),
            play_started: Some(false),
            error: Some(
                play_result.error.unwrap_or_else(|| {
                    "Failed to launch Play Groove for patch worktree.".to_string()
                }),
            ),
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
        patched_worktree: Some(patch_worktree),
        play_started: Some(true),
        error: None,
    }
}

fn resolve_patch_worktree_path(
    workspace_root: &Path,
    patch_worktree: &str,
) -> Result<PathBuf, String> {
    let candidate_worktrees = patch_worktree_path_candidates(patch_worktree);
    let candidate_branches = patch_worktree_branch_candidates(patch_worktree);

    let mut local_resolution_errors = Vec::new();
    for candidate in &candidate_worktrees {
        match ensure_worktree_in_dir(workspace_root, candidate, ".worktrees") {
            Ok(path) => return Ok(path),
            Err(error) => local_resolution_errors.push(format!(
                "{}/.worktrees/{candidate}: {error}",
                workspace_root.display()
            )),
        }
    }

    let listed_worktrees = list_git_worktrees_by_branch(workspace_root).map_err(|error| {
        format!(
            "Failed to locate patch worktree \"{}\" under default local paths ({}) and failed to query `git worktree list --porcelain`: {}",
            patch_worktree,
            local_resolution_errors.join("; "),
            error
        )
    })?;

    for (branch, path) in listed_worktrees {
        let branch_matches = branch
            .as_deref()
            .map(|value| {
                candidate_branches
                    .iter()
                    .any(|candidate| candidate == value)
            })
            .unwrap_or(false);
        let path_matches = path
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| {
                candidate_worktrees
                    .iter()
                    .any(|candidate| candidate == value)
            })
            .unwrap_or(false);
        if !branch_matches && !path_matches {
            continue;
        }

        if path_is_directory(&path) {
            return Ok(path);
        }

        return Err(format!(
            "`git worktree list --porcelain` resolved patch worktree \"{}\" to \"{}\", but that directory is not accessible.",
            patch_worktree,
            path.display()
        ));
    }

    Err(format!(
        "Failed to locate patch worktree for branch \"{}\". Checked default local paths ({}) and scanned `git worktree list --porcelain`, but no entry matched refs/heads/{}.",
        patch_worktree,
        local_resolution_errors.join("; "),
        patch_worktree
    ))
}

fn patch_worktree_path_candidates(value: &str) -> Vec<String> {
    let mut candidates = vec![value.to_string()];
    let stamped = value.replace('/', "_");
    if stamped != value {
        candidates.push(stamped);
    }
    candidates
}

fn patch_worktree_branch_candidates(value: &str) -> Vec<String> {
    let mut candidates = vec![value.to_string()];
    let stamped = value.replace('/', "_");
    if stamped != value {
        candidates.push(stamped.clone());
    }
    let slashed = value.replace('_', "/");
    if slashed != value && slashed != stamped {
        candidates.push(slashed);
    }
    candidates
}

#[cfg(test)]
mod workspace_commands_tests {
    use super::*;

    #[test]
    fn patch_worktree_candidates_cover_branch_and_path_forms() {
        let path_candidates = patch_worktree_path_candidates("groove/patch.1");
        assert_eq!(
            path_candidates,
            vec!["groove/patch.1".to_string(), "groove_patch.1".to_string()]
        );

        let branch_candidates = patch_worktree_branch_candidates("groove_patch.1");
        assert_eq!(
            branch_candidates,
            vec!["groove_patch.1".to_string(), "groove/patch.1".to_string()]
        );
    }
}

fn list_git_worktrees_by_branch(
    workspace_root: &Path,
) -> Result<Vec<(Option<String>, PathBuf)>, String> {
    let result = run_git_command_at_path(workspace_root, &["worktree", "list", "--porcelain"]);
    if result.exit_code != Some(0) || result.error.is_some() {
        let mut details = Vec::new();
        if let Some(error) = result.error.as_ref() {
            details.push(error.clone());
        }
        if let Some(snippet) = command_output_snippet(&result) {
            details.push(snippet);
        }
        if details.is_empty() {
            details.push("unknown failure".to_string());
        }
        return Err(details.join("; "));
    }

    let mut entries = Vec::new();
    let mut current_branch = None;
    let mut current_path = None;

    for raw_line in result.stdout.lines().chain(std::iter::once("")) {
        let line = raw_line.trim();
        if line.is_empty() {
            if let Some(path) = current_path.take() {
                entries.push((current_branch.take(), path));
            }
            continue;
        }

        if let Some(value) = line.strip_prefix("worktree ") {
            current_path = Some(PathBuf::from(value.trim()));
            continue;
        }

        if let Some(value) = line.strip_prefix("branch ") {
            let normalized = value
                .trim()
                .strip_prefix("refs/heads/")
                .unwrap_or(value.trim())
                .to_string();
            current_branch = Some(normalized);
        }
    }

    Ok(entries)
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
    if let Some(keyboard_shortcut_leader) = payload.keyboard_shortcut_leader.as_deref() {
        global_settings.keyboard_shortcut_leader = normalize_shortcut_key(
            keyboard_shortcut_leader,
            &default_keyboard_shortcut_leader(),
        );
    }
    if let Some(keyboard_leader_bindings) = payload.keyboard_leader_bindings.as_ref() {
        global_settings.keyboard_leader_bindings =
            normalize_keyboard_leader_bindings(keyboard_leader_bindings);
    }
    if let Some(opencode_settings) = payload.opencode_settings.as_ref() {
        global_settings.opencode_settings = normalize_opencode_settings(&OpencodeSettings {
            enabled: opencode_settings.enabled,
            default_model: opencode_settings.default_model.clone(),
        });
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
    let worktree_symlink_paths =
        match validate_worktree_symlink_paths(&payload.worktree_symlink_paths) {
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

fn active_workspace_meta(app: &AppHandle) -> Result<(PathBuf, WorkspaceMeta), String> {
    let workspace_root = active_workspace_root_from_state(app)?;
    let (workspace_meta, _) = ensure_workspace_meta(&workspace_root)?;
    Ok((workspace_root, workspace_meta))
}

fn persist_workspace_meta_update(
    app: &AppHandle,
    workspace_root: &Path,
    workspace_meta: &WorkspaceMeta,
) -> Result<(), String> {
    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    write_workspace_meta_file(&workspace_json, workspace_meta)?;
    invalidate_workspace_context_cache(app, workspace_root);
    Ok(())
}

#[tauri::command]
fn consellour_get_settings(app: AppHandle) -> ConsellourSettingsResponse {
    let request_id = request_id();
    let (workspace_root, workspace_meta) = match active_workspace_meta(&app) {
        Ok(value) => value,
        Err(error) => {
            return ConsellourSettingsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                settings: None,
                error: Some(error),
            }
        }
    };

    ConsellourSettingsResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        settings: Some(workspace_meta.consellour_settings),
        error: None,
    }
}

#[tauri::command]
fn consellour_update_settings(
    app: AppHandle,
    payload: ConsellourSettingsUpdatePayload,
) -> ConsellourSettingsResponse {
    let request_id = request_id();
    let (workspace_root, mut workspace_meta) = match active_workspace_meta(&app) {
        Ok(value) => value,
        Err(error) => {
            return ConsellourSettingsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                settings: None,
                error: Some(error),
            }
        }
    };

    if let Some(api_key) = payload.openai_api_key.as_deref() {
        let normalized_api_key = match normalize_openai_api_key(Some(api_key)) {
            Ok(value) => value,
            Err(error) => {
                return ConsellourSettingsResponse {
                    request_id,
                    ok: false,
                    workspace_root: Some(workspace_root.display().to_string()),
                    settings: Some(workspace_meta.consellour_settings),
                    error: Some(error),
                }
            }
        };
        workspace_meta.consellour_settings.openai_api_key = normalized_api_key;
    }

    if let Some(model) = payload.model.as_deref() {
        let normalized_model = match normalize_consellour_model(model) {
            Ok(value) => value,
            Err(error) => {
                return ConsellourSettingsResponse {
                    request_id,
                    ok: false,
                    workspace_root: Some(workspace_root.display().to_string()),
                    settings: Some(workspace_meta.consellour_settings),
                    error: Some(error),
                }
            }
        };
        workspace_meta.consellour_settings.model = normalized_model;
    }

    if let Some(reasoning_level) = payload.reasoning_level.as_deref() {
        let normalized_reasoning_level = match normalize_consellour_reasoning_level(reasoning_level)
        {
            Ok(value) => value,
            Err(error) => {
                return ConsellourSettingsResponse {
                    request_id,
                    ok: false,
                    workspace_root: Some(workspace_root.display().to_string()),
                    settings: Some(workspace_meta.consellour_settings),
                    error: Some(error),
                }
            }
        };
        workspace_meta.consellour_settings.reasoning_level = normalized_reasoning_level;
    }

    workspace_meta.consellour_settings.updated_at = now_iso();
    workspace_meta.updated_at = now_iso();

    if let Err(error) = persist_workspace_meta_update(&app, &workspace_root, &workspace_meta) {
        return ConsellourSettingsResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            settings: Some(workspace_meta.consellour_settings),
            error: Some(error),
        };
    }

    ConsellourSettingsResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        settings: Some(workspace_meta.consellour_settings),
        error: None,
    }
}

#[tauri::command]
fn tasks_list(app: AppHandle) -> WorkspaceTasksResponse {
    let request_id = request_id();
    let (workspace_root, workspace_meta) = match active_workspace_meta(&app) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceTasksResponse {
                request_id,
                ok: false,
                workspace_root: None,
                tasks: Vec::new(),
                error: Some(error),
            }
        }
    };

    WorkspaceTasksResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        tasks: workspace_meta.tasks,
        error: None,
    }
}

#[tauri::command]
fn workspace_set_worktree_task_assignment(
    app: AppHandle,
    payload: WorkspaceSetWorktreeTaskAssignmentPayload,
) -> WorkspaceContextResponse {
    let request_id = request_id();
    let (workspace_root, mut workspace_meta) = match active_workspace_meta(&app) {
        Ok(value) => value,
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

    let normalized_worktree = payload.worktree.trim();
    if normalized_worktree.is_empty() {
        return WorkspaceContextResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            repository_remote_url: None,
            workspace_meta: Some(workspace_meta),
            workspace_message: None,
            has_worktrees_directory: None,
            rows: Vec::new(),
            cancelled: None,
            error: Some("worktree must be a non-empty string.".to_string()),
        };
    }

    let normalized_task_id = payload
        .task_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());

    if let Some(task_id) = normalized_task_id.as_deref() {
        let has_task = workspace_meta.tasks.iter().any(|task| task.id == task_id);
        if !has_task {
            return WorkspaceContextResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                repository_remote_url: None,
                workspace_meta: Some(workspace_meta),
                workspace_message: None,
                has_worktrees_directory: None,
                rows: Vec::new(),
                cancelled: None,
                error: Some("Task not found for the provided id.".to_string()),
            };
        }
    }

    let previous_task_id = workspace_meta
        .worktree_task_assignments
        .get(normalized_worktree)
        .cloned();
    if previous_task_id == normalized_task_id {
        return build_workspace_context(&app, &workspace_root, request_id, false);
    }

    match normalized_task_id {
        Some(task_id) => {
            workspace_meta
                .worktree_task_assignments
                .insert(normalized_worktree.to_string(), task_id);
        }
        None => {
            workspace_meta
                .worktree_task_assignments
                .remove(normalized_worktree);
        }
    }

    workspace_meta.updated_at = now_iso();
    if let Err(error) = persist_workspace_meta_update(&app, &workspace_root, &workspace_meta) {
        return WorkspaceContextResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            repository_remote_url: None,
            workspace_meta: Some(workspace_meta),
            workspace_message: None,
            has_worktrees_directory: None,
            rows: Vec::new(),
            cancelled: None,
            error: Some(error),
        };
    }

    let _ = app.emit(
        "workspace-change",
        serde_json::json!({
            "workspaceRoot": workspace_root.display().to_string(),
            "kind": "metadata",
            "source": ".groove/workspace.json"
        }),
    );

    build_workspace_context(&app, &workspace_root, request_id, false)
}

#[tauri::command]
fn consellour_get_task(
    app: AppHandle,
    payload: WorkspaceTaskQueryPayload,
) -> WorkspaceTaskResponse {
    let request_id = request_id();
    let (workspace_root, workspace_meta) = match active_workspace_meta(&app) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceTaskResponse {
                request_id,
                ok: false,
                workspace_root: None,
                task: None,
                error: Some(error),
            }
        }
    };

    let title_query = normalize_optional_query(payload.title_query.as_deref());
    let description_query = normalize_optional_query(payload.description_query.as_deref());
    if title_query.is_none() && description_query.is_none() {
        return WorkspaceTaskResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            task: None,
            error: Some("Provide titleQuery and/or descriptionQuery to find a task.".to_string()),
        };
    }

    let matched_task = workspace_meta
        .tasks
        .iter()
        .find(|task| task_matches_query(task, title_query.as_deref(), description_query.as_deref()))
        .cloned();

    WorkspaceTaskResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        task: matched_task,
        error: None,
    }
}

#[tauri::command]
fn consellour_get_recommended_task(app: AppHandle) -> WorkspaceTaskResponse {
    let request_id = request_id();
    let (workspace_root, workspace_meta) = match active_workspace_meta(&app) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceTaskResponse {
                request_id,
                ok: false,
                workspace_root: None,
                task: None,
                error: Some(error),
            }
        }
    };

    let mut tasks = workspace_meta.tasks;
    tasks.sort_by(|left, right| {
        task_priority_rank(&right.consellour_priority)
            .cmp(&task_priority_rank(&left.consellour_priority))
            .then_with(|| left.last_interacted_at.cmp(&right.last_interacted_at))
            .then_with(|| left.created_at.cmp(&right.created_at))
    });

    WorkspaceTaskResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        task: tasks.into_iter().next(),
        error: None,
    }
}

#[tauri::command]
fn consellour_tool_create_task(
    app: AppHandle,
    payload: ConsellourToolCreateTaskPayload,
) -> WorkspaceTaskResponse {
    let request_id = request_id();
    let (workspace_root, mut workspace_meta) = match active_workspace_meta(&app) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceTaskResponse {
                request_id,
                ok: false,
                workspace_root: None,
                task: None,
                error: Some(error),
            }
        }
    };

    let title = match normalize_task_title(&payload.title) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceTaskResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                task: None,
                error: Some(error),
            }
        }
    };
    let description = match normalize_task_description(&payload.description) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceTaskResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                task: None,
                error: Some(error),
            }
        }
    };
    let external_id = match normalize_optional_external_id(payload.external_id.as_deref()) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceTaskResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                task: None,
                error: Some(error),
            }
        }
    };
    let external_url = match normalize_optional_external_url(payload.external_url.as_deref()) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceTaskResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                task: None,
                error: Some(error),
            }
        }
    };

    let now = now_iso();
    let task = WorkspaceTask {
        id: Uuid::new_v4().to_string(),
        title,
        description,
        priority: payload.priority,
        consellour_priority: payload.consellour_priority,
        created_at: now.clone(),
        updated_at: now.clone(),
        last_interacted_at: now,
        origin: payload.origin.unwrap_or(TaskOrigin::ConsellourTool),
        external_id,
        external_url,
        pr: Vec::new(),
    };

    workspace_meta.tasks.push(task.clone());
    workspace_meta.updated_at = now_iso();

    if let Err(error) = persist_workspace_meta_update(&app, &workspace_root, &workspace_meta) {
        return WorkspaceTaskResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            task: None,
            error: Some(error),
        };
    }

    WorkspaceTaskResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        task: Some(task),
        error: None,
    }
}

#[tauri::command]
fn consellour_tool_edit_task(
    app: AppHandle,
    payload: ConsellourToolEditTaskPayload,
) -> WorkspaceTaskResponse {
    let request_id = request_id();
    let (workspace_root, mut workspace_meta) = match active_workspace_meta(&app) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceTaskResponse {
                request_id,
                ok: false,
                workspace_root: None,
                task: None,
                error: Some(error),
            }
        }
    };

    if payload.id.trim().is_empty() {
        return WorkspaceTaskResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            task: None,
            error: Some("Task id must be a non-empty string.".to_string()),
        };
    }

    let task = match task_by_id_mut(&mut workspace_meta.tasks, payload.id.trim()) {
        Some(value) => value,
        None => {
            return WorkspaceTaskResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                task: None,
                error: Some("Task not found for the provided id.".to_string()),
            }
        }
    };

    let mut did_change = false;

    if let Some(title) = payload.title.as_deref() {
        let normalized = match normalize_task_title(title) {
            Ok(value) => value,
            Err(error) => {
                return WorkspaceTaskResponse {
                    request_id,
                    ok: false,
                    workspace_root: Some(workspace_root.display().to_string()),
                    task: None,
                    error: Some(error),
                }
            }
        };
        task.title = normalized;
        did_change = true;
    }

    if let Some(description) = payload.description.as_deref() {
        let normalized = match normalize_task_description(description) {
            Ok(value) => value,
            Err(error) => {
                return WorkspaceTaskResponse {
                    request_id,
                    ok: false,
                    workspace_root: Some(workspace_root.display().to_string()),
                    task: None,
                    error: Some(error),
                }
            }
        };
        task.description = normalized;
        did_change = true;
    }

    if let Some(priority) = payload.priority {
        task.priority = priority;
        did_change = true;
    }

    if let Some(consellour_priority) = payload.consellour_priority {
        task.consellour_priority = consellour_priority;
        did_change = true;
    }

    if let Some(last_interacted_at) = payload.last_interacted_at.as_deref() {
        let normalized_last_interacted_at = last_interacted_at.trim();
        if normalized_last_interacted_at.is_empty() {
            return WorkspaceTaskResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                task: None,
                error: Some(
                    "lastInteractedAt must be a non-empty string when provided.".to_string(),
                ),
            };
        }
        task.last_interacted_at = normalized_last_interacted_at.to_string();
        did_change = true;
    }

    if let Some(origin) = payload.origin {
        task.origin = origin;
        did_change = true;
    }

    if let Some(external_id) = payload.external_id.as_deref() {
        let normalized = match normalize_optional_external_id(Some(external_id)) {
            Ok(value) => value,
            Err(error) => {
                return WorkspaceTaskResponse {
                    request_id,
                    ok: false,
                    workspace_root: Some(workspace_root.display().to_string()),
                    task: None,
                    error: Some(error),
                }
            }
        };
        task.external_id = normalized;
        did_change = true;
    }

    if let Some(external_url) = payload.external_url.as_deref() {
        let normalized = match normalize_optional_external_url(Some(external_url)) {
            Ok(value) => value,
            Err(error) => {
                return WorkspaceTaskResponse {
                    request_id,
                    ok: false,
                    workspace_root: Some(workspace_root.display().to_string()),
                    task: None,
                    error: Some(error),
                }
            }
        };
        task.external_url = normalized;
        did_change = true;
    }

    if let Some(pr_entries) = payload.pr.as_ref() {
        let mut normalized_pr = Vec::with_capacity(pr_entries.len());
        for entry in pr_entries {
            let normalized_url = entry.url.trim();
            if normalized_url.is_empty() {
                return WorkspaceTaskResponse {
                    request_id,
                    ok: false,
                    workspace_root: Some(workspace_root.display().to_string()),
                    task: None,
                    error: Some("PR entry url must be a non-empty string.".to_string()),
                };
            }

            if !(normalized_url.starts_with("http://") || normalized_url.starts_with("https://")) {
                return WorkspaceTaskResponse {
                    request_id,
                    ok: false,
                    workspace_root: Some(workspace_root.display().to_string()),
                    task: None,
                    error: Some("PR entry url must start with http:// or https://.".to_string()),
                };
            }

            let normalized_timestamp = entry.timestamp.trim();
            if normalized_timestamp.is_empty() {
                return WorkspaceTaskResponse {
                    request_id,
                    ok: false,
                    workspace_root: Some(workspace_root.display().to_string()),
                    task: None,
                    error: Some("PR entry timestamp must be a non-empty string.".to_string()),
                };
            }

            normalized_pr.push(WorkspaceTaskPrEntry {
                url: normalized_url.to_string(),
                title: entry
                    .title
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(|value| value.to_string()),
                number: entry.number,
                timestamp: normalized_timestamp.to_string(),
            });
        }

        task.pr = normalized_pr;
        did_change = true;
    }

    if !did_change {
        return WorkspaceTaskResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            task: Some(task.clone()),
            error: Some("No editable task fields were provided.".to_string()),
        };
    }

    task.updated_at = now_iso();
    let task_response = task.clone();
    workspace_meta.updated_at = now_iso();

    if let Err(error) = persist_workspace_meta_update(&app, &workspace_root, &workspace_meta) {
        return WorkspaceTaskResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            task: None,
            error: Some(error),
        };
    }

    WorkspaceTaskResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        task: Some(task_response),
        error: None,
    }
}

#[tauri::command]
fn consellour_tool_delete_task(
    app: AppHandle,
    payload: ConsellourToolDeleteTaskPayload,
) -> WorkspaceTaskResponse {
    let request_id = request_id();
    let (workspace_root, mut workspace_meta) = match active_workspace_meta(&app) {
        Ok(value) => value,
        Err(error) => {
            return WorkspaceTaskResponse {
                request_id,
                ok: false,
                workspace_root: None,
                task: None,
                error: Some(error),
            }
        }
    };

    let normalized_id = payload.id.trim();
    if normalized_id.is_empty() {
        return WorkspaceTaskResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            task: None,
            error: Some("Task id must be a non-empty string.".to_string()),
        };
    }

    let task_index = match workspace_meta
        .tasks
        .iter()
        .position(|task| task.id == normalized_id)
    {
        Some(index) => index,
        None => {
            return WorkspaceTaskResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                task: None,
                error: Some("Task not found for the provided id.".to_string()),
            }
        }
    };

    let removed_task = workspace_meta.tasks.remove(task_index);
    workspace_meta
        .worktree_task_assignments
        .retain(|_, task_id| task_id != normalized_id);
    workspace_meta.updated_at = now_iso();

    if let Err(error) = persist_workspace_meta_update(&app, &workspace_root, &workspace_meta) {
        return WorkspaceTaskResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            task: None,
            error: Some(error),
        };
    }

    WorkspaceTaskResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        task: Some(removed_task),
        error: None,
    }
}
