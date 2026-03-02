#[tauri::command]
fn groove_bin_status(app: AppHandle, state: State<GrooveBinStatusState>) -> GrooveBinStatusResponse {
    let request_id = request_id();

    match state.status.lock() {
        Ok(mut stored) => {
            let status = stored
                .clone()
                .unwrap_or_else(|| evaluate_groove_bin_check_status(&app));
            *stored = Some(status.clone());
            GrooveBinStatusResponse {
                request_id,
                ok: true,
                status,
                error: None,
            }
        }
        Err(error) => {
            let status = evaluate_groove_bin_check_status(&app);
            GrooveBinStatusResponse {
                request_id,
                ok: false,
                status,
                error: Some(format!("Failed to persist GROOVE_BIN status: {error}")),
            }
        }
    }
}

#[tauri::command]
fn groove_bin_repair(app: AppHandle, state: State<GrooveBinStatusState>) -> GrooveBinRepairResponse {
    let request_id = request_id();
    let mut changed = false;
    let mut action = "noop".to_string();
    let mut cleared_path = None;

    let pre_status = evaluate_groove_bin_check_status(&app);
    if pre_status.has_issue {
        if let Some(path) = pre_status.configured_path.clone() {
            std::env::remove_var("GROOVE_BIN");
            changed = true;
            action = "cleared-invalid-env".to_string();
            cleared_path = Some(path);
        }
    }

    let post_status = evaluate_groove_bin_check_status(&app);

    match state.status.lock() {
        Ok(mut stored) => {
            *stored = Some(post_status.clone());
            GrooveBinRepairResponse {
                request_id,
                ok: true,
                changed,
                action,
                cleared_path,
                status: post_status,
                error: None,
            }
        }
        Err(error) => GrooveBinRepairResponse {
            request_id,
            ok: false,
            changed,
            action,
            cleared_path,
            status: post_status,
            error: Some(format!("Failed to persist GROOVE_BIN status after repair: {error}")),
        },
    }
}

