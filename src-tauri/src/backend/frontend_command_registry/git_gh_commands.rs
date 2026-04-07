#[tauri::command]
fn git_auth_status(payload: GitAuthStatusPayload) -> GitAuthStatusResponse {
    let request_id = request_id();
    let workspace_root = match validate_workspace_root_path(&payload.workspace_root) {
        Ok(root) => root,
        Err(error) => {
            return GitAuthStatusResponse {
                request_id,
                ok: false,
                workspace_root: None,
                profile: GitProfileStatus::default(),
                ssh_status: GitSshStatus::unknown(),
                error: Some(error),
            }
        }
    };

    let mut profile = GitProfileStatus::default();
    let mut ssh_status = GitSshStatus::unknown();

    let user_name_result =
        run_capture_command(&workspace_root, "git", &["config", "--get", "user.name"]);
    if user_name_result.error.is_none() && user_name_result.exit_code == Some(0) {
        profile.user_name = first_non_empty_line(&user_name_result.stdout);
    }

    let user_email_result =
        run_capture_command(&workspace_root, "git", &["config", "--get", "user.email"]);
    if user_email_result.error.is_none() && user_email_result.exit_code == Some(0) {
        profile.user_email = first_non_empty_line(&user_email_result.stdout);
    }

    let ssh_test_result = run_capture_command_timeout(
        &workspace_root,
        "ssh",
        &[
            "-T",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=5",
            "-o",
            "StrictHostKeyChecking=no",
            "-o",
            "UserKnownHostsFile=/dev/null",
            "git@github.com",
        ],
        Duration::from_secs(8),
    );
    let combined_output = format!("{}\n{}", ssh_test_result.stdout, ssh_test_result.stderr);
    let combined_lower = combined_output.to_lowercase();

    if combined_lower.contains("successfully authenticated") {
        ssh_status.state = "authenticated".to_string();
        ssh_status.message = "Authenticated with GitHub over SSH".to_string();
    } else if combined_lower.contains("permission denied")
        || combined_lower.contains("publickey")
        || combined_lower.contains("authentication failed")
    {
        ssh_status.state = "unauthenticated".to_string();
        ssh_status.message = "SSH authentication failed".to_string();
    } else if combined_lower.contains("connection timed out")
        || combined_lower.contains("operation timed out")
        || ssh_test_result
            .error
            .as_ref()
            .map(|value| value.to_lowercase().contains("timed out"))
            .unwrap_or(false)
    {
        ssh_status.state = "unreachable".to_string();
        ssh_status.message = "GitHub SSH check timed out".to_string();
    } else if combined_lower.contains("could not resolve hostname")
        || combined_lower.contains("temporary failure in name resolution")
        || combined_lower.contains("name or service not known")
        || combined_lower.contains("network is unreachable")
        || combined_lower.contains("no route to host")
        || combined_lower.contains("connection refused")
        || combined_lower.contains("connection closed")
        || combined_lower.contains("connection reset")
    {
        ssh_status.state = "unreachable".to_string();
        ssh_status.message = "GitHub SSH endpoint unreachable".to_string();
    } else if let Some(error) = ssh_test_result.error {
        let lower_error = error.to_lowercase();
        if lower_error.contains("no such file or directory") {
            ssh_status.state = "unavailable".to_string();
            ssh_status.message = "OpenSSH is not installed".to_string();
        } else {
            ssh_status.state = "unknown".to_string();
            ssh_status.message = "SSH check unavailable".to_string();
        }
    } else {
        ssh_status.state = "unknown".to_string();
        ssh_status.message = "SSH status unavailable".to_string();
    }

    GitAuthStatusResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        profile,
        ssh_status,
        error: None,
    }
}

#[tauri::command]
fn git_status(payload: GitPathPayload) -> GitStatusResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitStatusResponse {
                request_id,
                ok: false,
                path: None,
                modified: 0,
                added: 0,
                deleted: 0,
                untracked: 0,
                dirty: false,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(&worktree_path, &["status", "--porcelain=v1"]);
    if let Some(error) = result.error.clone() {
        return GitStatusResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            modified: 0,
            added: 0,
            deleted: 0,
            untracked: 0,
            dirty: false,
            output_snippet: None,
            error: Some(error),
        };
    }
    if result.exit_code != Some(0) {
        return GitStatusResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            modified: 0,
            added: 0,
            deleted: 0,
            untracked: 0,
            dirty: false,
            output_snippet: command_output_snippet(&result),
            error: Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git status failed".to_string()),
            ),
        };
    }

    let counts = parse_git_porcelain_counts(&result.stdout);
    GitStatusResponse {
        request_id,
        ok: true,
        path: Some(worktree_path.display().to_string()),
        modified: counts.modified,
        added: counts.added,
        deleted: counts.deleted,
        untracked: counts.untracked,
        dirty: counts.dirty(),
        output_snippet: command_output_snippet(&result),
        error: None,
    }
}

#[tauri::command]
fn git_current_branch(payload: GitPathPayload) -> GitCurrentBranchResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCurrentBranchResponse {
                request_id,
                ok: false,
                path: None,
                branch: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(&worktree_path, &["branch", "--show-current"]);
    if let Some(error) = result.error {
        return GitCurrentBranchResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            branch: None,
            output_snippet: None,
            error: Some(error),
        };
    }
    if result.exit_code != Some(0) {
        return GitCurrentBranchResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            branch: None,
            output_snippet: command_output_snippet(&result),
            error: Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git branch --show-current failed".to_string()),
            ),
        };
    }

    GitCurrentBranchResponse {
        request_id,
        ok: true,
        path: Some(worktree_path.display().to_string()),
        branch: first_non_empty_line(&result.stdout),
        output_snippet: command_output_snippet(&result),
        error: None,
    }
}

#[tauri::command]
fn git_list_branches(payload: GitPathPayload) -> GitListBranchesResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitListBranchesResponse {
                request_id,
                ok: false,
                path: None,
                branches: Vec::new(),
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(&worktree_path, &["branch", "--format=%(refname:short)"]);
    if let Some(error) = result.error.clone() {
        return GitListBranchesResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            branches: Vec::new(),
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }
    if result.exit_code != Some(0) {
        return GitListBranchesResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            branches: Vec::new(),
            output_snippet: command_output_snippet(&result),
            error: Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git branch --format failed".to_string()),
            ),
        };
    }

    let branches = result
        .stdout
        .lines()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();

    GitListBranchesResponse {
        request_id,
        ok: true,
        path: Some(worktree_path.display().to_string()),
        branches,
        output_snippet: command_output_snippet(&result),
        error: None,
    }
}

#[tauri::command]
fn git_ahead_behind(payload: GitPathPayload) -> GitAheadBehindResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitAheadBehindResponse {
                request_id,
                ok: false,
                path: None,
                ahead: 0,
                behind: 0,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(&worktree_path, &["status", "-sb"]);
    if let Some(error) = result.error {
        return GitAheadBehindResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            ahead: 0,
            behind: 0,
            output_snippet: None,
            error: Some(error),
        };
    }
    if result.exit_code != Some(0) {
        return GitAheadBehindResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            ahead: 0,
            behind: 0,
            output_snippet: command_output_snippet(&result),
            error: Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git status -sb failed".to_string()),
            ),
        };
    }

    let (ahead, behind) = parse_git_ahead_behind(&result.stdout);
    GitAheadBehindResponse {
        request_id,
        ok: true,
        path: Some(worktree_path.display().to_string()),
        ahead,
        behind,
        output_snippet: command_output_snippet(&result),
        error: None,
    }
}

#[tauri::command]
fn git_pull(payload: GitPullPayload) -> GitCommandResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: None,
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let args = if payload.rebase {
        vec!["pull", "--rebase"]
    } else {
        vec!["pull"]
    };
    let result = run_git_command_at_path(&worktree_path, &args);
    if let Some(error) = result.error.clone() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }

    let ok = result.exit_code == Some(0);
    GitCommandResponse {
        request_id,
        ok,
        path: Some(worktree_path.display().to_string()),
        exit_code: result.exit_code,
        output_snippet: command_output_snippet(&result),
        error: if ok {
            None
        } else {
            Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git pull failed".to_string()),
            )
        },
    }
}

#[tauri::command]
fn git_push(payload: GitPushPayload) -> GitCommandResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: None,
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let mut args = vec!["push"];
    if payload.force_with_lease {
        args.push("--force-with-lease");
    }

    if payload.set_upstream {
        let branch = payload
            .branch
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string())
            .or_else(|| {
                let current_branch =
                    run_git_command_at_path(&worktree_path, &["branch", "--show-current"]);
                first_non_empty_line(&current_branch.stdout)
            });

        let Some(branch) = branch else {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: Some(worktree_path.display().to_string()),
                exit_code: None,
                output_snippet: None,
                error: Some("branch is required when setUpstream is enabled.".to_string()),
            };
        };

        args.extend(["-u", "origin"]);
        args.push(branch.as_str());

        let result = run_git_command_at_path(&worktree_path, &args);
        if let Some(error) = result.error.clone() {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: Some(worktree_path.display().to_string()),
                exit_code: result.exit_code,
                output_snippet: command_output_snippet(&result),
                error: Some(error),
            };
        }

        let ok = result.exit_code == Some(0);
        return GitCommandResponse {
            request_id,
            ok,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: if ok {
                None
            } else {
                Some(
                    first_non_empty_line(&result.stderr)
                        .or_else(|| first_non_empty_line(&result.stdout))
                        .unwrap_or_else(|| "git push failed".to_string()),
                )
            },
        };
    }

    let result = run_git_command_at_path(&worktree_path, &args);
    if let Some(error) = result.error.clone() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }

    let ok = result.exit_code == Some(0);
    GitCommandResponse {
        request_id,
        ok,
        path: Some(worktree_path.display().to_string()),
        exit_code: result.exit_code,
        output_snippet: command_output_snippet(&result),
        error: if ok {
            None
        } else {
            Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git push failed".to_string()),
            )
        },
    }
}

#[tauri::command]
fn git_merge(payload: GitMergePayload) -> GitCommandResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: None,
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let target_branch = payload.target_branch.trim();
    if target_branch.is_empty() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: None,
            output_snippet: None,
            error: Some("targetBranch must be a non-empty string.".to_string()),
        };
    }

    let result = if payload.ff_only {
        run_git_command_at_path(&worktree_path, &["merge", "--ff-only", target_branch])
    } else {
        run_git_command_at_path(&worktree_path, &["merge", target_branch])
    };

    if let Some(error) = result.error.clone() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }

    let ok = result.exit_code == Some(0);
    GitCommandResponse {
        request_id,
        ok,
        path: Some(worktree_path.display().to_string()),
        exit_code: result.exit_code,
        output_snippet: command_output_snippet(&result),
        error: if ok {
            None
        } else {
            Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git merge failed".to_string()),
            )
        },
    }
}

#[tauri::command]
fn git_merge_abort(payload: GitPathPayload) -> GitCommandResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: None,
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(&worktree_path, &["merge", "--abort"]);
    if let Some(error) = result.error.clone() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }

    let ok = result.exit_code == Some(0);
    GitCommandResponse {
        request_id,
        ok,
        path: Some(worktree_path.display().to_string()),
        exit_code: result.exit_code,
        output_snippet: command_output_snippet(&result),
        error: if ok {
            None
        } else {
            Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git merge --abort failed".to_string()),
            )
        },
    }
}

#[tauri::command]
fn git_has_staged_changes(payload: GitPathPayload) -> GitBooleanResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitBooleanResponse {
                request_id,
                ok: false,
                path: None,
                value: false,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(&worktree_path, &["diff", "--cached", "--name-only"]);
    if let Some(error) = result.error {
        return GitBooleanResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            value: false,
            output_snippet: None,
            error: Some(error),
        };
    }
    if result.exit_code != Some(0) {
        return GitBooleanResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            value: false,
            output_snippet: command_output_snippet(&result),
            error: Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git diff --cached --name-only failed".to_string()),
            ),
        };
    }

    GitBooleanResponse {
        request_id,
        ok: true,
        path: Some(worktree_path.display().to_string()),
        value: result.stdout.lines().any(|line| !line.trim().is_empty()),
        output_snippet: command_output_snippet(&result),
        error: None,
    }
}

#[tauri::command]
fn git_merge_in_progress(payload: GitPathPayload) -> GitBooleanResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitBooleanResponse {
                request_id,
                ok: false,
                path: None,
                value: false,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(
        &worktree_path,
        &["rev-parse", "-q", "--verify", "MERGE_HEAD"],
    );
    if let Some(error) = result.error {
        return GitBooleanResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            value: false,
            output_snippet: None,
            error: Some(error),
        };
    }

    if result.exit_code == Some(0) {
        return GitBooleanResponse {
            request_id,
            ok: true,
            path: Some(worktree_path.display().to_string()),
            value: true,
            output_snippet: command_output_snippet(&result),
            error: None,
        };
    }

    if result.exit_code == Some(1) {
        return GitBooleanResponse {
            request_id,
            ok: true,
            path: Some(worktree_path.display().to_string()),
            value: false,
            output_snippet: command_output_snippet(&result),
            error: None,
        };
    }

    GitBooleanResponse {
        request_id,
        ok: false,
        path: Some(worktree_path.display().to_string()),
        value: false,
        output_snippet: command_output_snippet(&result),
        error: Some(
            first_non_empty_line(&result.stderr)
                .or_else(|| first_non_empty_line(&result.stdout))
                .unwrap_or_else(|| "git rev-parse -q --verify MERGE_HEAD failed".to_string()),
        ),
    }
}

#[tauri::command]
fn git_has_upstream(payload: GitPathPayload) -> GitBooleanResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitBooleanResponse {
                request_id,
                ok: false,
                path: None,
                value: false,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(
        &worktree_path,
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
    );
    if let Some(error) = result.error {
        return GitBooleanResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            value: false,
            output_snippet: None,
            error: Some(error),
        };
    }

    if result.exit_code == Some(0) {
        return GitBooleanResponse {
            request_id,
            ok: true,
            path: Some(worktree_path.display().to_string()),
            value: true,
            output_snippet: command_output_snippet(&result),
            error: None,
        };
    }

    GitBooleanResponse {
        request_id,
        ok: true,
        path: Some(worktree_path.display().to_string()),
        value: false,
        output_snippet: command_output_snippet(&result),
        error: None,
    }
}

#[tauri::command]
fn git_list_file_states(payload: GitPathPayload) -> GitFileStatesResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitFileStatesResponse {
                request_id,
                ok: false,
                path: None,
                staged: Vec::new(),
                unstaged: Vec::new(),
                untracked: Vec::new(),
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(&worktree_path, &["status", "--porcelain=v1"]);
    if let Some(error) = result.error.clone() {
        return GitFileStatesResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            staged: Vec::new(),
            unstaged: Vec::new(),
            untracked: Vec::new(),
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }
    if result.exit_code != Some(0) {
        return GitFileStatesResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            staged: Vec::new(),
            unstaged: Vec::new(),
            untracked: Vec::new(),
            output_snippet: command_output_snippet(&result),
            error: Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git status --porcelain=v1 failed".to_string()),
            ),
        };
    }

    let (staged, unstaged, untracked) = parse_git_file_states(&result.stdout);
    GitFileStatesResponse {
        request_id,
        ok: true,
        path: Some(worktree_path.display().to_string()),
        staged,
        unstaged,
        untracked,
        output_snippet: command_output_snippet(&result),
        error: None,
    }
}

#[tauri::command]
fn git_stage_files(payload: GitFilesPayload) -> GitCommandResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: None,
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };
    let files = match normalize_git_file_list(&payload.files) {
        Ok(files) => files,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: Some(worktree_path.display().to_string()),
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let mut args = vec!["add".to_string(), "--".to_string()];
    args.extend(files);
    let result = run_git_command_at_path_with_args(&worktree_path, &args);
    if let Some(error) = result.error.clone() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }

    let ok = result.exit_code == Some(0);
    GitCommandResponse {
        request_id,
        ok,
        path: Some(worktree_path.display().to_string()),
        exit_code: result.exit_code,
        output_snippet: command_output_snippet(&result),
        error: if ok {
            None
        } else {
            Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git add -- failed".to_string()),
            )
        },
    }
}

#[tauri::command]
fn git_unstage_files(payload: GitFilesPayload) -> GitCommandResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: None,
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };
    let files = match normalize_git_file_list(&payload.files) {
        Ok(files) => files,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: Some(worktree_path.display().to_string()),
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let mut args = vec![
        "restore".to_string(),
        "--staged".to_string(),
        "--".to_string(),
    ];
    args.extend(files);
    let result = run_git_command_at_path_with_args(&worktree_path, &args);
    if let Some(error) = result.error.clone() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }

    let ok = result.exit_code == Some(0);
    GitCommandResponse {
        request_id,
        ok,
        path: Some(worktree_path.display().to_string()),
        exit_code: result.exit_code,
        output_snippet: command_output_snippet(&result),
        error: if ok {
            None
        } else {
            Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git restore --staged -- failed".to_string()),
            )
        },
    }
}

#[tauri::command]
fn git_add(payload: GitPathPayload) -> GitCommandResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: None,
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let result = run_git_command_at_path(&worktree_path, &["add", "-A"]);
    if let Some(error) = result.error.clone() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }

    let ok = result.exit_code == Some(0);
    GitCommandResponse {
        request_id,
        ok,
        path: Some(worktree_path.display().to_string()),
        exit_code: result.exit_code,
        output_snippet: command_output_snippet(&result),
        error: if ok {
            None
        } else {
            Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git add -A failed".to_string()),
            )
        },
    }
}

#[tauri::command]
fn git_commit(payload: GitCommitPayload) -> GitCommandResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitCommandResponse {
                request_id,
                ok: false,
                path: None,
                exit_code: None,
                output_snippet: None,
                error: Some(error),
            }
        }
    };

    let message = payload
        .message
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("chore: update files");

    let result = run_git_command_at_path(&worktree_path, &["commit", "-m", message]);
    if let Some(error) = result.error.clone() {
        return GitCommandResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            exit_code: result.exit_code,
            output_snippet: command_output_snippet(&result),
            error: Some(error),
        };
    }

    let ok = result.exit_code == Some(0);
    GitCommandResponse {
        request_id,
        ok,
        path: Some(worktree_path.display().to_string()),
        exit_code: result.exit_code,
        output_snippet: command_output_snippet(&result),
        error: if ok {
            None
        } else {
            Some(
                first_non_empty_line(&result.stderr)
                    .or_else(|| first_non_empty_line(&result.stdout))
                    .unwrap_or_else(|| "git commit failed".to_string()),
            )
        },
    }
}

#[tauri::command]
fn open_external_url(url: String) -> ExternalUrlOpenResponse {
    let request_id = request_id();
    let trimmed_url = url.trim();

    if trimmed_url.is_empty() {
        return ExternalUrlOpenResponse {
            request_id,
            ok: false,
            error: Some("URL must not be empty.".to_string()),
        };
    }

    if !trimmed_url.starts_with("http://") && !trimmed_url.starts_with("https://") {
        return ExternalUrlOpenResponse {
            request_id,
            ok: false,
            error: Some("URL must start with http:// or https://.".to_string()),
        };
    }

    match open_url_in_default_browser(trimmed_url) {
        Ok(()) => ExternalUrlOpenResponse {
            request_id,
            ok: true,
            error: None,
        },
        Err(error) => ExternalUrlOpenResponse {
            request_id,
            ok: false,
            error: Some(error),
        },
    }
}

