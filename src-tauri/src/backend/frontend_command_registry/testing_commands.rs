#[tauri::command]
fn testing_environment_get_status(
    app: AppHandle,
    state: State<TestingEnvironmentState>,
    payload: TestingEnvironmentStatusPayload,
) -> TestingEnvironmentResponse {
    let request_id = request_id();
    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(known_worktrees) => known_worktrees,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        None,
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => root,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let mut runtime = match state.runtime.lock() {
        Ok(guard) => guard,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(format!(
                    "Failed to acquire testing environment lock: {error}"
                )),
            }
        }
    };

    if let Err(error) = ensure_testing_runtime_loaded(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    if let Err(error) = reconcile_testing_runtime_and_persist(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }
    build_testing_environment_response(request_id, Some(&workspace_root), &runtime.persisted, None)
}

#[tauri::command]
fn testing_environment_set_target(
    app: AppHandle,
    state: State<TestingEnvironmentState>,
    payload: TestingEnvironmentSetTargetPayload,
) -> TestingEnvironmentResponse {
    let request_id = request_id();
    let enabled = payload.enabled.unwrap_or(true);

    let worktree = payload.worktree.trim();
    if worktree.is_empty() {
        return TestingEnvironmentResponse {
            request_id,
            ok: false,
            workspace_root: None,
            environments: Vec::new(),
            target_worktree: None,
            target_path: None,
            status: "none".to_string(),
            instance_id: None,
            pid: None,
            started_at: None,
            error: Some("worktree is required and must be a non-empty string.".to_string()),
        };
    }
    if !is_safe_path_token(worktree) {
        return TestingEnvironmentResponse {
            request_id,
            ok: false,
            workspace_root: None,
            environments: Vec::new(),
            target_worktree: None,
            target_path: None,
            status: "none".to_string(),
            instance_id: None,
            pid: None,
            started_at: None,
            error: Some("worktree contains unsafe characters or path segments.".to_string()),
        };
    }

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(known_worktrees) => known_worktrees,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    if !enabled {
        let mut runtime = match state.runtime.lock() {
            Ok(guard) => guard,
            Err(error) => {
                return TestingEnvironmentResponse {
                    request_id,
                    ok: false,
                    workspace_root: None,
                    environments: Vec::new(),
                    target_worktree: None,
                    target_path: None,
                    status: "none".to_string(),
                    instance_id: None,
                    pid: None,
                    started_at: None,
                    error: Some(format!(
                        "Failed to acquire testing environment lock: {error}"
                    )),
                }
            }
        };

        if let Err(error) = ensure_testing_runtime_loaded(&app, &mut runtime) {
            return build_testing_environment_response(
                request_id,
                None,
                &runtime.persisted,
                Some(error),
            );
        }

        if let Err(error) = reconcile_testing_runtime_and_persist(&app, &mut runtime) {
            return build_testing_environment_response(
                request_id,
                None,
                &runtime.persisted,
                Some(error),
            );
        }

        let root_name_hint = payload
            .root_name
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty());

        let provided_workspace_root = payload
            .workspace_root
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string());

        let mut workspace_roots = Vec::<String>::new();
        let mut seen_workspace_roots = HashSet::<String>::new();

        if let Some(workspace_root) = provided_workspace_root {
            if seen_workspace_roots.insert(workspace_root.clone()) {
                workspace_roots.push(workspace_root);
            }
        }

        if let Ok(resolved_workspace_root) = resolve_workspace_root(
            &app,
            &payload.root_name,
            Some(worktree),
            &known_worktrees,
            &payload.workspace_meta,
        ) {
            let workspace_root = resolved_workspace_root.display().to_string();
            if seen_workspace_roots.insert(workspace_root.clone()) {
                workspace_roots.push(workspace_root);
            }
        } else if let Ok(resolved_workspace_root) = resolve_workspace_root(
            &app,
            &payload.root_name,
            None,
            &known_worktrees,
            &payload.workspace_meta,
        ) {
            let workspace_root = resolved_workspace_root.display().to_string();
            if seen_workspace_roots.insert(workspace_root.clone()) {
                workspace_roots.push(workspace_root);
            }
        }

        for target in &runtime.persisted.targets {
            if target.worktree != worktree {
                continue;
            }
            if !workspace_root_matches_root_name(&target.workspace_root, root_name_hint) {
                continue;
            }
            if seen_workspace_roots.insert(target.workspace_root.clone()) {
                workspace_roots.push(target.workspace_root.clone());
            }
        }
        for instance in &runtime.persisted.running_instances {
            if instance.worktree != worktree {
                continue;
            }
            if !workspace_root_matches_root_name(&instance.workspace_root, root_name_hint) {
                continue;
            }
            if seen_workspace_roots.insert(instance.workspace_root.clone()) {
                workspace_roots.push(instance.workspace_root.clone());
            }
        }

        if workspace_roots.is_empty() {
            for target in &runtime.persisted.targets {
                if target.worktree == worktree {
                    if seen_workspace_roots.insert(target.workspace_root.clone()) {
                        workspace_roots.push(target.workspace_root.clone());
                    }
                }
            }
            for instance in &runtime.persisted.running_instances {
                if instance.worktree == worktree {
                    if seen_workspace_roots.insert(instance.workspace_root.clone()) {
                        workspace_roots.push(instance.workspace_root.clone());
                    }
                }
            }
        }

        for workspace_root in &workspace_roots {
            runtime.persisted.targets.retain(|target| {
                !(target.workspace_root == *workspace_root && target.worktree == worktree)
            });

            if payload.stop_running_processes_when_unset.unwrap_or(true) {
                if let Err(error) = stop_running_testing_instance_for_worktree(
                    &mut runtime,
                    workspace_root,
                    worktree,
                ) {
                    let workspace_root_path = PathBuf::from(workspace_root);
                    return build_testing_environment_response(
                        request_id,
                        Some(&workspace_root_path),
                        &runtime.persisted,
                        Some(error),
                    );
                }
            }
        }

        runtime.persisted.updated_at = Some(now_iso());

        if let Err(error) = write_persisted_testing_environment_state(&app, &runtime.persisted) {
            let workspace_root_path = workspace_roots.first().map(PathBuf::from);
            return build_testing_environment_response(
                request_id,
                workspace_root_path.as_deref(),
                &runtime.persisted,
                Some(error),
            );
        }

        let workspace_root_path = workspace_roots.first().map(PathBuf::from);
        return build_testing_environment_response(
            request_id,
            workspace_root_path.as_deref(),
            &runtime.persisted,
            None,
        );
    }

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        Some(worktree),
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => root,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let mut runtime = match state.runtime.lock() {
        Ok(guard) => guard,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(format!(
                    "Failed to acquire testing environment lock: {error}"
                )),
            }
        }
    };

    if let Err(error) = ensure_testing_runtime_loaded(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    if let Err(error) = reconcile_testing_runtime_and_persist(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    let workspace_root_string = workspace_root.display().to_string();
    if enabled {
        let worktree_path = match ensure_worktree_in_dir(&workspace_root, worktree, ".worktrees") {
            Ok(path) => path,
            Err(error) => {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(error),
                );
            }
        };

        let target = TestingEnvironmentTarget {
            workspace_root: workspace_root_string.clone(),
            worktree: worktree.to_string(),
            worktree_path: worktree_path.display().to_string(),
            updated_at: now_iso(),
        };

        let mut replaced = false;
        for existing in &mut runtime.persisted.targets {
            if existing.workspace_root == workspace_root_string && existing.worktree == worktree {
                *existing = target.clone();
                replaced = true;
                break;
            }
        }
        if !replaced {
            runtime.persisted.targets.push(target.clone());
        }

        let has_running_instance_for_target =
            runtime.persisted.running_instances.iter().any(|instance| {
                instance.workspace_root == workspace_root_string && instance.worktree == worktree
            });
        let has_any_running_in_workspace = runtime
            .persisted
            .running_instances
            .iter()
            .any(|instance| instance.workspace_root == workspace_root_string);

        if payload.auto_start_if_current_running.unwrap_or(false)
            && has_any_running_in_workspace
            && !has_running_instance_for_target
        {
            if let Err(error) = start_testing_instance_for_target(&app, &target, &mut runtime) {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(error),
                );
            }
        }

        runtime.persisted.updated_at = Some(now_iso());
        if let Err(error) = record_worktree_last_executed_at(&app, &workspace_root, worktree) {
            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(error),
            );
        }
    } else {
        runtime.persisted.targets.retain(|target| {
            !(target.workspace_root == workspace_root_string && target.worktree == worktree)
        });
        if payload.stop_running_processes_when_unset.unwrap_or(true) {
            if let Err(error) = stop_running_testing_instance_for_worktree(
                &mut runtime,
                &workspace_root_string,
                worktree,
            ) {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(error),
                );
            }
        }
        runtime.persisted.updated_at = Some(now_iso());
    }

    if let Err(error) = write_persisted_testing_environment_state(&app, &runtime.persisted) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    build_testing_environment_response(request_id, Some(&workspace_root), &runtime.persisted, None)
}

#[tauri::command]
fn testing_environment_start(
    app: AppHandle,
    state: State<TestingEnvironmentState>,
    payload: TestingEnvironmentStartPayload,
) -> TestingEnvironmentResponse {
    let request_id = request_id();

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(known_worktrees) => known_worktrees,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let required_worktree = payload
        .worktree
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if let Some(worktree) = required_worktree {
        if !is_safe_path_token(worktree) {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some("worktree contains unsafe characters or path segments.".to_string()),
            };
        }
    }

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        required_worktree,
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => root,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let mut runtime = match state.runtime.lock() {
        Ok(guard) => guard,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(format!(
                    "Failed to acquire testing environment lock: {error}"
                )),
            }
        }
    };

    if let Err(error) = ensure_testing_runtime_loaded(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    if let Err(error) = reconcile_testing_runtime_and_persist(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    let workspace_root_string = workspace_root.display().to_string();
    if let Some(worktree) = required_worktree {
        let worktree_path = match ensure_worktree_in_dir(&workspace_root, worktree, ".worktrees") {
            Ok(path) => path,
            Err(error) => {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(error),
                );
            }
        };

        let target = TestingEnvironmentTarget {
            workspace_root: workspace_root_string.clone(),
            worktree: worktree.to_string(),
            worktree_path: worktree_path.display().to_string(),
            updated_at: now_iso(),
        };
        runtime.persisted.targets.retain(|existing| {
            !(existing.workspace_root == workspace_root_string && existing.worktree == worktree)
        });
        runtime.persisted.targets.push(target.clone());
        if let Err(error) = start_testing_instance_for_target(&app, &target, &mut runtime) {
            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(error),
            );
        }
        if let Err(error) = record_worktree_last_executed_at(&app, &workspace_root, worktree) {
            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(error),
            );
        }
    } else {
        let targets = runtime
            .persisted
            .targets
            .iter()
            .filter(|target| target.workspace_root == workspace_root_string)
            .cloned()
            .collect::<Vec<_>>();
        if targets.is_empty() {
            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(
                    "Select at least one testing environment target before running locally."
                        .to_string(),
                ),
            );
        }
        for target in targets {
            if let Err(error) = start_testing_instance_for_target(&app, &target, &mut runtime) {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(error),
                );
            }
            if let Err(error) =
                record_worktree_last_executed_at(&app, &workspace_root, &target.worktree)
            {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(error),
                );
            }
        }
    }
    runtime.persisted.updated_at = Some(now_iso());

    if let Err(error) = write_persisted_testing_environment_state(&app, &runtime.persisted) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    build_testing_environment_response(request_id, Some(&workspace_root), &runtime.persisted, None)
}

#[tauri::command]
fn testing_environment_start_separate_terminal(
    app: AppHandle,
    state: State<TestingEnvironmentState>,
    payload: TestingEnvironmentStartPayload,
) -> TestingEnvironmentResponse {
    let request_id = request_id();

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(known_worktrees) => known_worktrees,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let required_worktree = payload
        .worktree
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if let Some(worktree) = required_worktree {
        if !is_safe_path_token(worktree) {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some("worktree contains unsafe characters or path segments.".to_string()),
            };
        }
    }

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        required_worktree,
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => root,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let mut runtime = match state.runtime.lock() {
        Ok(guard) => guard,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(format!(
                    "Failed to acquire testing environment lock: {error}"
                )),
            }
        }
    };

    if let Err(error) = ensure_testing_runtime_loaded(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    if let Err(error) = reconcile_testing_runtime_and_persist(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    let workspace_root_string = workspace_root.display().to_string();
    let mut targets_to_start: Vec<TestingEnvironmentTarget> = Vec::new();
    if let Some(worktree) = required_worktree {
        let worktree_path = match ensure_worktree_in_dir(&workspace_root, worktree, ".worktrees") {
            Ok(path) => path,
            Err(error) => {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(error),
                );
            }
        };
        let target = TestingEnvironmentTarget {
            workspace_root: workspace_root_string.clone(),
            worktree: worktree.to_string(),
            worktree_path: worktree_path.display().to_string(),
            updated_at: now_iso(),
        };
        runtime.persisted.targets.retain(|existing| {
            !(existing.workspace_root == workspace_root_string && existing.worktree == worktree)
        });
        runtime.persisted.targets.push(target.clone());
        targets_to_start.push(target);
    } else {
        targets_to_start = runtime
            .persisted
            .targets
            .iter()
            .filter(|target| target.workspace_root == workspace_root_string)
            .cloned()
            .collect::<Vec<_>>();
        if targets_to_start.is_empty() {
            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(
                    "Select at least one testing environment target before running locally on a separate terminal."
                        .to_string(),
                ),
            );
        }
    }

    let workspace_meta = match ensure_workspace_meta(&workspace_root) {
        Ok((meta, _)) => meta,
        Err(error) => {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
        }
    };
    let configured_terminal = if workspace_meta.default_terminal == "none" {
        "auto".to_string()
    } else {
        workspace_meta.default_terminal.clone()
    };
    let configured_ports = testing_ports_for_workspace(&workspace_root);
    let mut used_ports = runtime
        .persisted
        .running_instances
        .iter()
        .filter(|instance| testing_instance_is_effectively_running(instance))
        .filter_map(|instance| instance.port)
        .collect::<HashSet<_>>();

    for target in targets_to_start {
        let port = match allocate_testing_port(&configured_ports, &used_ports) {
            Ok(value) => value,
            Err(error) => {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(error),
                );
            }
        };
        used_ports.insert(port);
        let args = vec![
            "run".to_string(),
            target.worktree.clone(),
            "--terminal".to_string(),
            configured_terminal.clone(),
        ];
        let (result, command_for_state) = (
            run_command_timeout(
                &groove_binary_path(&app),
                &args,
                &workspace_root,
                SEPARATE_TERMINAL_COMMAND_TIMEOUT,
                Some(port),
            ),
            format!("groove {}", args.join(" ")),
        );

        if result.exit_code != Some(0) || result.error.is_some() {
            let output_line = result
                .stderr
                .lines()
                .chain(result.stdout.lines())
                .map(str::trim)
                .find(|value| !value.is_empty())
                .map(str::to_string);
            let detail = result
                .error
                .or_else(|| output_line)
                .unwrap_or_else(|| "groove run failed.".to_string());

            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(format!(
                    "Failed to run local testing in a separate terminal for {}: {}",
                    target.worktree, detail
                )),
            );
        }

        if let Err(error) =
            record_worktree_last_executed_at(&app, &workspace_root, &target.worktree)
        {
            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(error),
            );
        }

        runtime.persisted.running_instances.retain(|instance| {
            !(instance.workspace_root == target.workspace_root
                && instance.worktree == target.worktree)
        });
        runtime
            .persisted
            .running_instances
            .push(TestingEnvironmentInstance {
                instance_id: format!("separate-terminal-{}", Uuid::new_v4()),
                pid: 0,
                port: Some(port),
                workspace_root: target.workspace_root.clone(),
                worktree: target.worktree.clone(),
                worktree_path: target.worktree_path.clone(),
                command: command_for_state,
                started_at: now_iso(),
            });
        runtime
            .children_by_worktree
            .remove(&testing_child_key(&target.workspace_root, &target.worktree));
    }
    runtime.persisted.updated_at = Some(now_iso());

    if let Err(error) = write_persisted_testing_environment_state(&app, &runtime.persisted) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    build_testing_environment_response(request_id, Some(&workspace_root), &runtime.persisted, None)
}

#[tauri::command]
fn testing_environment_stop(
    app: AppHandle,
    state: State<TestingEnvironmentState>,
    payload: TestingEnvironmentStopPayload,
) -> TestingEnvironmentResponse {
    let request_id = request_id();

    let known_worktrees = match validate_known_worktrees(&payload.known_worktrees) {
        Ok(known_worktrees) => known_worktrees,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let workspace_root = match resolve_workspace_root(
        &app,
        &payload.root_name,
        None,
        &known_worktrees,
        &payload.workspace_meta,
    ) {
        Ok(root) => root,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: None,
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(error),
            }
        }
    };

    let mut runtime = match state.runtime.lock() {
        Ok(guard) => guard,
        Err(error) => {
            return TestingEnvironmentResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                environments: Vec::new(),
                target_worktree: None,
                target_path: None,
                status: "none".to_string(),
                instance_id: None,
                pid: None,
                started_at: None,
                error: Some(format!(
                    "Failed to acquire testing environment lock: {error}"
                )),
            }
        }
    };

    if let Err(error) = ensure_testing_runtime_loaded(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    if let Err(error) = reconcile_testing_runtime_and_persist(&app, &mut runtime) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    let workspace_root_string = workspace_root.display().to_string();
    if let Some(worktree) = payload
        .worktree
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if let Err(error) = stop_running_testing_instance_for_worktree(
            &mut runtime,
            &workspace_root_string,
            worktree,
        ) {
            return build_testing_environment_response(
                request_id,
                Some(&workspace_root),
                &runtime.persisted,
                Some(error),
            );
        }
    } else {
        let worktrees = runtime
            .persisted
            .running_instances
            .iter()
            .filter(|instance| instance.workspace_root == workspace_root_string)
            .map(|instance| instance.worktree.clone())
            .collect::<Vec<_>>();
        for worktree in worktrees {
            if let Err(error) = stop_running_testing_instance_for_worktree(
                &mut runtime,
                &workspace_root_string,
                &worktree,
            ) {
                return build_testing_environment_response(
                    request_id,
                    Some(&workspace_root),
                    &runtime.persisted,
                    Some(error),
                );
            }
        }
    }
    runtime.persisted.updated_at = Some(now_iso());

    if let Err(error) = write_persisted_testing_environment_state(&app, &runtime.persisted) {
        return build_testing_environment_response(
            request_id,
            Some(&workspace_root),
            &runtime.persisted,
            Some(error),
        );
    }

    build_testing_environment_response(request_id, Some(&workspace_root), &runtime.persisted, None)
}

