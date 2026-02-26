fn ensure_testing_runtime_loaded(
    app: &AppHandle,
    runtime: &mut TestingEnvironmentRuntimeState,
) -> Result<(), String> {
    if runtime.loaded {
        return Ok(());
    }

    runtime.persisted = read_persisted_testing_environment_state(app)?;
    if runtime.persisted.targets.is_empty() {
        if let Some(target) = runtime.persisted.target.take() {
            runtime.persisted.targets.push(target);
        }
    }
    if runtime.persisted.running_instances.is_empty() {
        if let Some(instance) = runtime.persisted.running_instance.take() {
            runtime.persisted.running_instances.push(instance);
        }
    }
    runtime.loaded = true;
    Ok(())
}

fn testing_child_key(workspace_root: &str, worktree: &str) -> String {
    format!("{}::{}", workspace_root, worktree)
}

fn reconcile_testing_runtime(runtime: &mut TestingEnvironmentRuntimeState) -> bool {
    let mut changed = false;

    let mut completed_child_keys: Vec<String> = Vec::new();
    for (child_key, child) in runtime.children_by_worktree.iter_mut() {
        match child.try_wait() {
            Ok(Some(_status)) => completed_child_keys.push(child_key.clone()),
            Ok(None) => {}
            Err(_) => completed_child_keys.push(child_key.clone()),
        }
    }

    for child_key in completed_child_keys {
        runtime.children_by_worktree.remove(&child_key);
        let before = runtime.persisted.running_instances.len();
        runtime.persisted.running_instances.retain(|instance| {
            testing_child_key(&instance.workspace_root, &instance.worktree) != child_key
        });
        if runtime.persisted.running_instances.len() != before {
            changed = true;
        }
    }

    let before = runtime.persisted.running_instances.len();
    runtime.persisted.running_instances.retain(|instance| {
        if instance.pid <= 0 {
            return false;
        }
        is_process_running(instance.pid)
    });
    if runtime.persisted.running_instances.len() != before {
        changed = true;
    }

    let mut seen_targets = HashSet::<String>::new();
    let before_targets = runtime.persisted.targets.len();
    runtime.persisted.targets.retain(|target| {
        let key = format!("{}::{}", target.workspace_root, target.worktree);
        seen_targets.insert(key)
    });
    if runtime.persisted.targets.len() != before_targets {
        changed = true;
    }

    let mut seen_instances = HashSet::<String>::new();
    let before_instances = runtime.persisted.running_instances.len();
    runtime.persisted.running_instances.retain(|instance| {
        let key = format!("{}::{}", instance.workspace_root, instance.worktree);
        seen_instances.insert(key)
    });
    if runtime.persisted.running_instances.len() != before_instances {
        changed = true;
    }

    if changed {
        runtime.persisted.updated_at = Some(now_iso());
    }

    changed
}

fn reconcile_testing_runtime_and_persist(
    app: &AppHandle,
    runtime: &mut TestingEnvironmentRuntimeState,
) -> Result<(), String> {
    if reconcile_testing_runtime(runtime) {
        write_persisted_testing_environment_state(app, &runtime.persisted)?;
    }

    Ok(())
}

fn build_testing_environment_response(
    request_id: String,
    workspace_root: Option<&Path>,
    state: &PersistedTestingEnvironmentState,
    error: Option<String>,
) -> TestingEnvironmentResponse {
    let workspace_root_string = workspace_root.map(|path| path.display().to_string());

    let root = workspace_root_string.as_deref();
    let targets = state
        .targets
        .iter()
        .filter(|target| {
            root.map(|value| value == target.workspace_root)
                .unwrap_or(false)
        })
        .cloned()
        .collect::<Vec<_>>();
    let running_instances = state
        .running_instances
        .iter()
        .filter(|instance| {
            root.map(|value| value == instance.workspace_root)
                .unwrap_or(false)
        })
        .cloned()
        .collect::<Vec<_>>();

    let running_by_worktree = running_instances
        .iter()
        .map(|instance| (instance.worktree.clone(), instance.clone()))
        .collect::<HashMap<_, _>>();

    let mut environments = targets
        .iter()
        .map(|target| {
            let running_instance = running_by_worktree.get(&target.worktree);
            TestingEnvironmentEntry {
                worktree: target.worktree.clone(),
                worktree_path: target.worktree_path.clone(),
                workspace_root: Some(target.workspace_root.clone()),
                is_target: true,
                status: if running_instance.is_some() {
                    "running".to_string()
                } else {
                    "stopped".to_string()
                },
                instance_id: running_instance.map(|value| value.instance_id.clone()),
                pid: running_instance.map(|value| value.pid),
                port: running_instance.and_then(|value| value.port),
                started_at: running_instance.map(|value| value.started_at.clone()),
            }
        })
        .collect::<Vec<_>>();

    for instance in &running_instances {
        let exists = environments
            .iter()
            .any(|environment| environment.worktree == instance.worktree);
        if exists {
            continue;
        }
        environments.push(TestingEnvironmentEntry {
            worktree: instance.worktree.clone(),
            worktree_path: instance.worktree_path.clone(),
            workspace_root: Some(instance.workspace_root.clone()),
            is_target: false,
            status: "running".to_string(),
            instance_id: Some(instance.instance_id.clone()),
            pid: Some(instance.pid),
            port: instance.port,
            started_at: Some(instance.started_at.clone()),
        });
    }

    environments.sort_by(|left, right| left.worktree.cmp(&right.worktree));

    let status = if environments
        .iter()
        .any(|environment| environment.status == "running")
    {
        "running"
    } else if environments.is_empty() {
        "none"
    } else {
        "stopped"
    }
    .to_string();

    let primary_target = targets.first();
    let primary_running = running_instances.first();

    TestingEnvironmentResponse {
        request_id,
        ok: error.is_none(),
        workspace_root: workspace_root_string,
        environments,
        target_worktree: primary_target.map(|value| value.worktree.clone()),
        target_path: primary_target.map(|value| value.worktree_path.clone()),
        status,
        instance_id: primary_running.map(|value| value.instance_id.clone()),
        pid: primary_running.map(|value| value.pid),
        started_at: primary_running.map(|value| value.started_at.clone()),
        error,
    }
}

fn workspace_root_matches_root_name(workspace_root: &str, root_name: Option<&str>) -> bool {
    let Some(root_name) = root_name else {
        return true;
    };

    Path::new(workspace_root)
        .file_name()
        .map(|name| name.to_string_lossy() == root_name)
        .unwrap_or(false)
}

fn stop_running_testing_instance_for_worktree(
    runtime: &mut TestingEnvironmentRuntimeState,
    workspace_root: &str,
    worktree: &str,
) -> Result<bool, String> {
    let index = runtime
        .persisted
        .running_instances
        .iter()
        .position(|instance| {
            instance.workspace_root == workspace_root && instance.worktree == worktree
        });
    let Some(index) = index else {
        runtime
            .children_by_worktree
            .remove(&testing_child_key(workspace_root, worktree));
        return Ok(false);
    };

    let instance = runtime.persisted.running_instances[index].clone();
    let child_key = testing_child_key(workspace_root, worktree);

    let mut pids_to_stop: Vec<i32> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    if let Some(child) = runtime.children_by_worktree.get(&child_key) {
        let raw_child_pid = child.id();
        match i32::try_from(raw_child_pid) {
            Ok(child_pid) if child_pid > 0 => pids_to_stop.push(child_pid),
            Ok(_) => {}
            Err(_) => errors.push(format!(
                "Child PID {raw_child_pid} is out of supported range for worktree '{worktree}'."
            )),
        }
    }

    if instance.pid > 0 && !pids_to_stop.contains(&instance.pid) {
        pids_to_stop.push(instance.pid);
    }

    if pids_to_stop.is_empty() {
        let fallback_pids = resolve_node_app_pids_for_worktree(Path::new(&instance.worktree_path));
        pids_to_stop.extend(fallback_pids);
    }

    for pid in pids_to_stop {
        if let Err(error) = stop_process_by_pid(pid) {
            errors.push(format!("PID {pid}: {error}"));
        }
    }

    if !errors.is_empty() {
        return Err(format!(
            "Failed to stop testing environment process(es) for '{worktree}' in '{workspace_root}': {}",
            errors.join("; ")
        ));
    }

    if let Some(mut child) = runtime.children_by_worktree.remove(&child_key) {
        let _ = child.wait();
    }

    runtime.persisted.running_instances.remove(index);
    runtime.persisted.updated_at = Some(now_iso());
    Ok(true)
}

fn unset_testing_target_for_worktree(
    app: &AppHandle,
    state: &TestingEnvironmentState,
    workspace_root: &Path,
    worktree: &str,
    stop_running_processes_when_unset: bool,
) -> Result<bool, String> {
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|error| format!("Failed to acquire testing environment lock: {error}"))?;

    ensure_testing_runtime_loaded(app, &mut runtime)?;
    reconcile_testing_runtime_and_persist(app, &mut runtime)?;

    let workspace_root_string = workspace_root.display().to_string();
    let before_targets_len = runtime.persisted.targets.len();
    runtime.persisted.targets.retain(|target| {
        !(target.workspace_root == workspace_root_string && target.worktree == worktree)
    });
    let target_was_removed = runtime.persisted.targets.len() != before_targets_len;
    if !target_was_removed {
        return Ok(false);
    }

    if stop_running_processes_when_unset {
        let _ = stop_running_testing_instance_for_worktree(
            &mut runtime,
            &workspace_root_string,
            worktree,
        )?;
    }

    runtime.persisted.updated_at = Some(now_iso());
    write_persisted_testing_environment_state(app, &runtime.persisted)?;

    Ok(true)
}

fn testing_instance_is_effectively_running(instance: &TestingEnvironmentInstance) -> bool {
    if instance.pid <= 0 {
        return false;
    }

    is_process_running(instance.pid)
}

fn start_testing_instance_for_target(
    _app: &AppHandle,
    target: &TestingEnvironmentTarget,
    runtime: &mut TestingEnvironmentRuntimeState,
) -> Result<(), String> {
    if let Some(existing) = runtime
        .persisted
        .running_instances
        .iter()
        .find(|instance| {
            instance.workspace_root == target.workspace_root
                && instance.worktree == target.worktree
                && instance.worktree_path == target.worktree_path
        })
        .cloned()
    {
        if testing_instance_is_effectively_running(&existing) {
            return Ok(());
        }
        let _ = stop_running_testing_instance_for_worktree(
            runtime,
            &target.workspace_root,
            &target.worktree,
        )?;
    }

    let run_local_command = run_local_command_for_workspace(Path::new(&target.workspace_root));
    let command_template = run_local_command
        .as_deref()
        .unwrap_or(DEFAULT_RUN_LOCAL_COMMAND);
    let (program, args) =
        resolve_run_local_command(command_template, Path::new(&target.worktree_path))?;
    let mut command = Command::new(&program);
    let configured_ports = testing_ports_for_workspace(Path::new(&target.workspace_root));
    let used_ports = runtime
        .persisted
        .running_instances
        .iter()
        .filter(|instance| testing_instance_is_effectively_running(instance))
        .filter_map(|instance| instance.port)
        .collect::<HashSet<_>>();
    let port = allocate_testing_port(&configured_ports, &used_ports)?;
    command
        .args(args.iter().map(|value| value.as_str()))
        .current_dir(Path::new(&target.worktree_path))
        .env("PORT", port.to_string())
        .env("GROOVE_WORKTREE", &target.worktree_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;

        command.process_group(0);
    }

    let child = command
        .spawn()
        .map_err(|error| format!("Failed to start local testing environment: {error}"))?;

    let raw_pid = child.id();
    let pid = i32::try_from(raw_pid)
        .map_err(|_| format!("Started process PID {raw_pid} is out of supported range."))?;

    runtime.persisted.running_instances.retain(|instance| {
        !(instance.workspace_root == target.workspace_root && instance.worktree == target.worktree)
    });
    runtime
        .persisted
        .running_instances
        .push(TestingEnvironmentInstance {
            instance_id: format!("local-{pid}-{}", Uuid::new_v4()),
            pid,
            port: Some(port),
            workspace_root: target.workspace_root.clone(),
            worktree: target.worktree.clone(),
            worktree_path: target.worktree_path.clone(),
            command: std::iter::once(program.as_str())
                .chain(args.iter().map(|value| value.as_str()))
                .collect::<Vec<_>>()
                .join(" "),
            started_at: now_iso(),
        });
    runtime.children_by_worktree.insert(
        testing_child_key(&target.workspace_root, &target.worktree),
        child,
    );
    runtime.persisted.updated_at = Some(now_iso());

    Ok(())
}

