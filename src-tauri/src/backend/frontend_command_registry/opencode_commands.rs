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
