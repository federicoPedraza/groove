fn default_testing_ports() -> Vec<u16> {
    DEFAULT_TESTING_ENVIRONMENT_PORTS.to_vec()
}

fn default_worktree_symlink_paths() -> Vec<String> {
    DEFAULT_WORKTREE_SYMLINK_PATHS
        .iter()
        .map(|value| value.to_string())
        .collect()
}

fn default_consellour_model() -> String {
    DEFAULT_CONSELLOUR_MODEL.to_string()
}

fn default_consellour_reasoning_level() -> String {
    DEFAULT_CONSELLOUR_REASONING_LEVEL.to_string()
}

fn default_consellour_settings() -> ConsellourSettings {
    ConsellourSettings {
        openai_api_key: None,
        model: default_consellour_model(),
        reasoning_level: default_consellour_reasoning_level(),
        updated_at: now_iso(),
    }
}

fn default_jira_settings() -> JiraSettings {
    JiraSettings {
        enabled: false,
        site_url: String::new(),
        account_email: String::new(),
        default_project_key: None,
        jql: Some("assignee = currentUser() ORDER BY updated DESC".to_string()),
        sync_enabled: true,
        sync_open_issues_only: true,
        last_sync_at: None,
        last_sync_error: None,
    }
}

fn normalize_jira_site_url(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }

    let mut parsed = url::Url::parse(trimmed)
        .map_err(|error| format!("jiraSettings.siteUrl must be a valid URL: {error}"))?;
    if parsed.scheme() != "https" {
        return Err("jiraSettings.siteUrl must use https://.".to_string());
    }
    if parsed
        .host_str()
        .map(str::trim)
        .unwrap_or_default()
        .is_empty()
    {
        return Err("jiraSettings.siteUrl must include a host.".to_string());
    }

    parsed.set_query(None);
    parsed.set_fragment(None);

    let mut normalized = parsed.to_string();
    while normalized.ends_with('/') {
        normalized.pop();
    }
    Ok(normalized)
}

fn normalize_jira_email(value: &str) -> Result<String, String> {
    let trimmed = value.trim().to_lowercase();
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    if !trimmed.contains('@') || trimmed.len() > 320 {
        return Err("jiraSettings.accountEmail must be a valid email address.".to_string());
    }
    Ok(trimmed)
}

fn normalize_jira_project_key(value: Option<&str>) -> Result<Option<String>, String> {
    let Some(trimmed) = value.map(str::trim).filter(|entry| !entry.is_empty()) else {
        return Ok(None);
    };
    if trimmed.len() > 40 {
        return Err("jiraSettings.defaultProjectKey must be 40 characters or fewer.".to_string());
    }
    Ok(Some(trimmed.to_uppercase()))
}

fn normalize_jira_jql(value: Option<&str>) -> Result<Option<String>, String> {
    let Some(trimmed) = value.map(str::trim).filter(|entry| !entry.is_empty()) else {
        return Ok(default_jira_settings().jql);
    };
    if trimmed.len() > 2000 {
        return Err("jiraSettings.jql must be 2000 characters or fewer.".to_string());
    }
    Ok(Some(trimmed.to_string()))
}

fn normalize_jira_settings(settings: &JiraSettings) -> Result<JiraSettings, String> {
    let mut normalized = settings.clone();
    normalized.site_url = normalize_jira_site_url(&settings.site_url)?;
    normalized.account_email = normalize_jira_email(&settings.account_email)?;
    normalized.default_project_key =
        normalize_jira_project_key(settings.default_project_key.as_deref())?;
    normalized.jql = normalize_jira_jql(settings.jql.as_deref())?;

    if normalized.site_url.is_empty() || normalized.account_email.is_empty() {
        normalized.enabled = false;
    }

    if normalized
        .last_sync_error
        .as_deref()
        .map(str::trim)
        .unwrap_or_default()
        .is_empty()
    {
        normalized.last_sync_error = None;
    }

    Ok(normalized)
}

fn normalize_default_terminal(value: &str) -> Result<String, String> {
    workspace::normalize_default_terminal(value, &SUPPORTED_DEFAULT_TERMINALS)
}

fn normalize_theme_mode(value: &str) -> Result<String, String> {
    workspace::normalize_theme_mode(value, &SUPPORTED_THEME_MODES)
}

fn normalize_consellour_model(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Consellour model must be a non-empty string.".to_string());
    }

    if SUPPORTED_CONSELLOUR_MODELS.contains(&trimmed) {
        return Ok(trimmed.to_string());
    }

    Err(format!(
        "Unsupported Consellour model \"{trimmed}\". Supported values: {}.",
        SUPPORTED_CONSELLOUR_MODELS.join(", ")
    ))
}

fn normalize_consellour_reasoning_level(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Consellour reasoning level must be a non-empty string.".to_string());
    }

    if SUPPORTED_CONSELLOUR_REASONING_LEVELS.contains(&trimmed) {
        return Ok(trimmed.to_string());
    }

    Err(format!(
        "Unsupported Consellour reasoning level \"{trimmed}\". Supported values: {}.",
        SUPPORTED_CONSELLOUR_REASONING_LEVELS.join(", ")
    ))
}

fn normalize_openai_api_key(value: Option<&str>) -> Result<Option<String>, String> {
    let Some(trimmed) = value.map(str::trim) else {
        return Ok(None);
    };

    if trimmed.is_empty() {
        return Ok(None);
    }

    if trimmed.len() > 256 {
        return Err("openaiApiKey must be 256 characters or fewer.".to_string());
    }

    Ok(Some(trimmed.to_string()))
}

fn parse_terminal_command_tokens(command: &str) -> Result<Vec<String>, String> {
    terminal::parse_terminal_command_tokens(command)
}

fn parse_play_groove_command_tokens(command: &str) -> Result<Vec<String>, String> {
    terminal::parse_play_groove_command_tokens(command)
}

fn normalize_play_groove_command(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("playGrooveCommand must be a non-empty string.".to_string());
    }
    if is_groove_terminal_play_command(trimmed) {
        return Ok(trimmed.to_string());
    }
    parse_play_groove_command_tokens(trimmed)?;
    Ok(trimmed.to_string())
}

fn normalize_open_terminal_at_worktree_command(
    value: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(trimmed) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    if is_groove_terminal_open_command(trimmed) {
        return Ok(Some(trimmed.to_string()));
    }

    parse_terminal_command_tokens(trimmed)
        .map_err(|error| error.replace("terminalCustomCommand", "openTerminalAtWorktreeCommand"))?;

    Ok(Some(trimmed.to_string()))
}

fn normalize_run_local_command(value: Option<&str>) -> Result<Option<String>, String> {
    let Some(trimmed) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    parse_terminal_command_tokens(trimmed)
        .map_err(|error| error.replace("terminalCustomCommand", "runLocalCommand"))?;

    Ok(Some(trimmed.to_string()))
}

fn normalize_testing_ports_from_u16(ports: &[u16]) -> Vec<u16> {
    testing_environment::normalize_testing_ports_from_u16(
        ports,
        MIN_TESTING_PORT,
        MAX_TESTING_PORT,
        &DEFAULT_TESTING_ENVIRONMENT_PORTS,
    )
}

fn normalize_testing_ports_from_u32(ports: &[u32]) -> Vec<u16> {
    testing_environment::normalize_testing_ports_from_u32(
        ports,
        MIN_TESTING_PORT,
        MAX_TESTING_PORT,
        &DEFAULT_TESTING_ENVIRONMENT_PORTS,
    )
}

fn normalize_worktree_symlink_paths(paths: &[String]) -> Vec<String> {
    workspace::normalize_worktree_symlink_paths(paths)
}

fn validate_worktree_symlink_paths(paths: &[String]) -> Result<Vec<String>, String> {
    workspace::validate_worktree_symlink_paths(paths)
}

fn resolve_play_groove_command(
    command_template: &str,
    target: &str,
    worktree_path: &Path,
) -> Result<(String, Vec<String>), String> {
    let tokens = parse_play_groove_command_tokens(command_template)?;
    let worktree = worktree_path.display().to_string();
    let contains_worktree_placeholder = tokens.iter().any(|token| token.contains("{worktree}"));
    let contains_target_placeholder = tokens.iter().any(|token| token.contains("{target}"));

    let mut resolved_tokens = tokens
        .into_iter()
        .map(|token| {
            token
                .replace("{worktree}", &worktree)
                .replace("{target}", target)
        })
        .collect::<Vec<_>>();
    if !contains_worktree_placeholder && !contains_target_placeholder {
        resolved_tokens.push(target.to_string());
    }

    let Some((program, args)) = resolved_tokens.split_first() else {
        return Err("playGrooveCommand must include an executable command.".to_string());
    };

    Ok((program.to_string(), args.to_vec()))
}

fn parse_custom_terminal_command(
    command: &str,
    worktree_path: &Path,
) -> Result<(String, Vec<String>), String> {
    let tokens = parse_terminal_command_tokens(command)?;
    let worktree = worktree_path.display().to_string();
    let contains_worktree_placeholder = tokens.iter().any(|token| token.contains("{worktree}"));

    let mut resolved_tokens = tokens
        .into_iter()
        .map(|token| token.replace("{worktree}", &worktree))
        .collect::<Vec<_>>();
    if !contains_worktree_placeholder {
        resolved_tokens.push(worktree);
    }

    let Some((program, args)) = resolved_tokens.split_first() else {
        return Err("terminalCustomCommand must include an executable command.".to_string());
    };

    Ok((program.to_string(), args.to_vec()))
}

fn resolve_run_local_command(
    command_template: &str,
    worktree_path: &Path,
) -> Result<(String, Vec<String>), String> {
    let tokens = parse_terminal_command_tokens(command_template)
        .map_err(|error| error.replace("terminalCustomCommand", "runLocalCommand"))?;
    let worktree = worktree_path.display().to_string();
    let resolved_tokens = tokens
        .into_iter()
        .map(|token| token.replace("{worktree}", &worktree))
        .collect::<Vec<_>>();

    let Some((program, args)) = resolved_tokens.split_first() else {
        return Err("runLocalCommand must include an executable command.".to_string());
    };

    Ok((program.to_string(), args.to_vec()))
}

fn run_command_with_timeout(
    mut command: Command,
    timeout: Duration,
    spawn_error_context: String,
    timeout_context: String,
) -> CommandResult {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return CommandResult {
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                error: Some(format!("{spawn_error_context}: {error}")),
            };
        }
    };

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                return match child.wait_with_output() {
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
                        error: Some(format!(
                            "Failed to collect command output for {timeout_context}: {error}"
                        )),
                    },
                };
            }
            Ok(None) => {
                if started.elapsed() >= timeout {
                    let _ = child.kill();
                    return match child.wait_with_output() {
                        Ok(output) => CommandResult {
                            exit_code: output.status.code(),
                            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                            error: Some(format!(
                                "Command {timeout_context} timed out after {} seconds and was terminated.",
                                timeout.as_secs()
                            )),
                        },
                        Err(error) => CommandResult {
                            exit_code: None,
                            stdout: String::new(),
                            stderr: String::new(),
                            error: Some(format!(
                                "Command {timeout_context} timed out after {} seconds and could not be reaped: {error}",
                                timeout.as_secs()
                            )),
                        },
                    };
                }

                thread::sleep(COMMAND_TIMEOUT_POLL_INTERVAL);
            }
            Err(error) => {
                return CommandResult {
                    exit_code: None,
                    stdout: String::new(),
                    stderr: String::new(),
                    error: Some(format!(
                        "Failed while waiting for {timeout_context}: {error}"
                    )),
                };
            }
        }
    }
}

fn spawn_terminal_process(
    binary: &str,
    args: &[String],
    cwd: &Path,
    worktree_path: &Path,
) -> Result<(), std::io::Error> {
    let mut command = Command::new(binary);
    command
        .args(args)
        .current_dir(cwd)
        .env("GROOVE_WORKTREE", worktree_path.display().to_string());
    if let Some(path) = augmented_child_path() {
        command.env("PATH", path);
    }
    command.spawn().map(|_| ())
}

fn launch_plain_terminal(
    worktree_path: &Path,
    default_terminal: &str,
    terminal_custom_command: Option<&str>,
) -> Result<String, String> {
    let worktree = worktree_path.display().to_string();

    if default_terminal == "custom" {
        let Some(custom_command) = terminal_custom_command
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            return Err(
                "Default terminal is set to custom, but terminalCustomCommand is empty."
                    .to_string(),
            );
        };

        let (program, args) = parse_custom_terminal_command(custom_command, worktree_path)?;
        spawn_terminal_process(&program, &args, worktree_path, worktree_path)
            .map_err(|error| format!("Failed to launch terminal command {program}: {error}"))?;

        let command = std::iter::once(program.as_str())
            .chain(args.iter().map(|value| value.as_str()))
            .collect::<Vec<_>>()
            .join(" ");
        return Ok(command);
    }

    let normalized_terminal = if default_terminal == "none" {
        "auto"
    } else {
        default_terminal
    };

    let mut candidates: Vec<(String, Vec<String>)> = match normalized_terminal {
        "ghostty" => vec![(
            "ghostty".to_string(),
            vec![format!("--working-directory={worktree}")],
        )],
        "warp" => vec![(
            "warp".to_string(),
            vec!["--working-directory".to_string(), worktree.clone()],
        )],
        "kitty" => vec![(
            "kitty".to_string(),
            vec!["--directory".to_string(), worktree.clone()],
        )],
        "gnome" => vec![(
            "gnome-terminal".to_string(),
            vec![format!("--working-directory={worktree}")],
        )],
        "xterm" => vec![("xterm".to_string(), Vec::new())],
        "auto" => {
            #[allow(unused_mut)]
            let mut terminals = vec![
                (
                    "ghostty".to_string(),
                    vec![format!("--working-directory={worktree}")],
                ),
                (
                    "warp".to_string(),
                    vec!["--working-directory".to_string(), worktree.clone()],
                ),
                (
                    "kitty".to_string(),
                    vec!["--directory".to_string(), worktree.clone()],
                ),
                (
                    "gnome-terminal".to_string(),
                    vec![format!("--working-directory={worktree}")],
                ),
                ("xterm".to_string(), Vec::new()),
                ("x-terminal-emulator".to_string(), Vec::new()),
            ];
            #[cfg(target_os = "macos")]
            terminals.push((
                "open".to_string(),
                vec!["-a".to_string(), "Terminal".to_string(), worktree.clone()],
            ));
            #[cfg(target_os = "windows")]
            terminals.push((
                "cmd".to_string(),
                vec![
                    "/C".to_string(),
                    "start".to_string(),
                    "".to_string(),
                    "cmd".to_string(),
                ],
            ));
            terminals
        }
        _ => {
            return Err(format!(
                "Unsupported default terminal \"{default_terminal}\" for terminal launch."
            ))
        }
    };

    let mut launch_errors: Vec<String> = Vec::new();
    for (program, args) in candidates.drain(..) {
        match spawn_terminal_process(&program, &args, worktree_path, worktree_path) {
            Ok(()) => {
                let command = std::iter::once(program.as_str())
                    .chain(args.iter().map(|value| value.as_str()))
                    .collect::<Vec<_>>()
                    .join(" ");
                return Ok(command);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                launch_errors.push(format!("{program}: {error}"));
            }
        }
    }

    if launch_errors.is_empty() {
        Err("No supported terminal application was found to open this worktree.".to_string())
    } else {
        Err(format!(
            "Failed to open terminal for this worktree: {}",
            launch_errors.join(" | ")
        ))
    }
}

fn launch_open_terminal_at_worktree_command(
    worktree_path: &Path,
    workspace_meta: &WorkspaceMeta,
) -> Result<String, String> {
    if let Some(command_override) = workspace_meta
        .open_terminal_at_worktree_command
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if is_groove_terminal_open_command(command_override) {
            return launch_plain_terminal(
                worktree_path,
                &workspace_meta.default_terminal,
                workspace_meta.terminal_custom_command.as_deref(),
            );
        }

        let (program, args) = parse_custom_terminal_command(command_override, worktree_path)?;
        spawn_terminal_process(&program, &args, worktree_path, worktree_path)
            .map_err(|error| format!("Failed to launch terminal command {program}: {error}"))?;

        return Ok(std::iter::once(program.as_str())
            .chain(args.iter().map(|value| value.as_str()))
            .collect::<Vec<_>>()
            .join(" "));
    }

    launch_plain_terminal(
        worktree_path,
        &workspace_meta.default_terminal,
        workspace_meta.terminal_custom_command.as_deref(),
    )
}

fn is_restricted_worktree_symlink_path(path: &str) -> bool {
    workspace::is_restricted_worktree_symlink_path(path)
}

fn is_safe_path_token(value: &str) -> bool {
    workspace::is_safe_path_token(value)
}

fn is_valid_root_name(value: &str) -> bool {
    !value.trim().is_empty()
        && !value.contains('/')
        && !value.contains('\\')
        && value != "."
        && value != ".."
}

fn validate_known_worktrees(known_worktrees: &[String]) -> Result<Vec<String>, String> {
    workspace::validate_known_worktrees(known_worktrees)
}

fn validate_optional_relative_path(
    value: &Option<String>,
    label: &str,
) -> Result<Option<String>, String> {
    let Some(raw) = value else {
        return Ok(None);
    };

    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} must be a non-empty string when provided."));
    }

    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err(format!("{label} must be a relative path."));
    }

    for component in path.components() {
        if matches!(component, Component::ParentDir | Component::CurDir) {
            return Err(format!("{label} contains unsafe path segments."));
        }
    }

    Ok(Some(trimmed.to_string()))
}

fn normalize_task_title(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Task title must be a non-empty string.".to_string());
    }
    if trimmed.len() > 200 {
        return Err("Task title must be 200 characters or fewer.".to_string());
    }

    Ok(trimmed.to_string())
}

fn normalize_task_description(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Task description must be a non-empty string.".to_string());
    }
    if trimmed.len() > 10_000 {
        return Err("Task description must be 10000 characters or fewer.".to_string());
    }

    Ok(trimmed.to_string())
}

fn normalize_optional_external_id(value: Option<&str>) -> Result<Option<String>, String> {
    let Some(trimmed) = value.map(str::trim) else {
        return Ok(None);
    };

    if trimmed.is_empty() {
        return Ok(None);
    }

    if trimmed.len() > 200 {
        return Err("externalId must be 200 characters or fewer.".to_string());
    }

    Ok(Some(trimmed.to_string()))
}

fn normalize_optional_external_url(value: Option<&str>) -> Result<Option<String>, String> {
    let Some(trimmed) = value.map(str::trim) else {
        return Ok(None);
    };

    if trimmed.is_empty() {
        return Ok(None);
    }

    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err("externalUrl must start with http:// or https:// when provided.".to_string());
    }

    if trimmed.len() > 1_000 {
        return Err("externalUrl must be 1000 characters or fewer.".to_string());
    }

    Ok(Some(trimmed.to_string()))
}

fn normalize_optional_query(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(|entry| entry.to_lowercase())
}

fn task_matches_query(
    task: &WorkspaceTask,
    title_query: Option<&str>,
    description_query: Option<&str>,
) -> bool {
    let title_match = title_query
        .map(|query| task.title.to_lowercase().contains(query))
        .unwrap_or(true);
    let description_match = description_query
        .map(|query| task.description.to_lowercase().contains(query))
        .unwrap_or(true);

    title_match && description_match
}

fn task_priority_rank(priority: &TaskPriority) -> u8 {
    match priority {
        TaskPriority::Low => 0,
        TaskPriority::Medium => 1,
        TaskPriority::High => 2,
        TaskPriority::Urgent => 3,
    }
}

fn task_by_id_mut<'a>(tasks: &'a mut [WorkspaceTask], id: &str) -> Option<&'a mut WorkspaceTask> {
    tasks.iter_mut().find(|task| task.id == id)
}

fn normalize_browse_relative_path(value: Option<&str>) -> Result<String, String> {
    workspace::normalize_browse_relative_path(value)
}

fn path_is_directory(path: &Path) -> bool {
    path.is_dir()
}

fn path_is_file(path: &Path) -> bool {
    path.is_file()
}

fn build_likely_search_bases() -> Vec<PathBuf> {
    let mut bases = Vec::new();
    let mut seen = HashSet::new();

    if let Ok(mut cursor) = std::env::current_dir() {
        for _ in 0..=3 {
            if seen.insert(cursor.clone()) {
                bases.push(cursor.clone());
            }

            let Some(parent) = cursor.parent() else {
                break;
            };

            if parent == cursor {
                break;
            }

            cursor = parent.to_path_buf();
        }
    }

    if let Some(home) = dirs_home() {
        if seen.insert(home.clone()) {
            bases.push(home);
        }
    }

    bases
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
}

fn now_iso() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn workspace_root_storage_key(workspace_root: &Path) -> String {
    workspace_root
        .canonicalize()
        .unwrap_or_else(|_| workspace_root.to_path_buf())
        .display()
        .to_string()
}

fn branch_guess_from_worktree_name(worktree: &str) -> String {
    worktree.replace('_', "/")
}

fn workspace_state_file(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;
    Ok(app_data_dir.join("active-workspace.json"))
}

fn default_global_settings() -> GlobalSettings {
    GlobalSettings {
        telemetry_enabled: true,
        disable_groove_loading_section: false,
        show_fps: false,
        always_show_diagnostics_sidebar: false,
        periodic_rerender_enabled: false,
        theme_mode: default_theme_mode(),
    }
}

fn play_groove_command_for_workspace(workspace_root: &Path) -> String {
    ensure_workspace_meta(workspace_root)
        .map(|(workspace_meta, _)| {
            normalize_play_groove_command(&workspace_meta.play_groove_command)
                .unwrap_or_else(|_| default_play_groove_command())
        })
        .unwrap_or_else(|_| default_play_groove_command())
}

fn testing_ports_for_workspace(workspace_root: &Path) -> Vec<u16> {
    ensure_workspace_meta(workspace_root)
        .map(|(workspace_meta, _)| normalize_testing_ports_from_u16(&workspace_meta.testing_ports))
        .unwrap_or_else(|_| default_testing_ports())
}

fn run_local_command_for_workspace(workspace_root: &Path) -> Option<String> {
    ensure_workspace_meta(workspace_root)
        .ok()
        .and_then(|(workspace_meta, _)| {
            normalize_run_local_command(workspace_meta.run_local_command.as_deref()).unwrap_or(None)
        })
}

fn worktree_symlink_paths_for_workspace(workspace_root: &Path) -> Vec<String> {
    ensure_workspace_meta(workspace_root)
        .map(|(workspace_meta, _)| {
            normalize_worktree_symlink_paths(&workspace_meta.worktree_symlink_paths)
        })
        .unwrap_or_else(|_| default_worktree_symlink_paths())
}

fn create_symlink(source: &Path, destination: &Path) -> Result<(), std::io::Error> {
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(source, destination)
    }

    #[cfg(windows)]
    {
        if source.is_dir() {
            std::os::windows::fs::symlink_dir(source, destination)
        } else {
            std::os::windows::fs::symlink_file(source, destination)
        }
    }
}

fn apply_configured_worktree_symlinks(workspace_root: &Path, worktree_path: &Path) -> Vec<String> {
    let mut warnings = Vec::new();
    let configured_paths = worktree_symlink_paths_for_workspace(workspace_root);

    for relative_path in configured_paths {
        if is_restricted_worktree_symlink_path(&relative_path) {
            warnings.push(format!(
                "Skipped restricted symlink path \"{}\".",
                relative_path
            ));
            continue;
        }

        let source_path = workspace_root.join(&relative_path);
        if !source_path.exists() {
            continue;
        }

        let destination_path = worktree_path.join(&relative_path);
        if destination_path == source_path || destination_path.starts_with(&source_path) {
            warnings.push(format!(
                "Skipped symlink \"{}\" because it would create a recursive or self-referential link.",
                relative_path
            ));
            continue;
        }

        if destination_path.exists() || fs::symlink_metadata(&destination_path).is_ok() {
            continue;
        }

        if let Some(parent) = destination_path.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                warnings.push(format!(
                    "Could not prepare destination for symlink \"{}\": {error}",
                    relative_path
                ));
                continue;
            }
        }

        if let Err(error) = create_symlink(&source_path, &destination_path) {
            warnings.push(format!(
                "Could not symlink \"{}\" into worktree: {error}",
                relative_path
            ));
        }
    }

    warnings
}

fn global_settings_file(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;
    Ok(app_data_dir.join("global-settings.json"))
}

fn write_global_settings_file(path: &Path, global_settings: &GlobalSettings) -> Result<(), String> {
    let body = serde_json::to_string_pretty(global_settings)
        .map_err(|error| format!("Failed to serialize global settings: {error}"))?;
    fs::write(path, format!("{body}\n"))
        .map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

fn seed_global_settings_from_active_workspace(app: &AppHandle, settings: &mut GlobalSettings) {
    let Some(persisted_root) = read_persisted_active_workspace_root(app).ok().flatten() else {
        return;
    };
    let Ok(workspace_root) = validate_workspace_root_path(&persisted_root) else {
        return;
    };
    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    if !path_is_file(&workspace_json) {
        return;
    }

    if let Ok(workspace_meta) = read_workspace_meta_file(&workspace_json) {
        settings.telemetry_enabled = workspace_meta.telemetry_enabled;
        settings.disable_groove_loading_section = workspace_meta.disable_groove_loading_section;
        settings.show_fps = workspace_meta.show_fps;
    }
}

fn ensure_global_settings(app: &AppHandle) -> Result<GlobalSettings, String> {
    let settings_file = global_settings_file(app)?;
    if !path_is_file(&settings_file) {
        let mut settings = default_global_settings();
        seed_global_settings_from_active_workspace(app, &mut settings);
        write_global_settings_file(&settings_file, &settings)?;
        return Ok(settings);
    }

    let raw = fs::read_to_string(&settings_file)
        .map_err(|error| format!("Failed to read {}: {error}", settings_file.display()))?;
    let parsed = serde_json::from_str::<serde_json::Value>(&raw).map_err(|_| {
        let settings = default_global_settings();
        let _ = write_global_settings_file(&settings_file, &settings);
        format!(
            "Failed to parse {}. Recovered with defaults.",
            settings_file.display()
        )
    });

    let parsed = match parsed {
        Ok(value) => value,
        Err(_) => {
            return Ok(default_global_settings());
        }
    };

    let mut settings = match serde_json::from_value::<GlobalSettings>(parsed.clone()) {
        Ok(value) => value,
        Err(_) => {
            let settings = default_global_settings();
            let _ = write_global_settings_file(&settings_file, &settings);
            return Ok(settings);
        }
    };

    let mut should_write_back = parsed
        .as_object()
        .map(|obj| {
            !obj.contains_key("telemetryEnabled")
                || !obj.contains_key("disableGrooveLoadingSection")
                || !obj.contains_key("showFps")
                || !obj.contains_key("alwaysShowDiagnosticsSidebar")
                || !obj.contains_key("periodicRerenderEnabled")
                || !obj.contains_key("themeMode")
        })
        .unwrap_or(true);

    if let Ok(normalized_theme_mode) = normalize_theme_mode(&settings.theme_mode) {
        if normalized_theme_mode != settings.theme_mode {
            settings.theme_mode = normalized_theme_mode;
            should_write_back = true;
        }
    } else {
        settings.theme_mode = default_theme_mode();
        should_write_back = true;
    }

    if should_write_back {
        write_global_settings_file(&settings_file, &settings)?;
    }

    Ok(settings)
}

fn read_persisted_active_workspace_root(app: &AppHandle) -> Result<Option<String>, String> {
    let state_file = workspace_state_file(app)?;
    if !path_is_file(&state_file) {
        return Ok(None);
    }

    let raw = fs::read_to_string(&state_file)
        .map_err(|error| format!("Failed to read workspace state file: {error}"))?;
    let parsed = serde_json::from_str::<serde_json::Value>(&raw)
        .map_err(|error| format!("Failed to parse workspace state file: {error}"))?;

    let workspace_root = parsed
        .as_object()
        .and_then(|obj| obj.get("workspaceRoot"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    Ok(workspace_root)
}

fn persist_active_workspace_root(app: &AppHandle, workspace_root: &Path) -> Result<(), String> {
    let state_file = workspace_state_file(app)?;
    let payload = serde_json::json!({
        "workspaceRoot": workspace_root.display().to_string(),
        "updatedAt": now_iso(),
    });

    let body = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Failed to serialize workspace state file: {error}"))?;
    fs::write(&state_file, format!("{body}\n"))
        .map_err(|error| format!("Failed to write workspace state file: {error}"))
}

fn clear_persisted_active_workspace_root(app: &AppHandle) -> Result<(), String> {
    let state_file = workspace_state_file(app)?;
    if state_file.exists() {
        fs::remove_file(&state_file)
            .map_err(|error| format!("Failed to clear workspace state file: {error}"))?;
    }

    Ok(())
}

fn worktree_execution_state_file(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;
    Ok(app_data_dir.join("worktree-executions.json"))
}

fn read_persisted_worktree_execution_state(
    app: &AppHandle,
) -> Result<PersistedWorktreeExecutionState, String> {
    let state_file = worktree_execution_state_file(app)?;
    if !path_is_file(&state_file) {
        return Ok(PersistedWorktreeExecutionState::default());
    }

    let raw = fs::read_to_string(&state_file)
        .map_err(|error| format!("Failed to read worktree execution state file: {error}"))?;
    serde_json::from_str::<PersistedWorktreeExecutionState>(&raw)
        .map_err(|error| format!("Failed to parse worktree execution state file: {error}"))
}

fn write_persisted_worktree_execution_state(
    app: &AppHandle,
    state: &PersistedWorktreeExecutionState,
) -> Result<(), String> {
    let state_file = worktree_execution_state_file(app)?;
    let body = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Failed to serialize worktree execution state file: {error}"))?;
    fs::write(&state_file, format!("{body}\n"))
        .map_err(|error| format!("Failed to write worktree execution state file: {error}"))
}

fn record_worktree_last_executed_at(
    app: &AppHandle,
    workspace_root: &Path,
    worktree: &str,
) -> Result<(), String> {
    let mut state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    state
        .last_executed_at_by_workspace
        .entry(workspace_key)
        .or_default()
        .insert(worktree.to_string(), now_iso());
    write_persisted_worktree_execution_state(app, &state)
}

fn record_worktree_tombstone(
    app: &AppHandle,
    workspace_root: &Path,
    worktree: &str,
    worktree_path: &Path,
    branch_name: Option<String>,
) -> Result<(), String> {
    let mut state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    state
        .tombstones_by_workspace
        .entry(workspace_key)
        .or_default()
        .insert(
            worktree.to_string(),
            WorktreeTombstone {
                workspace_root: workspace_root.display().to_string(),
                worktree: worktree.to_string(),
                worktree_path: worktree_path.display().to_string(),
                branch_name,
                deleted_at: now_iso(),
            },
        );
    write_persisted_worktree_execution_state(app, &state)
}

fn clear_worktree_tombstone(
    app: &AppHandle,
    workspace_root: &Path,
    worktree: &str,
) -> Result<(), String> {
    let mut state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    let mut changed = false;
    let mut workspace_tombstones_empty = false;

    if let Some(workspace_tombstones) = state.tombstones_by_workspace.get_mut(&workspace_key) {
        if workspace_tombstones.remove(worktree).is_some() {
            changed = true;
        }
        workspace_tombstones_empty = workspace_tombstones.is_empty();
    }

    if workspace_tombstones_empty {
        state.tombstones_by_workspace.remove(&workspace_key);
        changed = true;
    }

    if changed {
        write_persisted_worktree_execution_state(app, &state)?;
    }

    Ok(())
}

fn clear_worktree_last_executed_at(
    app: &AppHandle,
    workspace_root: &Path,
    worktree: &str,
) -> Result<(), String> {
    let mut state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    let mut changed = false;
    let mut workspace_entries_empty = false;

    if let Some(workspace_entries) = state.last_executed_at_by_workspace.get_mut(&workspace_key) {
        if workspace_entries.remove(worktree).is_some() {
            changed = true;
        }
        workspace_entries_empty = workspace_entries.is_empty();
    }

    if workspace_entries_empty {
        state.last_executed_at_by_workspace.remove(&workspace_key);
        changed = true;
    }

    if changed {
        write_persisted_worktree_execution_state(app, &state)?;
    }

    Ok(())
}

fn read_worktree_tombstone(
    app: &AppHandle,
    workspace_root: &Path,
    worktree: &str,
) -> Result<Option<WorktreeTombstone>, String> {
    let state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    Ok(state
        .tombstones_by_workspace
        .get(&workspace_key)
        .and_then(|workspace_tombstones| workspace_tombstones.get(worktree))
        .cloned())
}

fn testing_environment_state_file(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;
    Ok(app_data_dir.join("testing-environment.json"))
}

fn read_persisted_testing_environment_state(
    app: &AppHandle,
) -> Result<PersistedTestingEnvironmentState, String> {
    let state_file = testing_environment_state_file(app)?;
    if !path_is_file(&state_file) {
        return Ok(PersistedTestingEnvironmentState::default());
    }

    let raw = fs::read_to_string(&state_file)
        .map_err(|error| format!("Failed to read testing environment state file: {error}"))?;
    serde_json::from_str::<PersistedTestingEnvironmentState>(&raw)
        .map_err(|error| format!("Failed to parse testing environment state file: {error}"))
}

fn write_persisted_testing_environment_state(
    app: &AppHandle,
    state: &PersistedTestingEnvironmentState,
) -> Result<(), String> {
    let state_file = testing_environment_state_file(app)?;
    let body = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Failed to serialize testing environment state file: {error}"))?;
    fs::write(&state_file, format!("{body}\n"))
        .map_err(|error| format!("Failed to write testing environment state file: {error}"))
}

fn clear_persisted_testing_environment_state(app: &AppHandle) -> Result<(), String> {
    let state_file = testing_environment_state_file(app)?;
    if state_file.exists() {
        fs::remove_file(&state_file)
            .map_err(|error| format!("Failed to clear testing environment state file: {error}"))?;
    }

    Ok(())
}

fn default_workspace_meta(workspace_root: &Path) -> WorkspaceMeta {
    let now = now_iso();
    WorkspaceMeta {
        version: 1,
        root_name: workspace_root
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| workspace_root.display().to_string()),
        created_at: now.clone(),
        updated_at: now,
        default_terminal: default_terminal_auto(),
        terminal_custom_command: None,
        telemetry_enabled: true,
        disable_groove_loading_section: false,
        show_fps: false,
        play_groove_command: default_play_groove_command(),
        testing_ports: default_testing_ports(),
        open_terminal_at_worktree_command: None,
        run_local_command: None,
        worktree_symlink_paths: default_worktree_symlink_paths(),
        consellour_settings: default_consellour_settings(),
        jira_settings: default_jira_settings(),
        tasks: Vec::new(),
    }
}

fn telemetry_enabled_for_app(app: &AppHandle) -> bool {
    ensure_global_settings(app)
        .map(|settings| settings.telemetry_enabled)
        .unwrap_or(true)
}

fn read_workspace_meta_file(path: &Path) -> Result<WorkspaceMeta, String> {
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    serde_json::from_str::<WorkspaceMeta>(&raw)
        .map_err(|error| format!("Failed to parse {}: {error}", path.display()))
}

fn write_workspace_meta_file(path: &Path, workspace_meta: &WorkspaceMeta) -> Result<(), String> {
    let body = serde_json::to_string_pretty(workspace_meta)
        .map_err(|error| format!("Failed to serialize workspace metadata: {error}"))?;
    fs::write(path, format!("{body}\n"))
        .map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

fn ensure_workspace_meta(workspace_root: &Path) -> Result<(WorkspaceMeta, String), String> {
    let groove_dir = workspace_root.join(".groove");
    fs::create_dir_all(&groove_dir)
        .map_err(|error| format!("Failed to create {}: {error}", groove_dir.display()))?;

    let workspace_json = groove_dir.join("workspace.json");
    if !path_is_file(&workspace_json) {
        let workspace_meta = default_workspace_meta(workspace_root);
        write_workspace_meta_file(&workspace_json, &workspace_meta)?;
        return Ok((
            workspace_meta,
            "Created .groove/workspace.json.".to_string(),
        ));
    }

    match read_workspace_meta_file(&workspace_json) {
        Ok(mut workspace_meta) => {
            let expected_root_name = default_workspace_meta(workspace_root).root_name;
            let mut did_update = false;
            let parsed_workspace_json = fs::read_to_string(&workspace_json)
                .ok()
                .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok());
            let has_telemetry_enabled = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("telemetryEnabled"))
                .unwrap_or(true);
            let has_disable_groove_loading_section = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("disableGrooveLoadingSection"))
                .unwrap_or(true);
            let has_show_fps = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("showFps"))
                .unwrap_or(true);
            let has_play_groove_command = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("playGrooveCommand"))
                .unwrap_or(true);
            let has_testing_ports = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("testingPorts"))
                .unwrap_or(true);
            let has_run_local_command = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("runLocalCommand"))
                .unwrap_or(true);
            let has_worktree_symlink_paths = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("worktreeSymlinkPaths"))
                .unwrap_or(true);
            let has_consellour_settings = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("consellourSettings"))
                .unwrap_or(true);
            let has_jira_settings = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("jiraSettings"))
                .unwrap_or(true);
            let has_tasks = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("tasks"))
                .unwrap_or(true);
            if workspace_meta.root_name != expected_root_name {
                workspace_meta.root_name = expected_root_name;
                did_update = true;
            }

            if let Ok(normalized) = normalize_default_terminal(&workspace_meta.default_terminal) {
                if normalized != workspace_meta.default_terminal {
                    workspace_meta.default_terminal = normalized;
                    did_update = true;
                }
            } else {
                workspace_meta.default_terminal = default_terminal_auto();
                did_update = true;
            }

            let normalized_custom_command = workspace_meta
                .terminal_custom_command
                .as_ref()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());
            if workspace_meta.terminal_custom_command != normalized_custom_command {
                workspace_meta.terminal_custom_command = normalized_custom_command;
                did_update = true;
            }

            if !has_telemetry_enabled {
                workspace_meta.telemetry_enabled = true;
                did_update = true;
            }

            if !has_disable_groove_loading_section {
                workspace_meta.disable_groove_loading_section = false;
                did_update = true;
            }

            if !has_show_fps {
                workspace_meta.show_fps = false;
                did_update = true;
            }

            match normalize_play_groove_command(&workspace_meta.play_groove_command) {
                Ok(normalized_play_groove_command) => {
                    if normalized_play_groove_command != workspace_meta.play_groove_command {
                        workspace_meta.play_groove_command = normalized_play_groove_command;
                        did_update = true;
                    }
                }
                Err(_) => {
                    workspace_meta.play_groove_command = default_play_groove_command();
                    did_update = true;
                }
            }

            let normalized_testing_ports =
                normalize_testing_ports_from_u16(&workspace_meta.testing_ports);
            if normalized_testing_ports != workspace_meta.testing_ports {
                workspace_meta.testing_ports = normalized_testing_ports;
                did_update = true;
            }

            let normalized_open_terminal_at_worktree_command =
                normalize_open_terminal_at_worktree_command(
                    workspace_meta.open_terminal_at_worktree_command.as_deref(),
                )
                .unwrap_or(None);
            if workspace_meta.open_terminal_at_worktree_command
                != normalized_open_terminal_at_worktree_command
            {
                workspace_meta.open_terminal_at_worktree_command =
                    normalized_open_terminal_at_worktree_command;
                did_update = true;
            }

            let normalized_run_local_command =
                normalize_run_local_command(workspace_meta.run_local_command.as_deref())
                    .unwrap_or(None);
            if workspace_meta.run_local_command != normalized_run_local_command {
                workspace_meta.run_local_command = normalized_run_local_command;
                did_update = true;
            }

            let normalized_worktree_symlink_paths =
                normalize_worktree_symlink_paths(&workspace_meta.worktree_symlink_paths);
            if workspace_meta.worktree_symlink_paths != normalized_worktree_symlink_paths {
                workspace_meta.worktree_symlink_paths = normalized_worktree_symlink_paths;
                did_update = true;
            }

            let normalized_model =
                normalize_consellour_model(&workspace_meta.consellour_settings.model)
                    .unwrap_or_else(|_| default_consellour_model());
            if workspace_meta.consellour_settings.model != normalized_model {
                workspace_meta.consellour_settings.model = normalized_model;
                workspace_meta.consellour_settings.updated_at = now_iso();
                did_update = true;
            }

            let normalized_reasoning_level = normalize_consellour_reasoning_level(
                &workspace_meta.consellour_settings.reasoning_level,
            )
            .unwrap_or_else(|_| default_consellour_reasoning_level());
            if workspace_meta.consellour_settings.reasoning_level != normalized_reasoning_level {
                workspace_meta.consellour_settings.reasoning_level = normalized_reasoning_level;
                workspace_meta.consellour_settings.updated_at = now_iso();
                did_update = true;
            }

            let normalized_openai_api_key = normalize_openai_api_key(
                workspace_meta.consellour_settings.openai_api_key.as_deref(),
            )
            .unwrap_or(None);
            if workspace_meta.consellour_settings.openai_api_key != normalized_openai_api_key {
                workspace_meta.consellour_settings.openai_api_key = normalized_openai_api_key;
                workspace_meta.consellour_settings.updated_at = now_iso();
                did_update = true;
            }

            let normalized_jira_settings = normalize_jira_settings(&workspace_meta.jira_settings)
                .unwrap_or_else(|_| default_jira_settings());
            if workspace_meta.jira_settings.enabled != normalized_jira_settings.enabled
                || workspace_meta.jira_settings.site_url != normalized_jira_settings.site_url
                || workspace_meta.jira_settings.account_email
                    != normalized_jira_settings.account_email
                || workspace_meta.jira_settings.default_project_key
                    != normalized_jira_settings.default_project_key
                || workspace_meta.jira_settings.jql != normalized_jira_settings.jql
                || workspace_meta.jira_settings.sync_enabled
                    != normalized_jira_settings.sync_enabled
                || workspace_meta.jira_settings.sync_open_issues_only
                    != normalized_jira_settings.sync_open_issues_only
                || workspace_meta.jira_settings.last_sync_at
                    != normalized_jira_settings.last_sync_at
                || workspace_meta.jira_settings.last_sync_error
                    != normalized_jira_settings.last_sync_error
            {
                workspace_meta.jira_settings = normalized_jira_settings;
                did_update = true;
            }

            let mut normalized_tasks = workspace_meta.tasks.clone();
            let mut normalized_any_task = false;
            for task in &mut normalized_tasks {
                if task.id.trim().is_empty() {
                    task.id = Uuid::new_v4().to_string();
                    normalized_any_task = true;
                }

                let normalized_title = normalize_task_title(&task.title).unwrap_or_else(|_| {
                    normalized_any_task = true;
                    "Untitled task".to_string()
                });
                if task.title != normalized_title {
                    task.title = normalized_title;
                    normalized_any_task = true;
                }

                let normalized_description = normalize_task_description(&task.description)
                    .unwrap_or_else(|_| {
                        normalized_any_task = true;
                        "Task details were unavailable and have been reset.".to_string()
                    });
                if task.description != normalized_description {
                    task.description = normalized_description;
                    normalized_any_task = true;
                }

                let normalized_external_id =
                    normalize_optional_external_id(task.external_id.as_deref()).unwrap_or(None);
                if task.external_id != normalized_external_id {
                    task.external_id = normalized_external_id;
                    normalized_any_task = true;
                }

                let normalized_external_url =
                    normalize_optional_external_url(task.external_url.as_deref()).unwrap_or(None);
                if task.external_url != normalized_external_url {
                    task.external_url = normalized_external_url;
                    normalized_any_task = true;
                }
            }
            if normalized_any_task {
                workspace_meta.tasks = normalized_tasks;
                did_update = true;
            }

            if !has_play_groove_command {
                workspace_meta.play_groove_command = default_play_groove_command();
                did_update = true;
            }

            if !has_testing_ports {
                workspace_meta.testing_ports = default_testing_ports();
                did_update = true;
            }

            if !has_run_local_command {
                workspace_meta.run_local_command = None;
                did_update = true;
            }

            if !has_worktree_symlink_paths {
                workspace_meta.worktree_symlink_paths = default_worktree_symlink_paths();
                did_update = true;
            }

            if !has_consellour_settings {
                workspace_meta.consellour_settings = default_consellour_settings();
                did_update = true;
            }

            if !has_jira_settings {
                workspace_meta.jira_settings = default_jira_settings();
                did_update = true;
            }

            if !has_tasks {
                workspace_meta.tasks = Vec::new();
                did_update = true;
            }

            if did_update {
                workspace_meta.updated_at = now_iso();
                write_workspace_meta_file(&workspace_json, &workspace_meta)?;
            }

            Ok((
                workspace_meta,
                "Loaded existing .groove/workspace.json.".to_string(),
            ))
        }
        Err(_) => {
            let workspace_meta = default_workspace_meta(workspace_root);
            write_workspace_meta_file(&workspace_json, &workspace_meta)?;
            Ok((
                workspace_meta,
                "Recovered corrupt .groove/workspace.json by recreating defaults.".to_string(),
            ))
        }
    }
}
