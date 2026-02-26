fn scan_workspace_worktrees(
    app: &AppHandle,
    workspace_root: &Path,
) -> Result<(bool, Vec<WorkspaceScanRow>), String> {
    let worktrees_dir = workspace_root.join(".worktrees");
    if !path_is_directory(&worktrees_dir) {
        return Ok((false, Vec::new()));
    }

    let mut rows = Vec::new();
    let mut seen_worktrees = HashSet::<String>::new();
    let workspace_key = workspace_root_storage_key(workspace_root);
    let mut execution_state = read_persisted_worktree_execution_state(app)?;
    let last_executed_by_worktree = execution_state
        .last_executed_at_by_workspace
        .get(&workspace_key);
    let entries = fs::read_dir(&worktrees_dir)
        .map_err(|error| format!("Failed to read {}: {error}", worktrees_dir.display()))?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "Failed to enumerate {} entries: {error}",
                worktrees_dir.display()
            )
        })?;
        let path = entry.path();
        if !path_is_directory(&path) {
            continue;
        }

        let Some(worktree_os_name) = path.file_name() else {
            continue;
        };
        let worktree = worktree_os_name.to_string_lossy().to_string();
        seen_worktrees.insert(worktree.clone());
        let status = if path_is_directory(&path.join(".groove")) {
            "paused"
        } else {
            "corrupted"
        };

        rows.push(WorkspaceScanRow {
            branch_guess: branch_guess_from_worktree_name(&worktree),
            path: path.display().to_string(),
            status: status.to_string(),
            last_executed_at: last_executed_by_worktree
                .and_then(|entries| entries.get(&worktree))
                .cloned(),
            worktree,
        });
    }

    let mut cleared_tombstones = false;
    let mut workspace_tombstones_empty = false;
    if let Some(workspace_tombstones) = execution_state
        .tombstones_by_workspace
        .get_mut(&workspace_key)
    {
        let mut tombstones_to_drop = Vec::<String>::new();

        for (worktree, tombstone) in workspace_tombstones.iter() {
            if seen_worktrees.contains(worktree)
                || path_is_directory(Path::new(&tombstone.worktree_path))
            {
                tombstones_to_drop.push(worktree.clone());
                continue;
            }

            let branch_guess = tombstone
                .branch_name
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| value.to_string())
                .unwrap_or_else(|| branch_guess_from_worktree_name(worktree));

            rows.push(WorkspaceScanRow {
                worktree: worktree.clone(),
                branch_guess,
                path: tombstone.worktree_path.clone(),
                status: "deleted".to_string(),
                last_executed_at: None,
            });
        }

        for worktree in tombstones_to_drop {
            if workspace_tombstones.remove(&worktree).is_some() {
                cleared_tombstones = true;
            }
        }

        workspace_tombstones_empty = workspace_tombstones.is_empty();
    }

    if workspace_tombstones_empty {
        execution_state
            .tombstones_by_workspace
            .remove(&workspace_key);
        cleared_tombstones = true;
    }

    if cleared_tombstones {
        write_persisted_worktree_execution_state(app, &execution_state)?;
    }

    rows.sort_by(|left, right| left.worktree.cmp(&right.worktree));
    Ok((true, rows))
}

fn build_workspace_context(
    app: &AppHandle,
    workspace_root: &Path,
    request_id: String,
    persist_as_active: bool,
) -> WorkspaceContextResponse {
    let total_started_at = Instant::now();
    let telemetry_enabled = telemetry_enabled_for_app(app);
    if let Some(cached) = try_cached_workspace_context(app, workspace_root, &request_id) {
        log_build_workspace_context_timing(
            telemetry_enabled,
            Duration::ZERO,
            Duration::ZERO,
            total_started_at.elapsed(),
            true,
        );
        return cached;
    }

    let meta_started_at = Instant::now();
    let repository_remote_url = repository_remote_url(workspace_root);
    let (workspace_meta, workspace_message) = match ensure_workspace_meta(workspace_root) {
        Ok(result) => result,
        Err(error) => {
            let meta_elapsed = meta_started_at.elapsed();
            log_build_workspace_context_timing(
                telemetry_enabled,
                meta_elapsed,
                Duration::ZERO,
                total_started_at.elapsed(),
                false,
            );
            return WorkspaceContextResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                repository_remote_url,
                workspace_meta: None,
                workspace_message: None,
                has_worktrees_directory: None,
                rows: Vec::new(),
                cancelled: None,
                error: Some(error),
            };
        }
    };
    let meta_elapsed = meta_started_at.elapsed();

    let scan_started_at = Instant::now();
    let (has_worktrees_directory, rows) = match scan_workspace_worktrees(app, workspace_root) {
        Ok(result) => result,
        Err(error) => {
            let scan_elapsed = scan_started_at.elapsed();
            log_build_workspace_context_timing(
                telemetry_enabled,
                meta_elapsed,
                scan_elapsed,
                total_started_at.elapsed(),
                false,
            );
            return WorkspaceContextResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                repository_remote_url,
                workspace_meta: Some(workspace_meta),
                workspace_message: Some(workspace_message),
                has_worktrees_directory: None,
                rows: Vec::new(),
                cancelled: None,
                error: Some(error),
            };
        }
    };
    let scan_elapsed = scan_started_at.elapsed();

    if persist_as_active {
        if let Err(error) = persist_active_workspace_root(app, workspace_root) {
            log_build_workspace_context_timing(
                telemetry_enabled,
                meta_elapsed,
                scan_elapsed,
                total_started_at.elapsed(),
                false,
            );
            return WorkspaceContextResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                repository_remote_url,
                workspace_meta: Some(workspace_meta),
                workspace_message: Some(workspace_message),
                has_worktrees_directory: Some(has_worktrees_directory),
                rows,
                cancelled: None,
                error: Some(error),
            };
        }
    }

    let response = WorkspaceContextResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        repository_remote_url,
        workspace_meta: Some(workspace_meta),
        workspace_message: Some(workspace_message),
        has_worktrees_directory: Some(has_worktrees_directory),
        rows,
        cancelled: None,
        error: None,
    };

    store_workspace_context_cache(app, workspace_root, &response);
    log_build_workspace_context_timing(
        telemetry_enabled,
        meta_elapsed,
        scan_elapsed,
        total_started_at.elapsed(),
        false,
    );

    response
}

fn read_workspace_meta(workspace_root: &Path) -> Option<WorkspaceMetaContext> {
    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    if !path_is_file(&workspace_json) {
        return None;
    }

    let raw = fs::read_to_string(workspace_json).ok()?;
    let parsed = serde_json::from_str::<serde_json::Value>(&raw).ok()?;
    let obj = parsed.as_object()?;

    let version = obj.get("version").and_then(|v| v.as_i64());
    let root_name = obj
        .get("rootName")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let created_at = obj
        .get("createdAt")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let updated_at = obj
        .get("updatedAt")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let default_terminal = obj
        .get("defaultTerminal")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let terminal_custom_command = obj
        .get("terminalCustomCommand")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let telemetry_enabled = obj.get("telemetryEnabled").and_then(|v| v.as_bool());
    let disable_groove_loading_section = obj
        .get("disableGrooveLoadingSection")
        .and_then(|v| v.as_bool());
    let show_fps = obj.get("showFps").and_then(|v| v.as_bool());
    let play_groove_command = obj
        .get("playGrooveCommand")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let testing_ports = obj.get("testingPorts").and_then(|v| {
        v.as_array().map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_u64())
                .filter_map(|value| u16::try_from(value).ok())
                .collect::<Vec<_>>()
        })
    });
    let open_terminal_at_worktree_command = obj
        .get("openTerminalAtWorktreeCommand")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let run_local_command = obj
        .get("runLocalCommand")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let worktree_symlink_paths = obj.get("worktreeSymlinkPaths").and_then(|v| {
        v.as_array().map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str())
                .map(|value| value.to_string())
                .collect::<Vec<_>>()
        })
    });

    if version.is_none()
        && root_name.is_none()
        && created_at.is_none()
        && updated_at.is_none()
        && default_terminal.is_none()
        && terminal_custom_command.is_none()
        && telemetry_enabled.is_none()
        && disable_groove_loading_section.is_none()
        && show_fps.is_none()
        && play_groove_command.is_none()
        && testing_ports.is_none()
        && open_terminal_at_worktree_command.is_none()
        && run_local_command.is_none()
        && worktree_symlink_paths.is_none()
    {
        return None;
    }

    Some(WorkspaceMetaContext {
        version,
        root_name,
        created_at,
        updated_at,
        default_terminal,
        terminal_custom_command,
        telemetry_enabled,
        disable_groove_loading_section,
        show_fps,
        play_groove_command,
        testing_ports,
        open_terminal_at_worktree_command,
        run_local_command,
        worktree_symlink_paths,
    })
}

fn workspace_meta_matches(
    observed: &Option<WorkspaceMetaContext>,
    expected: &Option<WorkspaceMetaContext>,
) -> bool {
    let (Some(observed), Some(expected)) = (observed, expected) else {
        return false;
    };

    if let Some(expected_root) = &expected.root_name {
        if observed.root_name.as_ref() != Some(expected_root) {
            return false;
        }
    }

    if let Some(expected_created) = &expected.created_at {
        if observed.created_at.as_ref() != Some(expected_created) {
            return false;
        }
    }

    if let Some(expected_version) = expected.version {
        if observed.version != Some(expected_version) {
            return false;
        }
    }

    if let Some(expected_telemetry_enabled) = expected.telemetry_enabled {
        if observed.telemetry_enabled != Some(expected_telemetry_enabled) {
            return false;
        }
    }

    if let Some(expected_disable_groove_loading_section) = expected.disable_groove_loading_section {
        if observed.disable_groove_loading_section != Some(expected_disable_groove_loading_section)
        {
            return false;
        }
    }

    if let Some(expected_show_fps) = expected.show_fps {
        if observed.show_fps != Some(expected_show_fps) {
            return false;
        }
    }

    if let Some(expected_play_groove_command) = &expected.play_groove_command {
        if observed.play_groove_command.as_ref() != Some(expected_play_groove_command) {
            return false;
        }
    }

    if let Some(expected_testing_ports) = &expected.testing_ports {
        if observed.testing_ports.as_ref() != Some(expected_testing_ports) {
            return false;
        }
    }

    if let Some(expected_open_terminal_at_worktree_command) =
        &expected.open_terminal_at_worktree_command
    {
        if observed.open_terminal_at_worktree_command.as_ref()
            != Some(expected_open_terminal_at_worktree_command)
        {
            return false;
        }
    }

    if let Some(expected_run_local_command) = &expected.run_local_command {
        if observed.run_local_command.as_ref() != Some(expected_run_local_command) {
            return false;
        }
    }

    if let Some(expected_worktree_symlink_paths) = &expected.worktree_symlink_paths {
        if observed.worktree_symlink_paths.as_ref() != Some(expected_worktree_symlink_paths) {
            return false;
        }
    }

    true
}

fn inspect_candidate_root(
    root_path: &Path,
    required_worktree: Option<&str>,
    known_worktrees: &[String],
    expected_workspace_meta: &Option<WorkspaceMetaContext>,
) -> Option<CandidateRoot> {
    if !path_is_directory(&root_path.join(".worktrees")) {
        return None;
    }

    if let Some(worktree) = required_worktree {
        if !path_is_directory(&root_path.join(".worktrees").join(worktree)) {
            return None;
        }
    }

    for known in known_worktrees {
        if !path_is_directory(&root_path.join(".worktrees").join(known)) {
            return None;
        }
    }

    let observed = read_workspace_meta(root_path);

    Some(CandidateRoot {
        root_path: root_path.to_path_buf(),
        has_workspace_meta: observed.is_some(),
        matches_workspace_meta: workspace_meta_matches(&observed, expected_workspace_meta),
    })
}

fn discover_workspace_root_candidates(
    root_name: &str,
    required_worktree: Option<&str>,
    known_worktrees: &[String],
    expected_workspace_meta: &Option<WorkspaceMetaContext>,
) -> Vec<CandidateRoot> {
    let skipped = HashSet::from([
        ".git",
        ".next",
        ".pnpm-store",
        ".turbo",
        "dist",
        "node_modules",
    ]);

    let mut candidates = HashMap::<PathBuf, CandidateRoot>::new();
    let mut scanned = 0usize;

    for base in build_likely_search_bases() {
        if scanned >= MAX_DISCOVERY_DIRECTORIES {
            break;
        }

        for entry in WalkDir::new(&base)
            .follow_links(false)
            .max_depth(MAX_DISCOVERY_DEPTH + 1)
            .into_iter()
            .filter_entry(|entry| {
                if entry.depth() == 0 {
                    return true;
                }

                let name = entry.file_name().to_string_lossy();
                !skipped.contains(name.as_ref())
            })
            .filter_map(Result::ok)
        {
            if scanned >= MAX_DISCOVERY_DIRECTORIES {
                break;
            }

            if !entry.file_type().is_dir() {
                continue;
            }

            scanned += 1;

            let name = entry.file_name().to_string_lossy();
            if name != root_name {
                continue;
            }

            let candidate_path = entry.path().to_path_buf();
            if let Some(candidate) = inspect_candidate_root(
                &candidate_path,
                required_worktree,
                known_worktrees,
                expected_workspace_meta,
            ) {
                candidates.insert(candidate.root_path.clone(), candidate);
            }
        }
    }

    let mut collected = candidates.into_values().collect::<Vec<_>>();
    collected.sort_by(|a, b| a.root_path.cmp(&b.root_path));
    collected
}

fn validate_workspace_root_path(workspace_root: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(workspace_root.trim());
    if !root.is_absolute() {
        return Err("workspaceRoot must be an absolute path.".to_string());
    }

    if !path_is_directory(&root) {
        return Err(format!(
            "workspaceRoot \"{}\" is not an existing, accessible directory.",
            root.display()
        ));
    }

    Ok(root)
}

fn ensure_git_repository_root(workspace_root: &Path) -> Result<(), String> {
    let git_entry = workspace_root.join(".git");
    if !git_entry.exists() {
        return Err(format!(
            "\"{}\" is not a Git repository. Select the repository root folder (the one containing .git).",
            workspace_root.display()
        ));
    }

    let result = run_capture_command(
        workspace_root,
        "git",
        &["rev-parse", "--is-inside-work-tree"],
    );
    if let Some(error) = result.error.clone() {
        return Err(format!(
            "Could not validate Git repository at \"{}\": {}",
            workspace_root.display(),
            error
        ));
    }

    if result.exit_code != Some(0) || result.stdout.trim() != "true" {
        return Err(format!(
            "\"{}\" is not a valid Git repository. Select a folder initialized with Git.",
            workspace_root.display()
        ));
    }

    Ok(())
}

fn active_workspace_root_from_state(app: &AppHandle) -> Result<PathBuf, String> {
    let persisted_root = read_persisted_active_workspace_root(app)?
        .ok_or_else(|| "No active workspace selected.".to_string())?;
    validate_workspace_root_path(&persisted_root)
}

fn collect_gitignore_sanity(content: &str) -> (bool, bool, bool, Vec<String>) {
    let mut has_groove_entry = false;
    let mut has_workspace_entry = false;
    let mut has_groove_comment = false;

    for line in content.lines() {
        let normalized = line.trim();
        if normalized == GITIGNORE_REQUIRED_ENTRIES[0] {
            has_groove_entry = true;
        } else if normalized == GITIGNORE_REQUIRED_ENTRIES[1] {
            has_workspace_entry = true;
        } else if normalized == GITIGNORE_GROOVE_COMMENT {
            has_groove_comment = true;
        }
    }

    let mut missing_entries = Vec::new();
    if !has_groove_entry {
        missing_entries.push(GITIGNORE_REQUIRED_ENTRIES[0].to_string());
    }
    if !has_workspace_entry {
        missing_entries.push(GITIGNORE_REQUIRED_ENTRIES[1].to_string());
    }

    (
        has_groove_entry,
        has_workspace_entry,
        has_groove_comment,
        missing_entries,
    )
}

fn newline_for_content(content: &str) -> &'static str {
    if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    }
}

fn emit_workspace_ready_event(
    app: &AppHandle,
    request_id: &str,
    workspace_root: Option<&str>,
    kind: &str,
) {
    let _ = app.emit(
        "workspace-ready",
        serde_json::json!({
            "requestId": request_id,
            "workspaceRoot": workspace_root,
            "kind": kind,
        }),
    );
}

fn run_capture_command(cwd: &Path, binary: &str, args: &[&str]) -> CommandResult {
    let output = Command::new(binary).args(args).current_dir(cwd).output();

    match output {
        Ok(output) => CommandResult {
            exit_code: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            error: None,
        },
        Err(error) => CommandResult {
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error: Some(format!("Failed to execute {binary}: {error}")),
        },
    }
}

fn run_capture_command_timeout(
    cwd: &Path,
    binary: &str,
    args: &[&str],
    timeout: Duration,
) -> CommandResult {
    let mut command = Command::new(binary);
    command.args(args).current_dir(cwd);
    run_command_with_timeout(
        command,
        timeout,
        format!("Failed to execute {binary}"),
        binary.to_string(),
    )
}

fn first_non_empty_line(value: &str) -> Option<String> {
    value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.to_string())
}

fn repository_remote_url(workspace_root: &Path) -> Option<String> {
    resolve_remote_url_with_fallback(workspace_root).map(|(_, remote_url)| remote_url)
}

