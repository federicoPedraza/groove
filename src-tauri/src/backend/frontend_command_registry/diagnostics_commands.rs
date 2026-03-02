#[tauri::command]
fn diagnostics_list_opencode_instances(app: AppHandle) -> DiagnosticsOpencodeInstancesResponse {
    let started_at = Instant::now();
    let request_id = request_id();
    let telemetry_enabled = telemetry_enabled_for_app(&app);

    let response = match list_opencode_process_rows() {
        Ok(rows) => DiagnosticsOpencodeInstancesResponse {
            request_id,
            ok: true,
            rows,
            error: None,
        },
        Err(error) => DiagnosticsOpencodeInstancesResponse {
            request_id,
            ok: false,
            rows: Vec::new(),
            error: Some(error),
        },
    };

    let details = format!(
        "outcome={} rows={}",
        if response.ok { "ok" } else { "error" },
        response.rows.len(),
    );
    log_backend_timing(
        telemetry_enabled,
        "diagnostics.list_opencode_instances",
        started_at.elapsed(),
        details.as_str(),
    );
    response
}

#[tauri::command]
fn diagnostics_stop_process(pid: i32) -> DiagnosticsStopResponse {
    let request_id = request_id();
    if pid <= 0 {
        return DiagnosticsStopResponse {
            request_id,
            ok: false,
            pid: None,
            already_stopped: None,
            error: Some("pid must be a positive integer.".to_string()),
        };
    }

    match stop_process_by_pid(pid) {
        Ok((already_stopped, stopped_pid)) => DiagnosticsStopResponse {
            request_id,
            ok: true,
            pid: Some(stopped_pid),
            already_stopped: Some(already_stopped),
            error: None,
        },
        Err(error) => DiagnosticsStopResponse {
            request_id,
            ok: false,
            pid: Some(pid),
            already_stopped: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
fn diagnostics_stop_all_opencode_instances() -> DiagnosticsStopAllResponse {
    let request_id = request_id();

    let rows = match list_opencode_process_rows() {
        Ok(rows) => rows,
        Err(error) => {
            return DiagnosticsStopAllResponse {
                request_id,
                ok: false,
                attempted: 0,
                stopped: 0,
                already_stopped: 0,
                failed: 0,
                errors: Vec::new(),
                error: Some(error),
            }
        }
    };

    let unique_pids = rows
        .into_iter()
        .map(|row| row.pid)
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    let (stopped, already_stopped, failed, errors) = stop_pid_set(&unique_pids);
    let has_errors = !errors.is_empty();

    DiagnosticsStopAllResponse {
        request_id,
        ok: failed == 0,
        attempted: unique_pids.len(),
        stopped,
        already_stopped,
        failed,
        errors,
        error: if has_errors {
            Some(format!("Failed to stop {} process(es).", failed))
        } else {
            None
        },
    }
}

#[tauri::command]
fn diagnostics_stop_all_non_worktree_opencode_instances() -> DiagnosticsStopAllResponse {
    let request_id = request_id();

    let rows = match list_non_worktree_opencode_process_rows() {
        Ok(rows) => rows,
        Err(error) => {
            return DiagnosticsStopAllResponse {
                request_id,
                ok: false,
                attempted: 0,
                stopped: 0,
                already_stopped: 0,
                failed: 0,
                errors: Vec::new(),
                error: Some(error),
            }
        }
    };

    let unique_pids = rows
        .into_iter()
        .map(|row| row.pid)
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    let (stopped, already_stopped, failed, errors) = stop_pid_set(&unique_pids);
    let has_errors = !errors.is_empty();

    DiagnosticsStopAllResponse {
        request_id,
        ok: failed == 0,
        attempted: unique_pids.len(),
        stopped,
        already_stopped,
        failed,
        errors,
        error: if has_errors {
            Some(format!("Failed to stop {} process(es).", failed))
        } else {
            None
        },
    }
}

#[tauri::command]
fn diagnostics_list_worktree_node_apps(app: AppHandle) -> DiagnosticsNodeAppsResponse {
    let started_at = Instant::now();
    let request_id = request_id();
    let telemetry_enabled = telemetry_enabled_for_app(&app);

    let response = match list_worktree_node_app_rows() {
        Ok((rows, warning)) => DiagnosticsNodeAppsResponse {
            request_id,
            ok: true,
            rows,
            warning,
            error: None,
        },
        Err(error) => DiagnosticsNodeAppsResponse {
            request_id,
            ok: false,
            rows: Vec::new(),
            warning: None,
            error: Some(error),
        },
    };

    let details = format!(
        "outcome={} rows={} has_warning={}",
        if response.ok { "ok" } else { "error" },
        response.rows.len(),
        response.warning.is_some(),
    );
    log_backend_timing(
        telemetry_enabled,
        "diagnostics.list_worktree_node_apps",
        started_at.elapsed(),
        details.as_str(),
    );
    response
}

#[tauri::command]
fn diagnostics_clean_all_dev_servers(app: AppHandle) -> DiagnosticsStopAllResponse {
    let started_at = Instant::now();
    let request_id = request_id();
    let telemetry_enabled = telemetry_enabled_for_app(&app);
    let (snapshot_rows, _warning) = match list_process_snapshot_rows() {
        Ok(value) => value,
        Err(error) => {
            let response = DiagnosticsStopAllResponse {
                request_id,
                ok: false,
                attempted: 0,
                stopped: 0,
                already_stopped: 0,
                failed: 0,
                errors: Vec::new(),
                error: Some(error),
            };
            log_backend_timing(
                telemetry_enabled,
                "diagnostics.clean_all_dev_servers",
                started_at.elapsed(),
                "outcome=error attempted=0 stopped=0 already_stopped=0 failed=0",
            );
            return response;
        }
    };

    let pids = snapshot_rows
        .into_iter()
        .filter(|row| {
            is_worktree_opencode_process(row.process_name.as_deref(), &row.command)
                || is_worktree_node_process(row.process_name.as_deref(), &row.command)
                || command_matches_turbo_dev(&row.command)
        })
        .map(|row| row.pid)
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    let (stopped, already_stopped, failed, errors) = stop_pid_set(&pids);

    let response = DiagnosticsStopAllResponse {
        request_id,
        ok: failed == 0,
        attempted: pids.len(),
        stopped,
        already_stopped,
        failed,
        errors,
        error: if failed == 0 {
            None
        } else {
            Some(format!(
                "Failed to clean all target processes: {} process(es).",
                failed
            ))
        },
    };

    let details = format!(
        "outcome={} attempted={} stopped={} already_stopped={} failed={}",
        if response.ok { "ok" } else { "error" },
        response.attempted,
        response.stopped,
        response.already_stopped,
        response.failed,
    );
    log_backend_timing(
        telemetry_enabled,
        "diagnostics.clean_all_dev_servers",
        started_at.elapsed(),
        details.as_str(),
    );
    response
}

#[tauri::command]
fn diagnostics_get_msot_consuming_programs(app: AppHandle) -> DiagnosticsMostConsumingProgramsResponse {
    let started_at = Instant::now();
    let request_id = request_id();
    let telemetry_enabled = telemetry_enabled_for_app(&app);

    let response = match get_msot_consuming_programs_output() {
        Ok(output) => DiagnosticsMostConsumingProgramsResponse {
            request_id,
            ok: true,
            output,
            error: None,
        },
        Err(error) => DiagnosticsMostConsumingProgramsResponse {
            request_id,
            ok: false,
            output: String::new(),
            error: Some(error),
        },
    };

    let details = format!(
        "outcome={} output_len={}",
        if response.ok { "ok" } else { "error" },
        response.output.len(),
    );
    log_backend_timing(
        telemetry_enabled,
        "diagnostics.get_msot_consuming_programs",
        started_at.elapsed(),
        details.as_str(),
    );
    response
}

#[tauri::command]
fn diagnostics_get_system_overview(app: AppHandle) -> DiagnosticsSystemOverviewResponse {
    let started_at = Instant::now();
    let request_id = request_id();
    let telemetry_enabled = telemetry_enabled_for_app(&app);

    let overview = collect_system_overview();
    let response = DiagnosticsSystemOverviewResponse {
        request_id,
        ok: true,
        overview: Some(overview),
        error: None,
    };

    let details = if let Some(overview) = response.overview.as_ref() {
        format!(
            "outcome=ok cpu={} ram={} swap={} disk={} platform={}",
            overview.cpu_usage_percent.is_some(),
            overview.ram_usage_percent.is_some(),
            overview.swap_usage_percent.is_some(),
            overview.disk_usage_percent.is_some(),
            overview.platform,
        )
    } else {
        "outcome=ok overview=false".to_string()
    };
    log_backend_timing(
        telemetry_enabled,
        "diagnostics.get_system_overview",
        started_at.elapsed(),
        details.as_str(),
    );

    response
}

