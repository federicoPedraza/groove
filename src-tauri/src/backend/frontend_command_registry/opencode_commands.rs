fn resolve_opencode_settings_directory(
    settings_directory: &str,
    _workspace_root: Option<&str>,
) -> Result<PathBuf, String> {
    let normalized = if settings_directory.trim().is_empty() {
        default_opencode_settings_directory()
    } else {
        settings_directory.trim().to_string()
    };

    let expanded = if normalized == "~" {
        dirs_home().ok_or_else(|| "Unable to resolve home directory for '~'.".to_string())?
    } else if let Some(rest) = normalized.strip_prefix("~/") {
        dirs_home()
            .ok_or_else(|| "Unable to resolve home directory for '~/'.".to_string())?
            .join(rest)
    } else {
        PathBuf::from(&normalized)
    };

    if expanded.is_absolute() {
        return Ok(expanded);
    }

    let home = dirs_home().ok_or_else(|| {
        "Unable to resolve home directory for relative settings directory.".to_string()
    })?;
    Ok(home.join(expanded))
}


fn resolve_directory_input(path_input: &str) -> Result<PathBuf, String> {
    let normalized = path_input.trim();
    if normalized.is_empty() {
        return Err("Directory path cannot be empty.".to_string());
    }

    let expanded = if normalized == "~" {
        dirs_home().ok_or_else(|| "Unable to resolve home directory for '~'.".to_string())?
    } else if let Some(rest) = normalized.strip_prefix("~/") {
        dirs_home()
            .ok_or_else(|| "Unable to resolve home directory for '~/'".to_string())?
            .join(rest)
    } else {
        PathBuf::from(normalized)
    };

    if expanded.is_absolute() {
        Ok(expanded)
    } else {
        let home = dirs_home()
            .ok_or_else(|| "Unable to resolve home directory for relative directory path.".to_string())?;
        Ok(home.join(expanded))
    }
}

fn collect_opencode_skills(skills_dir: &Path) -> Vec<OpencodeSkillEntry> {
    let mut skills = match fs::read_dir(skills_dir) {
        Ok(entries) => entries
            .filter_map(|entry| entry.ok())
            .filter_map(|entry| {
                let entry_path = entry.path();
                let metadata = entry.metadata().ok()?;
                let is_directory = metadata.is_dir();
                let has_skill_markdown = if is_directory {
                    path_is_file(&entry_path.join("SKILL.md"))
                } else {
                    entry_path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .map(|name| name.eq_ignore_ascii_case("SKILL.md"))
                        .unwrap_or(false)
                };

                Some(OpencodeSkillEntry {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: entry_path.display().to_string(),
                    is_directory,
                    has_skill_markdown,
                })
            })
            .collect::<Vec<_>>(),
        Err(_) => Vec::new(),
    };

    skills.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    skills
}


fn copy_path_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.exists() {
        return Err(format!("Source path does not exist: {}", source.display()));
    }

    if path_is_directory(source) {
        fs::create_dir_all(destination)
            .map_err(|error| format!("Failed to create directory {}: {}", destination.display(), error))?;

        for entry in fs::read_dir(source)
            .map_err(|error| format!("Failed to read directory {}: {}", source.display(), error))?
        {
            let entry = entry.map_err(|error| format!("Failed to read directory entry: {}", error))?;
            let child_source = entry.path();
            let child_destination = destination.join(entry.file_name());
            copy_path_recursive(&child_source, &child_destination)?;
        }

        return Ok(());
    }

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create parent directory {}: {}", parent.display(), error))?;
    }

    fs::copy(source, destination).map_err(|error| {
        format!(
            "Failed to copy file {} to {}: {}",
            source.display(),
            destination.display(),
            error
        )
    })?;

    Ok(())
}

fn copy_skills_by_name(source_root: &Path, target_root: &Path, names: &[String]) -> Result<usize, String> {
    if names.is_empty() {
        return Ok(0);
    }

    fs::create_dir_all(target_root)
        .map_err(|error| format!("Failed to create target skills directory {}: {}", target_root.display(), error))?;

    let mut copied_count = 0usize;
    for name in names {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            continue;
        }

        if trimmed.contains('/') || trimmed.contains('\\') {
            return Err(format!("Invalid skill name: {}", trimmed));
        }

        let source = source_root.join(trimmed);
        if !source.exists() {
            return Err(format!("Skill not found in source scope: {}", source.display()));
        }

        let destination = target_root.join(trimmed);
        copy_path_recursive(&source, &destination)?;
        copied_count += 1;
    }

    Ok(copied_count)
}

fn build_opencode_skill_scope(scope: &str, root_path: PathBuf) -> OpencodeSkillScope {
    let primary_skills_path = root_path.join("skills");
    let fallback_skills_path = root_path.join("skill");

    let skills_path = if path_is_directory(&primary_skills_path) {
        primary_skills_path
    } else {
        fallback_skills_path
    };

    let skills_directory_exists = path_is_directory(&skills_path);
    let skills = if skills_directory_exists {
        collect_opencode_skills(&skills_path)
    } else {
        Vec::new()
    };

    OpencodeSkillScope {
        scope: scope.to_string(),
        root_path: root_path.display().to_string(),
        skills_path: skills_path.display().to_string(),
        skills_directory_exists,
        skills,
    }
}

#[tauri::command]
fn opencode_integration_status(app: AppHandle) -> OpencodeIntegrationStatusResponse {
    let request_id = request_id();

    let global_settings = match ensure_global_settings(&app) {
        Ok(value) => value,
        Err(error) => {
            return OpencodeIntegrationStatusResponse {
                request_id,
                ok: false,
                workspace_root: None,
                workspace_scope_available: false,
                global_scope_available: false,
                effective_scope: "none".to_string(),
                workspace_settings: None,
                global_settings: None,
                error: Some(error),
            }
        }
    };

    let mut workspace_root: Option<PathBuf> = None;
    let mut workspace_settings: Option<OpencodeSettings> = None;
    let mut workspace_scope_available = false;

    if let Ok(Some(persisted_root)) = read_persisted_active_workspace_root(&app) {
        if let Ok(root) = validate_workspace_root_path(&persisted_root) {
            if let Ok((workspace_meta, _)) = ensure_workspace_meta(&root) {
                workspace_scope_available = root.join(".opencode").is_dir();
                workspace_settings = Some(workspace_meta.opencode_settings);
                workspace_root = Some(root);
            }
        }
    }

    let global_scope_available = dirs_home()
        .map(|home| home.join(".config").join("opencode").is_dir())
        .unwrap_or(false);

    let effective_scope = if workspace_scope_available {
        "workspace"
    } else if global_scope_available {
        "global"
    } else {
        "none"
    };

    OpencodeIntegrationStatusResponse {
        request_id,
        ok: true,
        workspace_root: workspace_root.map(|value| value.display().to_string()),
        workspace_scope_available,
        global_scope_available,
        effective_scope: effective_scope.to_string(),
        workspace_settings,
        global_settings: Some(global_settings.opencode_settings),
        error: None,
    }
}

#[tauri::command]
fn opencode_update_workspace_settings(
    app: AppHandle,
    payload: OpencodeSettingsUpdatePayload,
) -> OpencodeWorkspaceSettingsResponse {
    let request_id = request_id();
    let (workspace_root, mut workspace_meta) = match active_workspace_meta(&app) {
        Ok(value) => value,
        Err(error) => {
            return OpencodeWorkspaceSettingsResponse {
                request_id,
                ok: false,
                workspace_root: None,
                settings: None,
                error: Some(error),
            }
        }
    };

    workspace_meta.opencode_settings = normalize_opencode_settings(&OpencodeSettings {
        enabled: payload.enabled,
        default_model: payload.default_model,
        settings_directory: payload
            .settings_directory
            .unwrap_or_else(|| workspace_meta.opencode_settings.settings_directory.clone()),
    });
    workspace_meta.updated_at = now_iso();

    if let Err(error) = persist_workspace_meta_update(&app, &workspace_root, &workspace_meta) {
        return OpencodeWorkspaceSettingsResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            settings: Some(workspace_meta.opencode_settings),
            error: Some(error),
        };
    }

    OpencodeWorkspaceSettingsResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        settings: Some(workspace_meta.opencode_settings),
        error: None,
    }
}

#[tauri::command]
fn opencode_update_global_settings(
    app: AppHandle,
    payload: OpencodeSettingsUpdatePayload,
) -> OpencodeGlobalSettingsResponse {
    let request_id = request_id();
    let mut global_settings = match ensure_global_settings(&app) {
        Ok(value) => value,
        Err(error) => {
            return OpencodeGlobalSettingsResponse {
                request_id,
                ok: false,
                settings: None,
                error: Some(error),
            }
        }
    };

    global_settings.opencode_settings = normalize_opencode_settings(&OpencodeSettings {
        enabled: payload.enabled,
        default_model: payload.default_model,
        settings_directory: payload
            .settings_directory
            .unwrap_or_else(|| global_settings.opencode_settings.settings_directory.clone()),
    });

    let settings_file = match global_settings_file(&app) {
        Ok(path) => path,
        Err(error) => {
            return OpencodeGlobalSettingsResponse {
                request_id,
                ok: false,
                settings: Some(global_settings.opencode_settings),
                error: Some(error),
            }
        }
    };

    if let Err(error) = write_global_settings_file(&settings_file, &global_settings) {
        return OpencodeGlobalSettingsResponse {
            request_id,
            ok: false,
            settings: Some(global_settings.opencode_settings),
            error: Some(error),
        };
    }

    OpencodeGlobalSettingsResponse {
        request_id,
        ok: true,
        settings: Some(global_settings.opencode_settings),
        error: None,
    }
}

#[tauri::command]
fn validate_opencode_settings_directory(
    settings_directory: String,
    workspace_root: Option<String>,
) -> OpencodeSettingsDirectoryValidationResponse {
    let request_id = request_id();

    let resolved =
        match resolve_opencode_settings_directory(&settings_directory, workspace_root.as_deref()) {
            Ok(path) => path,
            Err(error) => {
                return OpencodeSettingsDirectoryValidationResponse {
                    request_id,
                    ok: false,
                    resolved_path: None,
                    directory_exists: false,
                    opencode_config_exists: false,
                    error: Some(error),
                }
            }
        };

    let directory_exists = path_is_directory(&resolved);
    let opencode_config_exists = path_is_file(&resolved.join("opencode.json"));

    if !directory_exists {
        return OpencodeSettingsDirectoryValidationResponse {
            request_id,
            ok: false,
            resolved_path: Some(resolved.display().to_string()),
            directory_exists,
            opencode_config_exists,
            error: Some(format!("Directory not found: {}", resolved.display())),
        };
    }

    if !opencode_config_exists {
        return OpencodeSettingsDirectoryValidationResponse {
            request_id,
            ok: false,
            resolved_path: Some(resolved.display().to_string()),
            directory_exists,
            opencode_config_exists,
            error: Some(format!(
                "Missing opencode.json in directory: {}",
                resolved.display()
            )),
        };
    }

    OpencodeSettingsDirectoryValidationResponse {
        request_id,
        ok: true,
        resolved_path: Some(resolved.display().to_string()),
        directory_exists,
        opencode_config_exists,
        error: None,
    }
}

#[tauri::command]
fn opencode_list_skills(
    workspace_root: Option<String>,
    global_skills_path: Option<String>,
    workspace_skills_path: Option<String>,
) -> OpencodeSkillsListResponse {
    let request_id = request_id();

    let global_scope = if let Some(custom_path) = global_skills_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        match resolve_directory_input(custom_path) {
            Ok(skills_path) => Some(OpencodeSkillScope {
                scope: "global".to_string(),
                root_path: skills_path
                    .parent()
                    .map(|path| path.display().to_string())
                    .unwrap_or_else(|| skills_path.display().to_string()),
                skills_path: skills_path.display().to_string(),
                skills_directory_exists: path_is_directory(&skills_path),
                skills: if path_is_directory(&skills_path) {
                    collect_opencode_skills(&skills_path)
                } else {
                    Vec::new()
                },
            }),
            Err(error) => {
                return OpencodeSkillsListResponse {
                    request_id,
                    ok: false,
                    global_scope: None,
                    workspace_scope: None,
                    error: Some(error),
                }
            }
        }
    } else {
        dirs_home().map(|home| {
            build_opencode_skill_scope("global", home.join(".config").join("opencode"))
        })
    };

    let workspace_scope = if let Some(custom_path) = workspace_skills_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        match resolve_directory_input(custom_path) {
            Ok(skills_path) => Some(OpencodeSkillScope {
                scope: "workspace".to_string(),
                root_path: skills_path
                    .parent()
                    .map(|path| path.display().to_string())
                    .unwrap_or_else(|| skills_path.display().to_string()),
                skills_path: skills_path.display().to_string(),
                skills_directory_exists: path_is_directory(&skills_path),
                skills: if path_is_directory(&skills_path) {
                    collect_opencode_skills(&skills_path)
                } else {
                    Vec::new()
                },
            }),
            Err(error) => {
                return OpencodeSkillsListResponse {
                    request_id,
                    ok: false,
                    global_scope,
                    workspace_scope: None,
                    error: Some(error),
                }
            }
        }
    } else {
        workspace_root
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .filter(|root| path_is_directory(&root.join(".opencode")))
            .map(|root| build_opencode_skill_scope("workspace", root.join(".opencode")))
    };

    OpencodeSkillsListResponse {
        request_id,
        ok: true,
        global_scope,
        workspace_scope,
        error: None,
    }
}


#[tauri::command]
fn opencode_copy_skills(payload: OpencodeCopySkillsPayload) -> OpencodeCopySkillsResponse {
    let request_id = request_id();

    let global_skills_path = match resolve_directory_input(&payload.global_skills_path) {
        Ok(path) => path,
        Err(error) => {
            return OpencodeCopySkillsResponse {
                request_id,
                ok: false,
                copied_to_workspace: 0,
                copied_to_global: 0,
                error: Some(error),
            }
        }
    };

    let workspace_skills_path = match resolve_directory_input(&payload.workspace_skills_path) {
        Ok(path) => path,
        Err(error) => {
            return OpencodeCopySkillsResponse {
                request_id,
                ok: false,
                copied_to_workspace: 0,
                copied_to_global: 0,
                error: Some(error),
            }
        }
    };

    let copied_to_workspace = match copy_skills_by_name(
        &global_skills_path,
        &workspace_skills_path,
        &payload.global_to_workspace,
    ) {
        Ok(value) => value,
        Err(error) => {
            return OpencodeCopySkillsResponse {
                request_id,
                ok: false,
                copied_to_workspace: 0,
                copied_to_global: 0,
                error: Some(error),
            }
        }
    };

    let copied_to_global = match copy_skills_by_name(
        &workspace_skills_path,
        &global_skills_path,
        &payload.workspace_to_global,
    ) {
        Ok(value) => value,
        Err(error) => {
            return OpencodeCopySkillsResponse {
                request_id,
                ok: false,
                copied_to_workspace,
                copied_to_global: 0,
                error: Some(error),
            }
        }
    };

    OpencodeCopySkillsResponse {
        request_id,
        ok: true,
        copied_to_workspace,
        copied_to_global,
        error: None,
    }
}

#[tauri::command]
fn check_opencode_status(worktree_path: String) -> OpenCodeStatusResponse {
    let request_id = request_id();
    let worktree_path = PathBuf::from(worktree_path.trim());

    if !worktree_path.is_absolute() {
        return OpenCodeStatusResponse {
            request_id,
            ok: false,
            status: None,
            error: Some("worktreePath must be an absolute path.".to_string()),
        };
    }

    OpenCodeStatusResponse {
        request_id,
        ok: true,
        status: Some(check_opencode_status_runtime(&worktree_path)),
        error: None,
    }
}

#[tauri::command]
fn get_opencode_profile(worktree_path: String) -> OpenCodeProfileResponse {
    let request_id = request_id();
    let worktree_path = PathBuf::from(worktree_path.trim());

    if !worktree_path.is_absolute() {
        return OpenCodeProfileResponse {
            request_id,
            ok: false,
            profile: None,
            error: Some("worktreePath must be an absolute path.".to_string()),
        };
    }

    match read_or_default_opencode_profile(&worktree_path) {
        Ok(profile) => OpenCodeProfileResponse {
            request_id,
            ok: true,
            profile: Some(profile),
            error: None,
        },
        Err(error) => OpenCodeProfileResponse {
            request_id,
            ok: false,
            profile: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
fn set_opencode_profile(
    worktree_path: String,
    payload: SetOpenCodeProfilePayload,
) -> OpenCodeProfileResponse {
    let request_id = request_id();
    let worktree_path = PathBuf::from(worktree_path.trim());

    if !worktree_path.is_absolute() {
        return OpenCodeProfileResponse {
            request_id,
            ok: false,
            profile: None,
            error: Some("worktreePath must be an absolute path.".to_string()),
        };
    }

    let current = match read_or_default_opencode_profile(&worktree_path) {
        Ok(value) => value,
        Err(error) => {
            return OpenCodeProfileResponse {
                request_id,
                ok: false,
                profile: None,
                error: Some(error),
            }
        }
    };

    let next = merge_opencode_profile_patch(&current, &payload.patch);
    match write_opencode_profile(&worktree_path, &next) {
        Ok(()) => OpenCodeProfileResponse {
            request_id,
            ok: true,
            profile: Some(next),
            error: None,
        },
        Err(error) => OpenCodeProfileResponse {
            request_id,
            ok: false,
            profile: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
fn sync_opencode_config(worktree_path: String) -> OpenCodeSyncResponse {
    let request_id = request_id();
    let worktree_path = PathBuf::from(worktree_path.trim());

    if !worktree_path.is_absolute() {
        return OpenCodeSyncResponse {
            request_id,
            ok: false,
            result: None,
            error: Some("worktreePath must be an absolute path.".to_string()),
        };
    }

    match sync_opencode_config_runtime(&worktree_path) {
        Ok(result) => OpenCodeSyncResponse {
            request_id,
            ok: result.ok,
            result: Some(result),
            error: None,
        },
        Err(error) => OpenCodeSyncResponse {
            request_id,
            ok: false,
            result: None,
            error: Some(format!("{}: {}", error.code, error.message)),
        },
    }
}

#[tauri::command]
fn repair_opencode_integration(worktree_path: String) -> OpenCodeRepairResponse {
    let request_id = request_id();
    let worktree_path = PathBuf::from(worktree_path.trim());

    if !worktree_path.is_absolute() {
        return OpenCodeRepairResponse {
            request_id,
            ok: false,
            result: None,
            error: Some("worktreePath must be an absolute path.".to_string()),
        };
    }

    match repair_opencode_integration_runtime(&worktree_path) {
        Ok(result) => OpenCodeRepairResponse {
            request_id,
            ok: true,
            result: Some(result),
            error: None,
        },
        Err(error) => OpenCodeRepairResponse {
            request_id,
            ok: false,
            result: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
fn run_opencode_flow(
    worktree_path: String,
    payload: RunOpenCodeFlowPayload,
) -> OpenCodeRunResponse {
    let request_id = request_id();
    let worktree_path = PathBuf::from(worktree_path.trim());

    let result = if !worktree_path.is_absolute() {
        OpenCodeRunResult {
            run_id: Uuid::new_v4().to_string(),
            phase: payload.phase,
            status: "blocked".to_string(),
            exit_code: None,
            duration_ms: 0,
            summary: Some("worktreePath must be an absolute path.".to_string()),
            stdout: String::new(),
            stderr: String::new(),
            error: Some(build_opencode_error(
                "ProfileInvalid",
                "worktreePath must be an absolute path.",
                "Pass an absolute worktree path.",
                Vec::new(),
            )),
        }
    } else {
        run_opencode_flow_runtime(&worktree_path, &payload.phase, &payload.args)
    };

    OpenCodeRunResponse {
        request_id,
        ok: matches!(result.status.as_str(), "ok" | "warning"),
        result,
    }
}

#[tauri::command]
fn cancel_opencode_flow(run_id: String) -> OpenCodeCancelResponse {
    let request_id = request_id();
    let trimmed = run_id.trim();
    let result = CancelResult {
        run_id: if trimmed.is_empty() {
            Uuid::new_v4().to_string()
        } else {
            trimmed.to_string()
        },
        supported: false,
        cancelled: false,
        status: "blocked".to_string(),
        message: "Run cancellation is not yet supported in this phase.".to_string(),
        error: Some(build_opencode_error(
            "NotYetSupported",
            "cancel_opencode_flow is not implemented yet.",
            "Allow the running phase to finish or restart the process manually.",
            Vec::new(),
        )),
    };

    OpenCodeCancelResponse {
        request_id,
        ok: false,
        result,
    }
}

#[cfg(test)]
mod opencode_commands_tests {
    use super::*;

    #[test]
    fn resolves_default_directory_from_home_instead_of_workspace() {
        let home = dirs_home().expect("home directory should be available for test");

        let resolved = resolve_opencode_settings_directory("", Some("/tmp/workspace"))
            .expect("default directory should resolve");

        assert_eq!(resolved, home.join(".config").join("opencode"));
    }

    #[test]
    fn resolves_relative_directory_from_home_instead_of_workspace() {
        let home = dirs_home().expect("home directory should be available for test");

        let resolved =
            resolve_opencode_settings_directory("./config/opencode", Some("/tmp/workspace"))
                .expect("relative directory should resolve");

        assert_eq!(resolved, home.join("./config/opencode"));
    }

    #[test]
    fn expands_tilde_prefix_to_home_directory() {
        let home = dirs_home().expect("home directory should be available for test");

        let resolved = resolve_opencode_settings_directory("~/.config/opencode", None)
            .expect("tilde path should resolve");

        assert_eq!(resolved, home.join(".config").join("opencode"));
    }

    #[test]
    fn keeps_absolute_paths_unchanged() {
        let absolute = PathBuf::from("/tmp/custom-opencode");

        let resolved =
            resolve_opencode_settings_directory("/tmp/custom-opencode", Some("/tmp/workspace"))
                .expect("absolute path should resolve");

        assert_eq!(resolved, absolute);
    }
}
