fn command_cwd() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"))
}

fn open_url_in_default_browser(url: &str) -> Result<(), String> {
    let cwd = command_cwd();

    #[cfg(target_os = "linux")]
    {
        return Command::new("xdg-open")
            .arg(url)
            .current_dir(cwd)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Failed to launch xdg-open: {error}"));
    }

    #[cfg(target_os = "macos")]
    {
        return Command::new("open")
            .arg(url)
            .current_dir(cwd)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Failed to launch open: {error}"));
    }

    #[cfg(target_os = "windows")]
    {
        return Command::new("cmd")
            .args(["/C", "start", "", url])
            .current_dir(cwd)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Failed to launch cmd start: {error}"));
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        let _ = (cwd, url);
        Err("Opening browser is unsupported on this platform.".to_string())
    }
}

fn validate_existing_path(path: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path.trim());
    if !candidate.is_absolute() {
        return Err("path must be an absolute path.".to_string());
    }

    if !candidate.exists() {
        return Err(format!("path \"{}\" does not exist.", candidate.display()));
    }

    Ok(candidate)
}

fn git_repository_root_from_path(path: &Path) -> Result<PathBuf, String> {
    let cwd = if path_is_directory(path) {
        path.to_path_buf()
    } else {
        path.parent().unwrap_or(path).to_path_buf()
    };

    let result = run_capture_command(&cwd, "git", &["rev-parse", "--show-toplevel"]);
    if let Some(error) = result.error.clone() {
        return Err(format!("Failed to resolve git repository root: {error}"));
    }
    if result.exit_code != Some(0) {
        return Err("Could not resolve git repository root from the provided path.".to_string());
    }

    let Some(root) = first_non_empty_line(&result.stdout) else {
        return Err("Git repository root could not be determined.".to_string());
    };

    Ok(PathBuf::from(root))
}

fn resolve_remote_url_with_fallback(repository_root: &Path) -> Option<(String, String)> {
    let origin = run_capture_command(repository_root, "git", &["remote", "get-url", "origin"]);
    if origin.error.is_none() && origin.exit_code == Some(0) {
        if let Some(url) = first_non_empty_line(&origin.stdout) {
            return Some(("origin".to_string(), url));
        }
    }

    let remotes_result = run_capture_command(repository_root, "git", &["remote"]);
    if remotes_result.error.is_some() || remotes_result.exit_code != Some(0) {
        return None;
    }

    let remote_name = remotes_result
        .stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.to_string())?;

    let remote_result =
        run_capture_command(repository_root, "git", &["remote", "get-url", &remote_name]);
    if remote_result.error.is_some() || remote_result.exit_code != Some(0) {
        return None;
    }

    first_non_empty_line(&remote_result.stdout).map(|url| (remote_name, url))
}

fn normalize_remote_repo_info(remote_url: &str) -> Option<(String, String, String)> {
    git_gh::normalize_remote_repo_info(remote_url)
}

fn normalize_gh_hostname(hostname: Option<&str>) -> Option<String> {
    git_gh::normalize_gh_hostname(hostname)
}

fn infer_gh_host_hint_from_payload(payload: &GhAuthStatusPayload, cwd: &Path) -> Option<String> {
    if let Some((host, _, _)) = payload
        .remote_url
        .as_deref()
        .and_then(normalize_remote_repo_info)
    {
        return Some(host);
    }

    let repo_root = payload
        .path
        .as_deref()
        .and_then(|value| validate_existing_path(value).ok())
        .and_then(|value| git_repository_root_from_path(&value).ok());

    if let Some(root) = repo_root {
        if let Some(remote_url) = repository_remote_url(&root) {
            if let Some((host, _, _)) = normalize_remote_repo_info(&remote_url) {
                return Some(host);
            }
        }
    }

    if let Some(remote_url) = repository_remote_url(cwd) {
        if let Some((host, _, _)) = normalize_remote_repo_info(&remote_url) {
            return Some(host);
        }
    }

    None
}

fn parse_gh_auth_identity(
    output: &str,
    preferred_host: Option<&str>,
) -> (Option<String>, Option<String>) {
    git_gh::parse_gh_auth_identity(output, preferred_host)
}

fn gh_api_user_login(cwd: &Path, hostname: Option<&str>) -> Option<String> {
    let result = if let Some(hostname) = hostname.map(str::trim).filter(|value| !value.is_empty()) {
        run_capture_command(
            cwd,
            "gh",
            &["api", "user", "--hostname", hostname, "--jq", ".login"],
        )
    } else {
        run_capture_command(cwd, "gh", &["api", "user", "--jq", ".login"])
    };

    if result.error.is_some() || result.exit_code != Some(0) {
        return None;
    }

    first_non_empty_line(&result.stdout)
        .map(|value| value.trim_matches('"').trim().to_string())
        .filter(|value| !value.is_empty() && value != "null")
}

fn parse_first_url(value: &str) -> Option<String> {
    git_gh::parse_first_url(value)
}

fn normalize_gh_repository(
    owner: &str,
    repo: &str,
    hostname: Option<&str>,
) -> Result<String, String> {
    git_gh::normalize_gh_repository(owner, repo, hostname)
}

fn validate_gh_branch_action_payload(
    payload: &GhBranchActionPayload,
) -> Result<(PathBuf, String), String> {
    let branch = payload.branch.trim();
    if branch.is_empty() {
        return Err("branch must be a non-empty string.".to_string());
    }

    let path = validate_existing_path(&payload.path)?;
    let repository_root = git_repository_root_from_path(&path)?;

    Ok((repository_root, branch.to_string()))
}

fn validate_git_worktree_path(path: &str) -> Result<PathBuf, String> {
    let candidate = validate_existing_path(path)?;
    if !path_is_directory(&candidate) {
        return Err("path must point to an existing directory.".to_string());
    }

    let result = Command::new("git")
        .arg("-C")
        .arg(&candidate)
        .args(["rev-parse", "--is-inside-work-tree"])
        .output();

    match result {
        Ok(output) => {
            if output.status.code() == Some(0)
                && String::from_utf8_lossy(&output.stdout).trim() == "true"
            {
                Ok(candidate)
            } else {
                Err(format!(
                    "path \"{}\" is not an active git worktree.",
                    candidate.display()
                ))
            }
        }
        Err(error) => Err(format!("Failed to execute git: {error}")),
    }
}

fn run_git_command_at_path(path: &Path, args: &[&str]) -> CommandResult {
    let output = Command::new("git").arg("-C").arg(path).args(args).output();

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
            error: Some(format!("Failed to execute git: {error}")),
        },
    }
}

fn run_git_command_at_path_with_args(path: &Path, args: &[String]) -> CommandResult {
    let output = Command::new("git").arg("-C").arg(path).args(args).output();

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
            error: Some(format!("Failed to execute git: {error}")),
        },
    }
}

fn command_output_snippet(result: &CommandResult) -> Option<String> {
    first_non_empty_line(&result.stdout)
        .or_else(|| first_non_empty_line(&result.stderr))
        .map(|line| {
            let trimmed = line.trim();
            let prefix = trimmed.chars().take(160).collect::<String>();
            if prefix.len() < trimmed.len() {
                format!("{prefix}...")
            } else {
                trimmed.to_string()
            }
        })
}

fn parse_git_porcelain_counts(output: &str) -> git_gh::GitPorcelainCounts {
    git_gh::parse_git_porcelain_counts(output)
}

fn parse_git_ahead_behind(status_sb_output: &str) -> (u32, u32) {
    git_gh::parse_git_ahead_behind(status_sb_output)
}

fn parse_git_file_states(output: &str) -> (Vec<String>, Vec<String>, Vec<String>) {
    git_gh::parse_git_file_states(output)
}

fn normalize_git_file_list(files: &[String]) -> Result<Vec<String>, String> {
    git_gh::normalize_git_file_list(files)
}

fn resolve_workspace_root(
    app: &AppHandle,
    root_name: &Option<String>,
    required_worktree: Option<&str>,
    known_worktrees: &[String],
    workspace_meta: &Option<WorkspaceMetaContext>,
) -> Result<PathBuf, String> {
    if let Some(active_workspace_root) = read_persisted_active_workspace_root(app)
        .ok()
        .flatten()
        .and_then(|value| validate_workspace_root_path(&value).ok())
    {
        if inspect_candidate_root(
            &active_workspace_root,
            required_worktree,
            known_worktrees,
            workspace_meta,
        )
        .is_some()
        {
            return Ok(active_workspace_root);
        }
    }

    let Some(root_name) = root_name
        .as_ref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    else {
        return Err(
            "Could not auto-resolve workspace root: no active workspace is selected.".to_string(),
        );
    };

    if !is_valid_root_name(root_name) {
        return Err("rootName contains invalid path characters.".to_string());
    }

    let candidates = discover_workspace_root_candidates(
        root_name,
        required_worktree,
        known_worktrees,
        workspace_meta,
    );

    if candidates.len() == 1 {
        return Ok(candidates[0].root_path.clone());
    }

    if candidates.is_empty() {
        return Err(format!(
            "Could not auto-resolve workspace root for rootName \"{}\".",
            root_name
        ));
    }

    let metadata_matches = candidates
        .iter()
        .filter(|candidate| candidate.matches_workspace_meta)
        .collect::<Vec<_>>();
    if metadata_matches.len() == 1 {
        return Ok(metadata_matches[0].root_path.clone());
    }

    let candidates_with_meta = candidates
        .iter()
        .filter(|candidate| candidate.has_workspace_meta)
        .collect::<Vec<_>>();
    let diagnostics = if metadata_matches.len() > 1 {
        metadata_matches
    } else if !candidates_with_meta.is_empty() {
        candidates_with_meta
    } else {
        candidates.iter().collect::<Vec<_>>()
    };

    let preview = diagnostics
        .iter()
        .take(5)
        .map(|candidate| candidate.root_path.display().to_string())
        .collect::<Vec<_>>()
        .join(", ");

    Err(format!(
        "Could not auto-resolve workspace root: found {} matches ({}).",
        candidates.len(),
        preview
    ))
}

