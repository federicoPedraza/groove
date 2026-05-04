#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MotherduckStatusResponse {
    request_id: String,
    ok: bool,
    token_present: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    default_database: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MotherduckSetTokenPayload {
    token: String,
    #[serde(default)]
    default_database: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MotherduckMutationResponse {
    request_id: String,
    ok: bool,
    token_present: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    default_database: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MotherduckTestResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    current_database: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    current_user: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    latency_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MotherduckQueryPayload {
    sql: String,
    #[serde(default)]
    row_limit: Option<usize>,
    #[serde(default)]
    database: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MotherduckQueryResponse {
    request_id: String,
    ok: bool,
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
    row_count: usize,
    truncated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    latency_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn motherduck_settings_for_active_workspace(
    app: &AppHandle,
) -> Result<(PathBuf, Option<MotherduckSettings>), String> {
    let workspace_root = active_workspace_root_from_state(app)?;
    let settings = read_motherduck_settings(&workspace_root)?;
    Ok((workspace_root, settings))
}

#[tauri::command]
fn motherduck_get_status(app: AppHandle) -> MotherduckStatusResponse {
    let request_id = request_id();

    match motherduck_settings_for_active_workspace(&app) {
        Ok((workspace_root, Some(settings))) => MotherduckStatusResponse {
            request_id,
            ok: true,
            token_present: !settings.bearer_token.trim().is_empty(),
            default_database: settings.default_database.clone(),
            workspace_root: Some(workspace_root.display().to_string()),
            error: None,
        },
        Ok((workspace_root, None)) => MotherduckStatusResponse {
            request_id,
            ok: true,
            token_present: false,
            default_database: None,
            workspace_root: Some(workspace_root.display().to_string()),
            error: None,
        },
        Err(error) => MotherduckStatusResponse {
            request_id,
            ok: false,
            token_present: false,
            default_database: None,
            workspace_root: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
fn motherduck_set_token(
    app: AppHandle,
    payload: MotherduckSetTokenPayload,
) -> MotherduckMutationResponse {
    let request_id = request_id();

    let trimmed_token = payload.token.trim().to_string();
    if trimmed_token.is_empty() {
        return MotherduckMutationResponse {
            request_id,
            ok: false,
            token_present: false,
            default_database: None,
            error: Some("Bearer token cannot be empty.".to_string()),
        };
    }

    let workspace_root = match active_workspace_root_from_state(&app) {
        Ok(value) => value,
        Err(error) => {
            return MotherduckMutationResponse {
                request_id,
                ok: false,
                token_present: false,
                default_database: None,
                error: Some(error),
            }
        }
    };

    let default_database = payload
        .default_database
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let settings = MotherduckSettings {
        version: default_motherduck_settings_version(),
        bearer_token: trimmed_token,
        default_database: default_database.clone(),
        updated_at: Some(motherduck_current_timestamp_iso()),
    };

    if let Err(error) = write_motherduck_settings(&workspace_root, &settings) {
        return MotherduckMutationResponse {
            request_id,
            ok: false,
            token_present: false,
            default_database: None,
            error: Some(error),
        };
    }

    MotherduckMutationResponse {
        request_id,
        ok: true,
        token_present: true,
        default_database,
        error: None,
    }
}

#[tauri::command]
fn motherduck_clear_token(app: AppHandle) -> MotherduckMutationResponse {
    let request_id = request_id();

    let workspace_root = match active_workspace_root_from_state(&app) {
        Ok(value) => value,
        Err(error) => {
            return MotherduckMutationResponse {
                request_id,
                ok: false,
                token_present: false,
                default_database: None,
                error: Some(error),
            }
        }
    };

    if let Err(error) = clear_motherduck_settings(&workspace_root) {
        return MotherduckMutationResponse {
            request_id,
            ok: false,
            token_present: false,
            default_database: None,
            error: Some(error),
        };
    }

    MotherduckMutationResponse {
        request_id,
        ok: true,
        token_present: false,
        default_database: None,
        error: None,
    }
}

#[tauri::command]
async fn motherduck_test(app: AppHandle) -> MotherduckTestResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || motherduck_test_blocking(app, request_id))
        .await
    {
        Ok(response) => response,
        Err(error) => MotherduckTestResponse {
            request_id: fallback_request_id,
            ok: false,
            current_database: None,
            current_user: None,
            latency_ms: None,
            error: Some(format!("Failed to run MotherDuck test worker: {}", error)),
        },
    }
}

fn motherduck_test_blocking(app: AppHandle, request_id: String) -> MotherduckTestResponse {
    let (_, settings) = match motherduck_settings_for_active_workspace(&app) {
        Ok(value) => value,
        Err(error) => {
            return MotherduckTestResponse {
                request_id,
                ok: false,
                current_database: None,
                current_user: None,
                latency_ms: None,
                error: Some(error),
            }
        }
    };

    let settings = match settings {
        Some(value) => value,
        None => {
            return MotherduckTestResponse {
                request_id,
                ok: false,
                current_database: None,
                current_user: None,
                latency_ms: None,
                error: Some(
                    "MotherDuck token is not configured for this workspace.".to_string(),
                ),
            }
        }
    };

    match motherduck_test_connection(&settings.bearer_token, settings.default_database.as_deref()) {
        Ok(outcome) => MotherduckTestResponse {
            request_id,
            ok: true,
            current_database: Some(outcome.current_database),
            current_user: Some(outcome.current_user),
            latency_ms: Some(outcome.latency_ms),
            error: None,
        },
        Err(error) => MotherduckTestResponse {
            request_id,
            ok: false,
            current_database: None,
            current_user: None,
            latency_ms: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
async fn motherduck_query(
    app: AppHandle,
    payload: MotherduckQueryPayload,
) -> MotherduckQueryResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || {
        motherduck_query_blocking(app, payload, request_id)
    })
    .await
    {
        Ok(response) => response,
        Err(error) => MotherduckQueryResponse {
            request_id: fallback_request_id,
            ok: false,
            columns: Vec::new(),
            rows: Vec::new(),
            row_count: 0,
            truncated: false,
            latency_ms: None,
            error: Some(format!("Failed to run MotherDuck query worker: {}", error)),
        },
    }
}

fn motherduck_query_blocking(
    app: AppHandle,
    payload: MotherduckQueryPayload,
    request_id: String,
) -> MotherduckQueryResponse {
    let (_, settings) = match motherduck_settings_for_active_workspace(&app) {
        Ok(value) => value,
        Err(error) => {
            return MotherduckQueryResponse {
                request_id,
                ok: false,
                columns: Vec::new(),
                rows: Vec::new(),
                row_count: 0,
                truncated: false,
                latency_ms: None,
                error: Some(error),
            }
        }
    };

    let settings = match settings {
        Some(value) => value,
        None => {
            return MotherduckQueryResponse {
                request_id,
                ok: false,
                columns: Vec::new(),
                rows: Vec::new(),
                row_count: 0,
                truncated: false,
                latency_ms: None,
                error: Some(
                    "MotherDuck token is not configured for this workspace.".to_string(),
                ),
            }
        }
    };

    let database = payload
        .database
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| settings.default_database.clone());

    let row_limit = payload.row_limit.unwrap_or(MOTHERDUCK_QUERY_DEFAULT_ROW_LIMIT);

    match motherduck_run_query(
        &settings.bearer_token,
        database.as_deref(),
        &payload.sql,
        row_limit,
    ) {
        Ok(result) => MotherduckQueryResponse {
            request_id,
            ok: true,
            columns: result.columns,
            rows: result.rows,
            row_count: result.row_count,
            truncated: result.truncated,
            latency_ms: Some(result.latency_ms),
            error: None,
        },
        Err(error) => MotherduckQueryResponse {
            request_id,
            ok: false,
            columns: Vec::new(),
            rows: Vec::new(),
            row_count: 0,
            truncated: false,
            latency_ms: None,
            error: Some(error),
        },
    }
}
