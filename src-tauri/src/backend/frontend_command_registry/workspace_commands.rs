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
fn workspace_term_sanity_check() -> WorkspaceTermSanityResponse {
    let request_id = request_id();
    let term_value = std::env::var("TERM")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let (is_usable, error) = evaluate_term_sanity(term_value.as_deref());

    WorkspaceTermSanityResponse {
        request_id,
        ok: true,
        term_value,
        is_usable,
        applied: None,
        fixed_value: None,
        error,
    }
}

#[tauri::command]
fn workspace_term_sanity_apply() -> WorkspaceTermSanityResponse {
    let request_id = request_id();
    let current_term = std::env::var("TERM")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if let Some(value) = current_term.as_deref() {
        let (is_usable, _) = evaluate_term_sanity(Some(value));
        if is_usable {
            return WorkspaceTermSanityResponse {
                request_id,
                ok: true,
                term_value: Some(value.to_string()),
                is_usable: true,
                applied: Some(false),
                fixed_value: None,
                error: None,
            };
        }
    }

    let fixed_value = TERM_SANITY_FALLBACK.to_string();
    std::env::set_var("TERM", fixed_value.clone());

    WorkspaceTermSanityResponse {
        request_id,
        ok: true,
        term_value: Some(fixed_value.clone()),
        is_usable: true,
        applied: Some(true),
        fixed_value: Some(fixed_value),
        error: None,
    }
}

fn is_usable_term_value(value: &str) -> bool {
    !matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "" | "dumb" | "unknown"
    )
}

fn evaluate_term_sanity(term_value: Option<&str>) -> (bool, Option<String>) {
    let Some(value) = term_value else {
        return (false, Some("term_missing".to_string()));
    };

    if !is_usable_term_value(value) {
        return (false, Some("term_unusable_value".to_string()));
    }

    match probe_term_clear(value) {
        Ok(()) => (true, None),
        Err(error) => (false, Some(error)),
    }
}

fn probe_term_clear(term_value: &str) -> Result<(), String> {
    crate::backend::common::platform_env::probe_term_clear(term_value)
}

const TERM_SANITY_FALLBACK: &str = "xterm-256color";

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
            settings_directory: opencode_settings
                .settings_directory
                .clone()
                .unwrap_or_else(|| global_settings.opencode_settings.settings_directory.clone()),
        });
    }
    if let Some(sound_library) = payload.sound_library {
        global_settings.sound_library = sound_library;
    }
    if let Some(claude_code_sound_settings) = payload.claude_code_sound_settings {
        global_settings.claude_code_sound_settings = claude_code_sound_settings;
    }
    if let Some(groove_sound_settings) = payload.groove_sound_settings {
        global_settings.groove_sound_settings = groove_sound_settings;
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
fn sound_library_read(app: AppHandle, payload: SoundLibraryReadPayload) -> SoundLibraryReadResponse {
    let request_id = request_id();

    let app_data_dir = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(error) => {
            return SoundLibraryReadResponse {
                request_id,
                ok: false,
                data: None,
                error: Some(format!("Failed to resolve app data directory: {error}")),
            };
        }
    };

    let sound_file = app_data_dir.join("sounds").join(&payload.file_name);
    if !sound_file.is_file() {
        return SoundLibraryReadResponse {
            request_id,
            ok: false,
            data: None,
            error: Some(format!("Sound file not found: {}", payload.file_name)),
        };
    }

    match fs::read(&sound_file) {
        Ok(bytes) => {
            use base64::Engine;
            let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
            SoundLibraryReadResponse {
                request_id,
                ok: true,
                data: Some(encoded),
                error: None,
            }
        }
        Err(error) => SoundLibraryReadResponse {
            request_id,
            ok: false,
            data: None,
            error: Some(format!("Failed to read sound file: {error}")),
        },
    }
}

#[tauri::command]
fn sound_library_import(app: AppHandle) -> GlobalSettingsResponse {
    let request_id = request_id();

    let picked = rfd::FileDialog::new()
        .set_title("Import sound file")
        .add_filter(
            "Audio files",
            &["mp3", "wav", "ogg", "flac", "m4a", "aac", "webm"],
        )
        .pick_files();

    let files = match picked {
        Some(files) if !files.is_empty() => files,
        _ => {
            return match ensure_global_settings(&app) {
                Ok(global_settings) => GlobalSettingsResponse {
                    request_id,
                    ok: true,
                    global_settings: Some(global_settings),
                    error: None,
                },
                Err(error) => GlobalSettingsResponse {
                    request_id,
                    ok: false,
                    global_settings: None,
                    error: Some(error),
                },
            };
        }
    };

    let app_data_dir = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(error) => {
            return GlobalSettingsResponse {
                request_id,
                ok: false,
                global_settings: None,
                error: Some(format!("Failed to resolve app data directory: {error}")),
            };
        }
    };

    let sounds_dir = app_data_dir.join("sounds");
    if let Err(error) = fs::create_dir_all(&sounds_dir) {
        return GlobalSettingsResponse {
            request_id,
            ok: false,
            global_settings: None,
            error: Some(format!("Failed to create sounds directory: {error}")),
        };
    }

    let mut global_settings = match ensure_global_settings(&app) {
        Ok(value) => value,
        Err(error) => {
            return GlobalSettingsResponse {
                request_id,
                ok: false,
                global_settings: None,
                error: Some(error),
            };
        }
    };

    let mut errors: Vec<String> = Vec::new();

    for file_path in &files {
        let original_name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("sound");
        let extension = file_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("mp3");

        let file_size = match fs::metadata(file_path) {
            Ok(meta) => meta.len(),
            Err(error) => {
                errors.push(format!("Cannot read {original_name}: {error}"));
                continue;
            }
        };

        if file_size > 10 * 1024 * 1024 {
            errors.push(format!("{original_name}: file exceeds 10 MB limit"));
            continue;
        }

        let id = uuid::Uuid::new_v4().to_string();
        let dest_file_name = format!("{id}.{extension}");
        let dest_path = sounds_dir.join(&dest_file_name);

        if let Err(error) = fs::copy(file_path, &dest_path) {
            errors.push(format!("Failed to copy {original_name}: {error}"));
            continue;
        }

        let display_name = original_name
            .rsplit_once('.')
            .map(|(name, _)| name)
            .unwrap_or(original_name)
            .to_string();

        global_settings.sound_library.push(SoundLibraryEntry {
            id,
            name: display_name,
            file_name: dest_file_name,
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
            };
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

    let error = if errors.is_empty() {
        None
    } else {
        Some(errors.join("; "))
    };

    GlobalSettingsResponse {
        request_id,
        ok: true,
        global_settings: Some(global_settings),
        error,
    }
}

#[tauri::command]
fn sound_library_remove(app: AppHandle, payload: SoundLibraryRemovePayload) -> GlobalSettingsResponse {
    let request_id = request_id();

    let mut global_settings = match ensure_global_settings(&app) {
        Ok(value) => value,
        Err(error) => {
            return GlobalSettingsResponse {
                request_id,
                ok: false,
                global_settings: None,
                error: Some(error),
            };
        }
    };

    let removed_entry = global_settings
        .sound_library
        .iter()
        .find(|entry| entry.id == payload.sound_id)
        .cloned();

    global_settings
        .sound_library
        .retain(|entry| entry.id != payload.sound_id);

    if let Some(entry) = &removed_entry {
        if let Ok(app_data_dir) = app.path().app_data_dir() {
            let sound_file = app_data_dir.join("sounds").join(&entry.file_name);
            let _ = fs::remove_file(sound_file);
        }
    }

    let hook_settings = &mut global_settings.claude_code_sound_settings;
    if hook_settings.notification.sound_id.as_deref() == Some(&payload.sound_id) {
        hook_settings.notification.sound_id = None;
    }
    if hook_settings.stop.sound_id.as_deref() == Some(&payload.sound_id) {
        hook_settings.stop.sound_id = None;
    }

    let groove_hooks = &mut global_settings.groove_sound_settings;
    for entry in [
        &mut groove_hooks.play,
        &mut groove_hooks.pause,
        &mut groove_hooks.summary_start,
        &mut groove_hooks.summary_end,
        &mut groove_hooks.emergency,
        &mut groove_hooks.remove,
    ] {
        if entry.sound_id.as_deref() == Some(&payload.sound_id) {
            entry.sound_id = None;
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
            };
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

