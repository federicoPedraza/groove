#[tauri::command]
async fn doctrine_generate_report(
    app: AppHandle,
    payload: DoctrineReportRequest,
) -> DoctrineReportResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || {
        doctrine_generate_report_blocking(app, payload, request_id)
    })
    .await
    {
        Ok(response) => response,
        Err(error) => DoctrineReportResponse {
            request_id: fallback_request_id,
            ok: false,
            cases: Vec::new(),
            report_text: String::new(),
            input_tokens: 0,
            worktrees_scanned: 0,
            worktrees_qualified: 0,
            error: Some(format!("Failed to run doctrine worker thread: {error}")),
        },
    }
}

#[tauri::command]
async fn doctrine_generate_result(
    app: AppHandle,
    payload: DoctrineResultRequest,
) -> DoctrineResultResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || {
        doctrine_generate_result_blocking(app, payload, request_id)
    })
    .await
    {
        Ok(response) => response,
        Err(error) => DoctrineResultResponse {
            request_id: fallback_request_id,
            ok: false,
            new_doctrine_id: None,
            doctrines: Vec::new(),
            error: Some(format!("Failed to run doctrine result worker thread: {error}")),
        },
    }
}

#[tauri::command]
async fn doctrine_list(app: AppHandle) -> DoctrineListResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || doctrine_list_blocking(app, request_id))
        .await
    {
        Ok(response) => response,
        Err(error) => DoctrineListResponse {
            request_id: fallback_request_id,
            ok: false,
            doctrines: Vec::new(),
            error: Some(format!("Failed to run doctrine list worker thread: {error}")),
        },
    }
}

#[tauri::command]
async fn doctrine_set_active(
    app: AppHandle,
    payload: DoctrineSetActiveRequest,
) -> DoctrineSetActiveResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || {
        doctrine_set_active_blocking(app, payload, request_id)
    })
    .await
    {
        Ok(response) => response,
        Err(error) => DoctrineSetActiveResponse {
            request_id: fallback_request_id,
            ok: false,
            doctrines: Vec::new(),
            error: Some(format!(
                "Failed to run doctrine set-active worker thread: {error}"
            )),
        },
    }
}

#[tauri::command]
async fn intelligence_query_list(app: AppHandle) -> IntelligenceQueryListResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || {
        intelligence_query_list_blocking(app, request_id)
    })
    .await
    {
        Ok(response) => response,
        Err(error) => IntelligenceQueryListResponse {
            request_id: fallback_request_id,
            ok: false,
            queries: Vec::new(),
            error: Some(format!(
                "Failed to run intelligence query list worker thread: {error}"
            )),
        },
    }
}

#[tauri::command]
async fn intelligence_query_save(
    app: AppHandle,
    payload: IntelligenceQuerySaveRequest,
) -> IntelligenceQuerySaveResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || {
        intelligence_query_save_blocking(app, payload, request_id)
    })
    .await
    {
        Ok(response) => response,
        Err(error) => IntelligenceQuerySaveResponse {
            request_id: fallback_request_id,
            ok: false,
            saved_id: None,
            queries: Vec::new(),
            error: Some(format!(
                "Failed to run intelligence query save worker thread: {error}"
            )),
        },
    }
}

#[tauri::command]
async fn intelligence_query_delete(
    app: AppHandle,
    payload: IntelligenceQueryDeleteRequest,
) -> IntelligenceQueryDeleteResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || {
        intelligence_query_delete_blocking(app, payload, request_id)
    })
    .await
    {
        Ok(response) => response,
        Err(error) => IntelligenceQueryDeleteResponse {
            request_id: fallback_request_id,
            ok: false,
            queries: Vec::new(),
            error: Some(format!(
                "Failed to run intelligence query delete worker thread: {error}"
            )),
        },
    }
}
