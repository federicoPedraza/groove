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

fn parse_unified_diff(diff_text: &str) -> Vec<GitDiffFile> {
    let mut files: Vec<GitDiffFile> = Vec::new();
    let mut current_file: Option<GitDiffFile> = None;
    let mut current_hunk: Option<GitDiffHunk> = None;
    let mut pending_old_path: Option<String> = None;
    let mut pending_new_path: Option<String> = None;
    let mut pending_status: Option<String> = None;
    let mut pending_binary = false;

    let flush_hunk = |file: &mut GitDiffFile, hunk: &mut Option<GitDiffHunk>| {
        if let Some(h) = hunk.take() {
            file.hunks.push(h);
        }
    };

    let flush_file = |files: &mut Vec<GitDiffFile>,
                      current_file: &mut Option<GitDiffFile>,
                      current_hunk: &mut Option<GitDiffHunk>| {
        if let Some(mut f) = current_file.take() {
            flush_hunk(&mut f, current_hunk);
            files.push(f);
        }
    };

    for line in diff_text.split('\n') {
        if let Some(rest) = line.strip_prefix("diff --git ") {
            flush_file(&mut files, &mut current_file, &mut current_hunk);

            let (old_token, new_token) =
                if let Some((a, b)) = rest.split_once(" b/") {
                    (a.trim_start_matches("a/").to_string(), b.to_string())
                } else {
                    let trimmed = rest.trim();
                    (trimmed.to_string(), trimmed.to_string())
                };

            current_file = Some(GitDiffFile {
                file_path: new_token.clone(),
                old_path: if old_token == new_token { None } else { Some(old_token) },
                status: "modified".to_string(),
                additions: 0,
                deletions: 0,
                binary: false,
                hunks: Vec::new(),
            });
            pending_old_path = None;
            pending_new_path = None;
            pending_status = None;
            pending_binary = false;
            continue;
        }

        if line.starts_with("new file mode") {
            pending_status = Some("added".to_string());
            continue;
        }
        if line.starts_with("deleted file mode") {
            pending_status = Some("deleted".to_string());
            continue;
        }
        if line.starts_with("rename from ") {
            pending_old_path = Some(line.trim_start_matches("rename from ").to_string());
            pending_status = Some("renamed".to_string());
            continue;
        }
        if line.starts_with("rename to ") {
            pending_new_path = Some(line.trim_start_matches("rename to ").to_string());
            continue;
        }
        if line.starts_with("Binary files ") || line.starts_with("GIT binary patch") {
            pending_binary = true;
            continue;
        }
        if line.starts_with("--- ") {
            if let Some(file) = current_file.as_mut() {
                if let Some(status) = pending_status.take() {
                    file.status = status;
                }
                if let Some(old_path) = pending_old_path.take() {
                    file.old_path = Some(old_path);
                }
                if pending_binary {
                    file.binary = true;
                    pending_binary = false;
                }
            }
            continue;
        }
        if line.starts_with("+++ ") {
            if let Some(file) = current_file.as_mut() {
                if let Some(new_path) = pending_new_path.take() {
                    file.file_path = new_path;
                }
            }
            continue;
        }

        if let Some(rest) = line.strip_prefix("@@") {
            if let Some(file) = current_file.as_mut() {
                flush_hunk(file, &mut current_hunk);
            }
            let end = rest.find("@@").unwrap_or(rest.len());
            let header_inner = &rest[..end];
            let header = format!("@@{}@@", header_inner);
            let mut old_start = 0u32;
            let mut old_lines = 1u32;
            let mut new_start = 0u32;
            let mut new_lines = 1u32;
            for token in header_inner.split_whitespace() {
                if let Some(value) = token.strip_prefix('-') {
                    let (start, lines) = parse_hunk_range(value);
                    old_start = start;
                    old_lines = lines;
                } else if let Some(value) = token.strip_prefix('+') {
                    let (start, lines) = parse_hunk_range(value);
                    new_start = start;
                    new_lines = lines;
                }
            }
            current_hunk = Some(GitDiffHunk {
                header,
                old_start,
                old_lines,
                new_start,
                new_lines,
                lines: Vec::new(),
            });
            continue;
        }

        if current_hunk.is_some() {
            let (kind, content) = if let Some(rest) = line.strip_prefix('+') {
                ("add", rest.to_string())
            } else if let Some(rest) = line.strip_prefix('-') {
                ("remove", rest.to_string())
            } else if let Some(rest) = line.strip_prefix(' ') {
                ("context", rest.to_string())
            } else if line.starts_with('\\') {
                continue;
            } else {
                continue;
            };
            if let Some(file) = current_file.as_mut() {
                if kind == "add" {
                    file.additions += 1;
                } else if kind == "remove" {
                    file.deletions += 1;
                }
            }
            if let Some(hunk) = current_hunk.as_mut() {
                hunk.lines.push(GitDiffLine {
                    kind: kind.to_string(),
                    content,
                });
            }
        }
    }

    flush_file(&mut files, &mut current_file, &mut current_hunk);
    files
}

fn parse_hunk_range(value: &str) -> (u32, u32) {
    if let Some((start, lines)) = value.split_once(',') {
        (
            start.parse::<u32>().unwrap_or(0),
            lines.parse::<u32>().unwrap_or(0),
        )
    } else {
        (value.parse::<u32>().unwrap_or(0), 1)
    }
}

#[tauri::command]
fn git_diff(payload: GitPathPayload) -> GitDiffResponse {
    let request_id = request_id();
    let worktree_path = match validate_git_worktree_path(&payload.path) {
        Ok(path) => path,
        Err(error) => {
            return GitDiffResponse {
                request_id,
                ok: false,
                path: None,
                files: Vec::new(),
                error: Some(error),
            }
        }
    };

    let diff_result = run_git_command_at_path(
        &worktree_path,
        &["diff", "HEAD", "--no-color", "--unified=3"],
    );

    if let Some(error) = diff_result.error.clone() {
        return GitDiffResponse {
            request_id,
            ok: false,
            path: Some(worktree_path.display().to_string()),
            files: Vec::new(),
            error: Some(error),
        };
    }

    let mut files = if diff_result.exit_code == Some(0) || diff_result.exit_code == Some(1) {
        parse_unified_diff(&diff_result.stdout)
    } else {
        Vec::new()
    };

    let untracked_result = run_git_command_at_path(
        &worktree_path,
        &["ls-files", "--others", "--exclude-standard"],
    );
    if untracked_result.error.is_none() && untracked_result.exit_code == Some(0) {
        for line in untracked_result.stdout.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let untracked_diff = run_git_command_at_path(
                &worktree_path,
                &[
                    "diff",
                    "--no-color",
                    "--no-index",
                    "--unified=3",
                    "/dev/null",
                    trimmed,
                ],
            );
            let parsed = parse_unified_diff(&untracked_diff.stdout);
            if let Some(mut file) = parsed.into_iter().next() {
                file.file_path = trimmed.to_string();
                file.old_path = None;
                file.status = "untracked".to_string();
                files.push(file);
            } else {
                files.push(GitDiffFile {
                    file_path: trimmed.to_string(),
                    old_path: None,
                    status: "untracked".to_string(),
                    additions: 0,
                    deletions: 0,
                    binary: false,
                    hunks: Vec::new(),
                });
            }
        }
    }

    GitDiffResponse {
        request_id,
        ok: true,
        path: Some(worktree_path.display().to_string()),
        files,
        error: None,
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

fn run_gh(args: &[&str]) -> CommandResult {
    run_capture_command(&std::env::temp_dir(), "gh", args)
}

fn run_gh_with_stdin(args: &[&str], stdin_data: &str) -> CommandResult {
    let mut command = Command::new("gh");
    command
        .args(args)
        .current_dir(std::env::temp_dir())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return CommandResult {
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                error: Some(format!("Failed to execute gh: {error}")),
            }
        }
    };

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(stdin_data.as_bytes());
        // Dropping `stdin` here closes the pipe so gh can finish reading.
    }

    match child.wait_with_output() {
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
            error: Some(format!("Failed to execute gh: {error}")),
        },
    }
}

/// GitHub logins are ASCII alphanumeric plus hyphens and never start with a
/// hyphen. Validating keeps a stray value from being read as a `gh` flag.
fn is_valid_gh_login(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('-')
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

/// Parse the human-readable `gh auth status` output into per-account records.
/// `gh` (as of 2.x) has no `--json` form for this, so we read its line format.
fn parse_gh_auth_status(output: &str) -> Vec<GhAccount> {
    let mut accounts: Vec<GhAccount> = Vec::new();

    for raw_line in output.lines() {
        let line = raw_line.trim();

        if line.contains("Logged in to") {
            // e.g. "✓ Logged in to github.com account octocat (keyring)"
            // Older gh used "... as octocat (...)".
            let login = line
                .split("account")
                .nth(1)
                .or_else(|| line.split(" as ").nth(1))
                .and_then(|rest| rest.split_whitespace().next())
                .map(|token| token.trim_matches(|c: char| c == '(' || c == ')'))
                .unwrap_or("")
                .to_string();

            if !login.is_empty() {
                accounts.push(GhAccount {
                    login,
                    active: false,
                    scopes: Vec::new(),
                    protocol: None,
                });
            }
            continue;
        }

        let Some(current) = accounts.last_mut() else {
            continue;
        };

        if let Some(value) = line.strip_prefix("- Active account:") {
            current.active = value.trim().eq_ignore_ascii_case("true");
        } else if let Some(value) = line.strip_prefix("- Git operations protocol:") {
            let protocol = value.trim();
            if !protocol.is_empty() {
                current.protocol = Some(protocol.to_string());
            }
        } else if let Some(value) = line.strip_prefix("- Token scopes:") {
            current.scopes = value
                .split(',')
                .map(|scope| scope.trim().trim_matches('\'').trim().to_string())
                .filter(|scope| !scope.is_empty())
                .collect();
        }
    }

    accounts
}

fn gh_failure_response(request_id: String, result: CommandResult) -> GhCommandResponse {
    if let Some(error) = result.error {
        let message = if error.contains("Failed to execute gh") {
            "GitHub CLI (gh) is not installed or not on PATH.".to_string()
        } else {
            error
        };
        return GhCommandResponse {
            request_id,
            ok: false,
            error: Some(message),
        };
    }

    if result.exit_code == Some(0) {
        return GhCommandResponse {
            request_id,
            ok: true,
            error: None,
        };
    }

    let detail = first_non_empty_line(&result.stderr)
        .or_else(|| first_non_empty_line(&result.stdout))
        .unwrap_or_else(|| "gh command failed.".to_string());

    GhCommandResponse {
        request_id,
        ok: false,
        error: Some(detail),
    }
}

// `gh` shells out (and `gh auth status` can touch the keyring), so these
// commands run `async` and offload via `spawn_blocking`; a synchronous command
// would block the UI thread. This mirrors `assistant_validate_mcp` and friends.
#[tauri::command]
async fn gh_auth_status() -> GhAuthStatusResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || gh_auth_status_blocking(request_id)).await {
        Ok(response) => response,
        Err(error) => GhAuthStatusResponse {
            request_id: fallback_request_id,
            ok: false,
            installed: false,
            logged_in: false,
            active_account: None,
            accounts: Vec::new(),
            error: Some(format!("Failed to run gh auth status worker thread: {error}")),
        },
    }
}

fn gh_auth_status_blocking(request_id: String) -> GhAuthStatusResponse {
    let version = run_gh(&["--version"]);
    if version.error.is_some() {
        return GhAuthStatusResponse {
            request_id,
            ok: true,
            installed: false,
            logged_in: false,
            active_account: None,
            accounts: Vec::new(),
            error: None,
        };
    }

    let status = run_gh(&["auth", "status"]);
    let combined = format!("{}\n{}", status.stdout, status.stderr);
    let accounts = parse_gh_auth_status(&combined);
    let active_account = accounts
        .iter()
        .find(|account| account.active)
        .map(|account| account.login.clone());

    GhAuthStatusResponse {
        request_id,
        ok: true,
        installed: true,
        logged_in: !accounts.is_empty(),
        active_account,
        accounts,
        error: None,
    }
}

#[tauri::command]
async fn gh_auth_login(payload: GhLoginPayload) -> GhCommandResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || gh_auth_login_blocking(request_id, payload))
        .await
    {
        Ok(response) => response,
        Err(error) => GhCommandResponse {
            request_id: fallback_request_id,
            ok: false,
            error: Some(format!("Failed to run gh auth login worker thread: {error}")),
        },
    }
}

fn gh_auth_login_blocking(request_id: String, payload: GhLoginPayload) -> GhCommandResponse {
    let token = payload.token.trim();

    if token.is_empty() {
        return GhCommandResponse {
            request_id,
            ok: false,
            error: Some("A GitHub token is required.".to_string()),
        };
    }

    let result = run_gh_with_stdin(
        &["auth", "login", "--hostname", "github.com", "--with-token"],
        token,
    );
    gh_failure_response(request_id, result)
}

#[tauri::command]
fn gh_auth_switch(payload: GhSwitchPayload) -> GhCommandResponse {
    let request_id = request_id();
    let user = payload.user.trim();

    if !is_valid_gh_login(user) {
        return GhCommandResponse {
            request_id,
            ok: false,
            error: Some("A valid GitHub account login is required.".to_string()),
        };
    }

    let result = run_gh(&["auth", "switch", "--hostname", "github.com", "--user", user]);
    gh_failure_response(request_id, result)
}

#[tauri::command]
fn gh_auth_logout(payload: GhLogoutPayload) -> GhCommandResponse {
    let request_id = request_id();
    let user = payload.user.trim();

    if !is_valid_gh_login(user) {
        return GhCommandResponse {
            request_id,
            ok: false,
            error: Some("A valid GitHub account login is required.".to_string()),
        };
    }

    let result = run_gh(&["auth", "logout", "--hostname", "github.com", "--user", user]);
    gh_failure_response(request_id, result)
}

/// SSH host aliases are conservative: ASCII alphanumerics plus `-`, `_`, `.`,
/// never leading with `-` (so the value can't be read as an ssh/git flag).
fn is_valid_ssh_host_alias(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('-')
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric()
                || character == '-'
                || character == '_'
                || character == '.'
        })
}

/// Parse `~/.ssh/config` and return the host aliases that resolve to
/// `github.com`, as `(alias, hostname, identity_file)`. SSH keywords are
/// case-insensitive and may use `key value` or `key=value` forms.
fn parse_ssh_config_github_hosts(content: &str) -> Vec<(String, String, Option<String>)> {
    fn split_directive(line: &str) -> Option<(String, String)> {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            return None;
        }
        let (keyword, value) = if let Some(index) = trimmed.find('=') {
            (&trimmed[..index], &trimmed[index + 1..])
        } else {
            let mut parts = trimmed.splitn(2, char::is_whitespace);
            (parts.next().unwrap_or(""), parts.next().unwrap_or(""))
        };
        Some((keyword.trim().to_lowercase(), value.trim().to_string()))
    }

    let mut identities: Vec<(String, String, Option<String>)> = Vec::new();
    let mut aliases: Vec<String> = Vec::new();
    let mut hostname: Option<String> = None;
    let mut identity_file: Option<String> = None;

    let mut flush = |aliases: &mut Vec<String>,
                     hostname: &mut Option<String>,
                     identity_file: &mut Option<String>| {
        for alias in aliases.iter() {
            // The effective hostname defaults to the alias when unset.
            let effective = hostname.clone().unwrap_or_else(|| alias.clone());
            if effective.eq_ignore_ascii_case("github.com") {
                identities.push((alias.clone(), effective, identity_file.clone()));
            }
        }
        aliases.clear();
        *hostname = None;
        *identity_file = None;
    };

    for line in content.lines() {
        let Some((keyword, value)) = split_directive(line) else {
            continue;
        };

        match keyword.as_str() {
            "host" => {
                flush(&mut aliases, &mut hostname, &mut identity_file);
                aliases = value
                    .split_whitespace()
                    .filter(|pattern| !pattern.contains('*') && !pattern.contains('?'))
                    .map(|pattern| pattern.to_string())
                    .collect();
            }
            "hostname" if !value.is_empty() => hostname = Some(value),
            "identityfile" if !value.is_empty() => identity_file = Some(value),
            _ => {}
        }
    }
    flush(&mut aliases, &mut hostname, &mut identity_file);

    identities
}

/// Split a git remote URL into `(host, path)`, where `path` is the portion
/// after the host (e.g. `owner/repo.git`). Handles scp-style
/// (`git@host:owner/repo.git`), `ssh://`, and `https://` forms.
fn split_remote_url(url: &str) -> Option<(String, String)> {
    let url = url.trim();
    if url.is_empty() {
        return None;
    }

    let strip_userinfo = |authority: &str| -> String {
        authority
            .rsplit_once('@')
            .map(|(_, host)| host)
            .unwrap_or(authority)
            .to_string()
    };
    let strip_port = |host: &str| -> String {
        host.rsplit_once(':')
            .map(|(name, _)| name)
            .unwrap_or(host)
            .to_string()
    };

    if let Some(rest) = url.splitn(2, "://").nth(1) {
        let (authority, path) = match rest.split_once('/') {
            Some((authority, path)) => (authority, path),
            None => (rest, ""),
        };
        let host = strip_port(&strip_userinfo(authority));
        return Some((host, path.trim_start_matches('/').to_string()));
    }

    // scp-style: [user@]host:path
    if let Some((authority, path)) = url.split_once(':') {
        let host = strip_userinfo(authority);
        return Some((host, path.trim_start_matches('/').to_string()));
    }

    None
}

/// Derive `(owner, repo)` from a remote path like `owner/repo.git`.
fn owner_repo_from_path(path: &str) -> (Option<String>, Option<String>) {
    let mut segments = path.trim_matches('/').splitn(2, '/');
    let owner = segments
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());
    let repo = segments
        .next()
        .map(|value| value.trim().trim_end_matches(".git"))
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());
    (owner, repo)
}

/// Probe a github.com SSH alias to learn the authenticated username. GitHub
/// answers `ssh -T` with "Hi <user>! ..." on a non-zero exit (no shell access).
fn ssh_identity_probe(alias: &str) -> (Option<String>, String) {
    let target = format!("git@{alias}");
    let result = run_capture_command_timeout(
        &std::env::temp_dir(),
        "ssh",
        &[
            "-T",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=6",
            "-o",
            "StrictHostKeyChecking=accept-new",
            &target,
        ],
        Duration::from_secs(8),
    );

    let combined = format!("{}\n{}", result.stdout, result.stderr);
    let combined_lower = combined.to_lowercase();

    if combined_lower.contains("successfully authenticated") {
        let username = combined
            .split("Hi ")
            .nth(1)
            .and_then(|rest| rest.split(|c| c == '!' || c == ' ').next())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string());
        return (username, "authenticated".to_string());
    }

    if combined_lower.contains("permission denied")
        || combined_lower.contains("publickey")
        || combined_lower.contains("authentication failed")
    {
        return (None, "unauthenticated".to_string());
    }

    if combined_lower.contains("timed out")
        || combined_lower.contains("could not resolve hostname")
        || combined_lower.contains("network is unreachable")
        || combined_lower.contains("connection refused")
        || result
            .error
            .as_ref()
            .map(|value| value.to_lowercase().contains("timed out"))
            .unwrap_or(false)
    {
        return (None, "unreachable".to_string());
    }

    (None, "unknown".to_string())
}

// Each identity is probed with a network `ssh -T`, so this command runs
// `async` + `spawn_blocking` to stay off the UI thread, and probes the aliases
// in parallel so the wall-clock cost is one timeout, not one per alias.
#[tauri::command]
async fn gh_ssh_overview(payload: GhSshOverviewPayload) -> GhSshOverviewResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || gh_ssh_overview_blocking(request_id, payload))
        .await
    {
        Ok(response) => response,
        Err(error) => GhSshOverviewResponse {
            request_id: fallback_request_id,
            ok: false,
            config_found: false,
            identities: Vec::new(),
            origin: None,
            error: Some(format!("Failed to run gh ssh overview worker thread: {error}")),
        },
    }
}

fn gh_ssh_overview_blocking(
    request_id: String,
    payload: GhSshOverviewPayload,
) -> GhSshOverviewResponse {
    let config_path = dirs_home().map(|home| home.join(".ssh").join("config"));
    let config_content = config_path
        .as_ref()
        .filter(|path| path.exists())
        .and_then(|path| std::fs::read_to_string(path).ok());

    let config_found = config_content.is_some();
    let hosts = config_content
        .as_deref()
        .map(parse_ssh_config_github_hosts)
        .unwrap_or_default();

    // Probe every alias concurrently; joining collects them back in order.
    let probes: Vec<_> = hosts
        .into_iter()
        .map(|(alias, hostname, identity_file)| {
            let probe_alias = alias.clone();
            let handle = std::thread::spawn(move || ssh_identity_probe(&probe_alias));
            (alias, hostname, identity_file, handle)
        })
        .collect();

    let identities: Vec<GhSshIdentity> = probes
        .into_iter()
        .map(|(alias, hostname, identity_file, handle)| {
            let (username, auth_state) = handle
                .join()
                .unwrap_or_else(|_| (None, "unknown".to_string()));
            GhSshIdentity {
                alias,
                hostname,
                identity_file,
                username,
                auth_state,
            }
        })
        .collect();

    let origin = payload
        .workspace_root
        .as_deref()
        .and_then(|root| validate_workspace_root_path(root).ok())
        .and_then(|root| resolve_remote_url_with_fallback(&root))
        .map(|(_, url)| {
            let (host, path) = match split_remote_url(&url) {
                Some((host, path)) => (Some(host), path),
                None => (None, String::new()),
            };
            let (owner, repo) = owner_repo_from_path(&path);
            let matched_alias = host
                .as_ref()
                .map(|host| host.to_string())
                .filter(|host| identities.iter().any(|identity| &identity.alias == host));
            GhRemoteOrigin {
                url,
                host,
                owner,
                repo,
                matched_alias,
            }
        });

    GhSshOverviewResponse {
        request_id,
        ok: true,
        config_found,
        identities,
        origin,
        error: None,
    }
}

#[tauri::command]
fn gh_ssh_set_identity(payload: GhSshSetIdentityPayload) -> GhCommandResponse {
    let request_id = request_id();

    let alias = payload.alias.trim();
    if !is_valid_ssh_host_alias(alias) {
        return GhCommandResponse {
            request_id,
            ok: false,
            error: Some("A valid SSH host alias is required.".to_string()),
        };
    }

    let workspace_root = match validate_workspace_root_path(&payload.workspace_root) {
        Ok(root) => root,
        Err(error) => {
            return GhCommandResponse {
                request_id,
                ok: false,
                error: Some(error),
            }
        }
    };

    // Only allow aliases the user actually has configured for github.com.
    let config_known = dirs_home()
        .map(|home| home.join(".ssh").join("config"))
        .filter(|path| path.exists())
        .and_then(|path| std::fs::read_to_string(path).ok())
        .map(|content| parse_ssh_config_github_hosts(&content))
        .map(|hosts| hosts.iter().any(|(host_alias, _, _)| host_alias == alias))
        .unwrap_or(false);

    if !config_known {
        return GhCommandResponse {
            request_id,
            ok: false,
            error: Some(format!(
                "\"{alias}\" is not a github.com host alias in ~/.ssh/config."
            )),
        };
    }

    let Some((remote_name, url)) = resolve_remote_url_with_fallback(&workspace_root) else {
        return GhCommandResponse {
            request_id,
            ok: false,
            error: Some("This repository has no remote to update.".to_string()),
        };
    };

    let Some((_, path)) = split_remote_url(&url) else {
        return GhCommandResponse {
            request_id,
            ok: false,
            error: Some(format!("Could not parse the current remote URL: {url}")),
        };
    };

    if path.is_empty() {
        return GhCommandResponse {
            request_id,
            ok: false,
            error: Some("The current remote URL has no repository path.".to_string()),
        };
    }

    let new_url = format!("git@{alias}:{path}");
    let result = run_capture_command(
        &workspace_root,
        "git",
        &["remote", "set-url", &remote_name, &new_url],
    );
    gh_failure_response(request_id, result)
}

// ---- GitHub pull-request commands -----------------------------------------
//
// These shell out to `gh` inside a specific worktree directory and parse its
// `--json` output. Like the auth commands they run `async` + `spawn_blocking`
// (network I/O must stay off the UI thread).

fn run_gh_in(cwd: &Path, args: &[&str]) -> CommandResult {
    run_capture_command(cwd, "gh", args)
}

/// Branch names accept `/._-` and alphanumerics; rejecting a leading `-` keeps
/// the value from being read as a `gh`/`git` flag.
fn is_valid_branch_token(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('-')
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '/'))
}

/// Extract the PR number from a `.../pull/<n>` URL.
fn parse_pr_number_from_url(url: &str) -> Option<i64> {
    let after = url.split("/pull/").nth(1)?;
    let digits: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse::<i64>().ok()
}

fn current_branch_at(worktree_path: &Path) -> Option<String> {
    let result = run_git_command_at_path(worktree_path, &["branch", "--show-current"]);
    first_non_empty_line(&result.stdout)
}

#[derive(serde::Deserialize)]
struct GhRefRaw {
    name: String,
}

#[derive(serde::Deserialize)]
struct GhDefaultBranchRaw {
    #[serde(rename = "defaultBranchRef")]
    default_branch_ref: Option<GhRefRaw>,
}

#[derive(serde::Deserialize)]
struct GhAuthorRaw {
    #[serde(default)]
    login: String,
}

#[derive(serde::Deserialize)]
struct GhPrCommentRaw {
    #[serde(default)]
    author: Option<GhAuthorRaw>,
    #[serde(default)]
    body: String,
    #[serde(default, rename = "createdAt")]
    created_at: Option<String>,
}

#[derive(serde::Deserialize)]
struct GhLabelRaw {
    #[serde(default)]
    name: String,
}

#[derive(serde::Deserialize)]
struct GhPrViewRaw {
    number: i64,
    #[serde(default)]
    title: String,
    #[serde(default)]
    state: String,
    #[serde(default)]
    url: String,
    #[serde(default, rename = "isDraft")]
    is_draft: bool,
    #[serde(default, rename = "baseRefName")]
    base_ref_name: Option<String>,
    #[serde(default, rename = "headRefName")]
    head_ref_name: Option<String>,
    #[serde(default, rename = "reviewDecision")]
    review_decision: Option<String>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    author: Option<GhAuthorRaw>,
    #[serde(default)]
    labels: Vec<GhLabelRaw>,
    #[serde(default)]
    additions: Option<i64>,
    #[serde(default)]
    deletions: Option<i64>,
    #[serde(default, rename = "createdAt")]
    created_at: Option<String>,
    #[serde(default, rename = "updatedAt")]
    updated_at: Option<String>,
    #[serde(default)]
    comments: Vec<GhPrCommentRaw>,
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value.filter(|text| !text.trim().is_empty())
}

#[tauri::command]
async fn gh_repo_default_branch(payload: GhWorktreePayload) -> GhRepoDefaultBranchResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || {
        gh_repo_default_branch_blocking(request_id, payload)
    })
    .await
    {
        Ok(response) => response,
        Err(error) => GhRepoDefaultBranchResponse {
            request_id: fallback_request_id,
            ok: false,
            default_branch: None,
            error: Some(format!("Failed to run gh repo default-branch worker thread: {error}")),
        },
    }
}

fn gh_repo_default_branch_blocking(
    request_id: String,
    payload: GhWorktreePayload,
) -> GhRepoDefaultBranchResponse {
    let worktree_path = match validate_git_worktree_path(&payload.worktree_path) {
        Ok(path) => path,
        Err(error) => {
            return GhRepoDefaultBranchResponse {
                request_id,
                ok: false,
                default_branch: None,
                error: Some(error),
            }
        }
    };

    let result = run_gh_in(&worktree_path, &["repo", "view", "--json", "defaultBranchRef"]);
    if result.error.is_none() && result.exit_code == Some(0) {
        if let Ok(parsed) = serde_json::from_str::<GhDefaultBranchRaw>(&result.stdout) {
            if let Some(branch) = parsed.default_branch_ref.map(|reference| reference.name) {
                return GhRepoDefaultBranchResponse {
                    request_id,
                    ok: true,
                    default_branch: Some(branch),
                    error: None,
                };
            }
        }
    }

    // Fallback: parse the local symbolic ref for origin/HEAD.
    let symbolic = run_git_command_at_path(
        &worktree_path,
        &["symbolic-ref", "refs/remotes/origin/HEAD"],
    );
    let default_branch = first_non_empty_line(&symbolic.stdout)
        .and_then(|line| line.rsplit('/').next().map(|name| name.to_string()));

    GhRepoDefaultBranchResponse {
        request_id,
        ok: true,
        default_branch,
        error: None,
    }
}

#[tauri::command]
async fn gh_pr_list(payload: GhWorktreePayload) -> GhPrListResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || gh_pr_list_blocking(request_id, payload))
        .await
    {
        Ok(response) => response,
        Err(error) => GhPrListResponse {
            request_id: fallback_request_id,
            ok: false,
            branch: None,
            prs: Vec::new(),
            error: Some(format!("Failed to run gh pr list worker thread: {error}")),
        },
    }
}

fn gh_pr_list_blocking(request_id: String, payload: GhWorktreePayload) -> GhPrListResponse {
    let worktree_path = match validate_git_worktree_path(&payload.worktree_path) {
        Ok(path) => path,
        Err(error) => {
            return GhPrListResponse {
                request_id,
                ok: false,
                branch: None,
                prs: Vec::new(),
                error: Some(error),
            }
        }
    };

    let Some(branch) = current_branch_at(&worktree_path) else {
        return GhPrListResponse {
            request_id,
            ok: false,
            branch: None,
            prs: Vec::new(),
            error: Some("Could not determine the current branch.".to_string()),
        };
    };

    let result = run_gh_in(
        &worktree_path,
        &[
            "pr",
            "list",
            "--head",
            &branch,
            "--state",
            "all",
            "--json",
            "number,title,state,url,isDraft",
        ],
    );

    if let Some(error) = result.error {
        return GhPrListResponse {
            request_id,
            ok: false,
            branch: Some(branch),
            prs: Vec::new(),
            error: Some(if error.contains("Failed to execute gh") {
                "GitHub CLI (gh) is not installed or not on PATH.".to_string()
            } else {
                error
            }),
        };
    }

    if result.exit_code != Some(0) {
        return GhPrListResponse {
            request_id,
            ok: false,
            branch: Some(branch),
            prs: Vec::new(),
            error: Some(
                first_non_empty_line(&result.stderr)
                    .unwrap_or_else(|| "gh pr list failed.".to_string()),
            ),
        };
    }

    let prs = serde_json::from_str::<Vec<GhPrSummary>>(&result.stdout).unwrap_or_default();
    GhPrListResponse {
        request_id,
        ok: true,
        branch: Some(branch),
        prs,
        error: None,
    }
}

#[tauri::command]
async fn gh_pr_view(payload: GhPrViewPayload) -> GhPrViewResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || gh_pr_view_blocking(request_id, payload))
        .await
    {
        Ok(response) => response,
        Err(error) => GhPrViewResponse {
            request_id: fallback_request_id,
            ok: false,
            pr: None,
            error: Some(format!("Failed to run gh pr view worker thread: {error}")),
        },
    }
}

fn gh_pr_view_blocking(request_id: String, payload: GhPrViewPayload) -> GhPrViewResponse {
    let worktree_path = match validate_git_worktree_path(&payload.worktree_path) {
        Ok(path) => path,
        Err(error) => {
            return GhPrViewResponse {
                request_id,
                ok: false,
                pr: None,
                error: Some(error),
            }
        }
    };

    let selector = payload.selector.trim();
    let is_number = !selector.is_empty() && selector.chars().all(|c| c.is_ascii_digit());
    let is_pr_url = selector.starts_with("https://") && selector.contains("/pull/");
    if !is_number && !is_pr_url {
        return GhPrViewResponse {
            request_id,
            ok: false,
            pr: None,
            error: Some("Selector must be a PR number or a github.com pull-request URL.".to_string()),
        };
    }

    let result = run_gh_in(
        &worktree_path,
        &[
            "pr",
            "view",
            selector,
            "--json",
            "number,title,state,url,isDraft,baseRefName,headRefName,reviewDecision,body,author,labels,additions,deletions,createdAt,updatedAt,comments",
        ],
    );

    if let Some(error) = result.error {
        return GhPrViewResponse {
            request_id,
            ok: false,
            pr: None,
            error: Some(if error.contains("Failed to execute gh") {
                "GitHub CLI (gh) is not installed or not on PATH.".to_string()
            } else {
                error
            }),
        };
    }

    if result.exit_code != Some(0) {
        return GhPrViewResponse {
            request_id,
            ok: false,
            pr: None,
            error: Some(
                first_non_empty_line(&result.stderr)
                    .unwrap_or_else(|| "gh pr view failed.".to_string()),
            ),
        };
    }

    let parsed = match serde_json::from_str::<GhPrViewRaw>(&result.stdout) {
        Ok(parsed) => parsed,
        Err(error) => {
            return GhPrViewResponse {
                request_id,
                ok: false,
                pr: None,
                error: Some(format!("Could not parse gh pr view output: {error}")),
            }
        }
    };

    let comments = parsed
        .comments
        .into_iter()
        .map(|comment| GhPrComment {
            author: comment
                .author
                .map(|author| author.login)
                .filter(|login| !login.is_empty()),
            body: comment.body,
            created_at: normalize_optional(comment.created_at),
        })
        .collect();

    GhPrViewResponse {
        request_id,
        ok: true,
        pr: Some(GhPrDetail {
            number: parsed.number,
            title: parsed.title,
            state: parsed.state,
            url: parsed.url,
            is_draft: parsed.is_draft,
            base_ref_name: normalize_optional(parsed.base_ref_name),
            head_ref_name: normalize_optional(parsed.head_ref_name),
            review_decision: normalize_optional(parsed.review_decision),
            body: normalize_optional(parsed.body),
            author: parsed
                .author
                .map(|author| author.login)
                .filter(|login| !login.is_empty()),
            labels: parsed
                .labels
                .into_iter()
                .map(|label| label.name)
                .filter(|name| !name.is_empty())
                .collect(),
            additions: parsed.additions,
            deletions: parsed.deletions,
            created_at: normalize_optional(parsed.created_at),
            updated_at: normalize_optional(parsed.updated_at),
            comments,
        }),
        error: None,
    }
}

#[tauri::command]
async fn gh_pr_create_web(payload: GhPrCreateWebPayload) -> GhCommandResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || {
        gh_pr_create_web_blocking(request_id, payload)
    })
    .await
    {
        Ok(response) => response,
        Err(error) => GhCommandResponse {
            request_id: fallback_request_id,
            ok: false,
            error: Some(format!("Failed to run gh pr create worker thread: {error}")),
        },
    }
}

fn gh_pr_create_web_blocking(request_id: String, payload: GhPrCreateWebPayload) -> GhCommandResponse {
    let base = payload.base.trim();
    if !is_valid_branch_token(base) {
        return GhCommandResponse {
            request_id,
            ok: false,
            error: Some("A valid base branch is required.".to_string()),
        };
    }

    let worktree_path = match validate_git_worktree_path(&payload.worktree_path) {
        Ok(path) => path,
        Err(error) => {
            return GhCommandResponse {
                request_id,
                ok: false,
                error: Some(error),
            }
        }
    };

    let result = run_gh_in(
        &worktree_path,
        &["pr", "create", "--web", "--base", base],
    );
    gh_failure_response(request_id, result)
}

#[cfg(test)]
mod gh_auth_status_tests {
    use super::{
        is_valid_branch_token, is_valid_gh_login, is_valid_ssh_host_alias, owner_repo_from_path,
        parse_gh_auth_status, parse_pr_number_from_url, parse_ssh_config_github_hosts,
        split_remote_url,
    };

    #[test]
    fn parses_active_account_with_scopes_and_protocol() {
        let output = "github.com\n  \u{2713} Logged in to github.com account octocat (keyring)\n  - Active account: true\n  - Git operations protocol: ssh\n  - Token: gho_xxxx\n  - Token scopes: 'admin:public_key', 'gist', 'read:org', 'repo'\n";

        let accounts = parse_gh_auth_status(output);
        assert_eq!(accounts.len(), 1);

        let account = &accounts[0];
        assert_eq!(account.login, "octocat");
        assert!(account.active);
        assert_eq!(account.protocol.as_deref(), Some("ssh"));
        assert_eq!(
            account.scopes,
            vec!["admin:public_key", "gist", "read:org", "repo"]
        );
    }

    #[test]
    fn parses_multiple_accounts_and_marks_active() {
        let output = "github.com\n  \u{2713} Logged in to github.com account octocat (keyring)\n  - Active account: false\n  \u{2713} Logged in to github.com account hubot (oauth_token)\n  - Active account: true\n";

        let accounts = parse_gh_auth_status(output);
        assert_eq!(accounts.len(), 2);
        assert_eq!(accounts[0].login, "octocat");
        assert!(!accounts[0].active);
        assert_eq!(accounts[1].login, "hubot");
        assert!(accounts[1].active);
    }

    #[test]
    fn returns_empty_when_not_logged_in() {
        let output = "You are not logged into any GitHub hosts. To log in, run: gh auth login\n";
        assert!(parse_gh_auth_status(output).is_empty());
    }

    #[test]
    fn rejects_logins_that_could_be_read_as_flags() {
        assert!(is_valid_gh_login("octocat"));
        assert!(is_valid_gh_login("octo-cat"));
        assert!(!is_valid_gh_login("--force"));
        assert!(!is_valid_gh_login(""));
        assert!(!is_valid_gh_login("octo cat"));
    }

    #[test]
    fn parses_github_host_aliases_from_ssh_config() {
        let config = "Host github-personal\n     HostName github.com\n     User git\n     IdentityFile ~/.ssh/id_ed25519_github_personal\n\nHost github-work\n     HostName github.com\n     IdentityFile ~/.ssh/id_ed25519_github_work\n\nHost gitlab\n     HostName gitlab.com\n";

        let hosts = parse_ssh_config_github_hosts(config);
        assert_eq!(hosts.len(), 2);
        assert_eq!(hosts[0].0, "github-personal");
        assert_eq!(hosts[0].1, "github.com");
        assert_eq!(
            hosts[0].2.as_deref(),
            Some("~/.ssh/id_ed25519_github_personal")
        );
        assert_eq!(hosts[1].0, "github-work");
        // gitlab is excluded because its HostName is not github.com.
    }

    #[test]
    fn ssh_config_skips_wildcard_host_patterns() {
        let config = "Host *\n     HostName github.com\n";
        assert!(parse_ssh_config_github_hosts(config).is_empty());
    }

    #[test]
    fn splits_scp_and_url_remotes() {
        assert_eq!(
            split_remote_url("git@github.com:octocat/repo.git"),
            Some(("github.com".to_string(), "octocat/repo.git".to_string()))
        );
        assert_eq!(
            split_remote_url("git@github-work:octocat/repo.git"),
            Some(("github-work".to_string(), "octocat/repo.git".to_string()))
        );
        assert_eq!(
            split_remote_url("https://github.com/octocat/repo.git"),
            Some(("github.com".to_string(), "octocat/repo.git".to_string()))
        );
        assert_eq!(
            split_remote_url("ssh://git@github.com:22/octocat/repo.git"),
            Some(("github.com".to_string(), "octocat/repo.git".to_string()))
        );
    }

    #[test]
    fn derives_owner_and_repo_from_path() {
        let (owner, repo) = owner_repo_from_path("octocat/repo.git");
        assert_eq!(owner.as_deref(), Some("octocat"));
        assert_eq!(repo.as_deref(), Some("repo"));
    }

    #[test]
    fn rejects_unsafe_ssh_host_aliases() {
        assert!(is_valid_ssh_host_alias("github-work"));
        assert!(is_valid_ssh_host_alias("gh_work.1"));
        assert!(!is_valid_ssh_host_alias("-oProxyCommand=evil"));
        assert!(!is_valid_ssh_host_alias("has space"));
        assert!(!is_valid_ssh_host_alias(""));
    }

    #[test]
    fn parses_pr_number_from_pull_url() {
        assert_eq!(
            parse_pr_number_from_url("https://github.com/octocat/repo/pull/42"),
            Some(42)
        );
        assert_eq!(
            parse_pr_number_from_url("https://github.com/octocat/repo/pull/7/files"),
            Some(7)
        );
        assert_eq!(
            parse_pr_number_from_url("https://github.com/octocat/repo/issues/9"),
            None
        );
    }

    #[test]
    fn validates_base_branch_tokens() {
        assert!(is_valid_branch_token("main"));
        assert!(is_valid_branch_token("release/0.2.2"));
        assert!(is_valid_branch_token("feat/Q587XR1C-email-refactor"));
        assert!(!is_valid_branch_token("--upload-pack=evil"));
        assert!(!is_valid_branch_token("has space"));
        assert!(!is_valid_branch_token(""));
    }
}

