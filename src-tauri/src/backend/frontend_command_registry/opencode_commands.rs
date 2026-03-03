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
