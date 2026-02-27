#[tauri::command]
fn jira_connection_status(app: AppHandle) -> JiraConnectionStatusResponse {
    let request_id = request_id();
    let (workspace_root, workspace_meta) = match active_workspace_meta(&app) {
        Ok(value) => value,
        Err(error) => {
            return JiraConnectionStatusResponse {
                request_id,
                ok: false,
                connected: false,
                workspace_root: None,
                settings: None,
                has_token: None,
                jira_error: None,
                error: Some(error),
            }
        }
    };

    let settings = workspace_meta.jira_settings;
    if !settings.enabled || settings.site_url.trim().is_empty() || settings.account_email.trim().is_empty() {
        return JiraConnectionStatusResponse {
            request_id,
            ok: true,
            connected: false,
            workspace_root: Some(workspace_root.display().to_string()),
            settings: Some(settings),
            has_token: Some(false),
            jira_error: None,
            error: None,
        };
    }

    let has_token = match jira_read_token(&workspace_root, &settings.account_email) {
        Ok(value) => value.is_some(),
        Err(error) => {
            return JiraConnectionStatusResponse {
                request_id,
                ok: false,
                connected: false,
                workspace_root: Some(workspace_root.display().to_string()),
                settings: Some(settings),
                has_token: None,
                jira_error: Some(error.to_api_error()),
                error: Some(error.message),
            }
        }
    };

    JiraConnectionStatusResponse {
        request_id,
        ok: true,
        connected: has_token,
        workspace_root: Some(workspace_root.display().to_string()),
        settings: Some(settings),
        has_token: Some(has_token),
        jira_error: None,
        error: None,
    }
}

#[tauri::command]
async fn jira_connect_api_token(app: AppHandle, payload: JiraConnectApiTokenPayload) -> JiraConnectResponse {
    let request_id = request_id();
    let (workspace_root, mut workspace_meta) = match active_workspace_meta(&app) {
        Ok(value) => value,
        Err(error) => {
            return JiraConnectResponse {
                request_id,
                ok: false,
                workspace_root: None,
                settings: None,
                account_display_name: None,
                jira_error: None,
                error: Some(error),
            }
        }
    };

    let site_url = match normalize_jira_site_url(&payload.site_url) {
        Ok(value) if !value.is_empty() => value,
        Ok(_) => {
            return JiraConnectResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                settings: Some(workspace_meta.jira_settings),
                account_display_name: None,
                jira_error: None,
                error: Some("siteUrl must be a non-empty https URL.".to_string()),
            }
        }
        Err(error) => {
            return JiraConnectResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                settings: Some(workspace_meta.jira_settings),
                account_display_name: None,
                jira_error: None,
                error: Some(error),
            }
        }
    };

    let email = match normalize_jira_email(&payload.email) {
        Ok(value) if !value.is_empty() => value,
        Ok(_) => {
            return JiraConnectResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                settings: Some(workspace_meta.jira_settings),
                account_display_name: None,
                jira_error: None,
                error: Some("email must be a non-empty Jira account email.".to_string()),
            }
        }
        Err(error) => {
            return JiraConnectResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                settings: Some(workspace_meta.jira_settings),
                account_display_name: None,
                jira_error: None,
                error: Some(error),
            }
        }
    };

    let token = payload.api_token.trim().to_string();
    if token.is_empty() {
        return JiraConnectResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            settings: Some(workspace_meta.jira_settings),
            account_display_name: None,
            jira_error: None,
            error: Some("apiToken must be a non-empty string.".to_string()),
        };
    }

    let default_project_key = match normalize_jira_project_key(payload.default_project_key.as_deref()) {
        Ok(value) => value,
        Err(error) => {
            return JiraConnectResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                settings: Some(workspace_meta.jira_settings),
                account_display_name: None,
                jira_error: None,
                error: Some(error),
            }
        }
    };

    let jql = match normalize_jira_jql(payload.jql.as_deref()) {
        Ok(value) => value,
        Err(error) => {
            return JiraConnectResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                settings: Some(workspace_meta.jira_settings),
                account_display_name: None,
                jira_error: None,
                error: Some(error),
            }
        }
    };

    let secret = JiraConnectionSecret {
        site_url: site_url.clone(),
        email: email.clone(),
        token: token.clone(),
    };
    let client = reqwest::Client::builder()
        .user_agent("groove-jira-mvp")
        .build();
    let client = match client {
        Ok(client) => client,
        Err(error) => {
            return JiraConnectResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                settings: Some(workspace_meta.jira_settings),
                account_display_name: None,
                jira_error: None,
                error: Some(format!("Failed to initialize Jira HTTP client: {error}")),
            }
        }
    };

    let myself = match jira_fetch_myself(&client, &secret).await {
        Ok(value) => value,
        Err(error) => {
            return JiraConnectResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                settings: Some(workspace_meta.jira_settings),
                account_display_name: None,
                jira_error: Some(error.to_api_error()),
                error: Some(error.message),
            }
        }
    };

    if let Err(error) = jira_store_token(&workspace_root, &email, &token) {
        return JiraConnectResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            settings: Some(workspace_meta.jira_settings),
            account_display_name: None,
            jira_error: Some(error.to_api_error()),
            error: Some(error.message),
        };
    }

    workspace_meta.jira_settings.enabled = true;
    workspace_meta.jira_settings.site_url = site_url;
    workspace_meta.jira_settings.account_email = email;
    workspace_meta.jira_settings.default_project_key = default_project_key;
    workspace_meta.jira_settings.jql = jql;
    workspace_meta.jira_settings.sync_enabled = payload.sync_enabled.unwrap_or(true);
    workspace_meta.jira_settings.sync_open_issues_only = payload.sync_open_issues_only.unwrap_or(true);
    workspace_meta.jira_settings.last_sync_error = None;
    workspace_meta.updated_at = now_iso();

    if let Err(error) = persist_workspace_meta_update(&app, &workspace_root, &workspace_meta) {
        return JiraConnectResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            settings: Some(workspace_meta.jira_settings),
            account_display_name: myself.display_name,
            jira_error: None,
            error: Some(error),
        };
    }

    JiraConnectResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        settings: Some(workspace_meta.jira_settings),
        account_display_name: myself.display_name,
        jira_error: None,
        error: None,
    }
}

#[tauri::command]
fn jira_disconnect(app: AppHandle) -> JiraDisconnectResponse {
    let request_id = request_id();
    let (workspace_root, mut workspace_meta) = match active_workspace_meta(&app) {
        Ok(value) => value,
        Err(error) => {
            return JiraDisconnectResponse {
                request_id,
                ok: false,
                workspace_root: None,
                settings: None,
                error: Some(error),
            }
        }
    };

    if !workspace_meta.jira_settings.account_email.trim().is_empty() {
        let _ = jira_delete_token(&workspace_root, &workspace_meta.jira_settings.account_email);
    }

    workspace_meta.jira_settings = default_jira_settings();
    workspace_meta.updated_at = now_iso();

    if let Err(error) = persist_workspace_meta_update(&app, &workspace_root, &workspace_meta) {
        return JiraDisconnectResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            settings: Some(workspace_meta.jira_settings),
            error: Some(error),
        };
    }

    JiraDisconnectResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        settings: Some(workspace_meta.jira_settings),
        error: None,
    }
}

fn jira_connection_secret_from_workspace(
    workspace_root: &Path,
    workspace_meta: &WorkspaceMeta,
) -> Result<JiraConnectionSecret, JiraRuntimeError> {
    if !workspace_meta.jira_settings.enabled {
        return Err(JiraRuntimeError::new(
            "not_connected",
            "Jira is not connected for this workspace.".to_string(),
        ));
    }

    let site_url = normalize_jira_site_url(&workspace_meta.jira_settings.site_url)
        .map_err(|error| JiraRuntimeError::new("invalid_settings", error))?;
    let email = normalize_jira_email(&workspace_meta.jira_settings.account_email)
        .map_err(|error| JiraRuntimeError::new("invalid_settings", error))?;
    if site_url.is_empty() || email.is_empty() {
        return Err(JiraRuntimeError::new(
            "not_connected",
            "Jira settings are incomplete for this workspace.".to_string(),
        ));
    }

    let token = jira_read_token(workspace_root, &email)?.ok_or_else(|| {
        JiraRuntimeError::new(
            "missing_token",
            "Jira API token is missing from keychain for this workspace.".to_string(),
        )
    })?;

    Ok(JiraConnectionSecret { site_url, email, token })
}

#[tauri::command]
async fn jira_projects_list(app: AppHandle, payload: JiraProjectsListPayload) -> JiraProjectsListResponse {
    let request_id = request_id();
    let (workspace_root, workspace_meta) = match active_workspace_meta(&app) {
        Ok(value) => value,
        Err(error) => {
            return JiraProjectsListResponse {
                request_id,
                ok: false,
                workspace_root: None,
                projects: Vec::new(),
                jira_error: None,
                error: Some(error),
            }
        }
    };

    let secret = match jira_connection_secret_from_workspace(&workspace_root, &workspace_meta) {
        Ok(secret) => secret,
        Err(error) => {
            return JiraProjectsListResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                projects: Vec::new(),
                jira_error: Some(error.to_api_error()),
                error: Some(error.message),
            }
        }
    };

    let client = match reqwest::Client::builder().user_agent("groove-jira-mvp").build() {
        Ok(client) => client,
        Err(error) => {
            return JiraProjectsListResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                projects: Vec::new(),
                jira_error: None,
                error: Some(format!("Failed to initialize Jira HTTP client: {error}")),
            }
        }
    };

    match jira_fetch_projects(&client, &secret, payload.include_archived.unwrap_or(false)).await {
        Ok(projects) => JiraProjectsListResponse {
            request_id,
            ok: true,
            workspace_root: Some(workspace_root.display().to_string()),
            projects,
            jira_error: None,
            error: None,
        },
        Err(error) => JiraProjectsListResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            projects: Vec::new(),
            jira_error: Some(error.to_api_error()),
            error: Some(error.message),
        },
    }
}

#[tauri::command]
async fn jira_sync_pull(app: AppHandle, payload: JiraSyncPullPayload) -> JiraSyncPullResponse {
    let request_id = request_id();
    let (workspace_root, mut workspace_meta) = match active_workspace_meta(&app) {
        Ok(value) => value,
        Err(error) => {
            return JiraSyncPullResponse {
                request_id,
                ok: false,
                workspace_root: None,
                imported_count: 0,
                updated_count: 0,
                skipped_count: 0,
                settings: None,
                jira_error: None,
                error: Some(error),
            }
        }
    };

    let secret = match jira_connection_secret_from_workspace(&workspace_root, &workspace_meta) {
        Ok(secret) => secret,
        Err(error) => {
            return JiraSyncPullResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                imported_count: 0,
                updated_count: 0,
                skipped_count: 0,
                settings: Some(workspace_meta.jira_settings),
                jira_error: Some(error.to_api_error()),
                error: Some(error.message),
            }
        }
    };

    let normalized_jql = match normalize_jira_jql(payload.jql_override.as_deref()) {
        Ok(value) => value,
        Err(error) => {
            return JiraSyncPullResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                imported_count: 0,
                updated_count: 0,
                skipped_count: 0,
                settings: Some(workspace_meta.jira_settings),
                jira_error: None,
                error: Some(error),
            }
        }
    };
    let mut sync_jql = normalized_jql
        .or_else(|| workspace_meta.jira_settings.jql.clone())
        .unwrap_or_else(|| "assignee = currentUser() ORDER BY updated DESC".to_string());

    if workspace_meta.jira_settings.sync_open_issues_only {
        let has_status_filter = sync_jql.to_lowercase().contains("status");
        if !has_status_filter {
            sync_jql = format!("({sync_jql}) AND statusCategory != Done");
        }
    }

    let client = match reqwest::Client::builder().user_agent("groove-jira-mvp").build() {
        Ok(client) => client,
        Err(error) => {
            return JiraSyncPullResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                imported_count: 0,
                updated_count: 0,
                skipped_count: 0,
                settings: Some(workspace_meta.jira_settings),
                jira_error: None,
                error: Some(format!("Failed to initialize Jira HTTP client: {error}")),
            }
        }
    };

    let max_results = payload.max_results.unwrap_or(100).max(1).min(200);
    let fetched_issues = match jira_fetch_issues_for_sync(&client, &secret, &sync_jql, max_results).await {
        Ok(issues) => issues,
        Err(error) => {
            workspace_meta.jira_settings.last_sync_error = Some(error.message.clone());
            workspace_meta.updated_at = now_iso();
            let _ = persist_workspace_meta_update(&app, &workspace_root, &workspace_meta);

            return JiraSyncPullResponse {
                request_id,
                ok: false,
                workspace_root: Some(workspace_root.display().to_string()),
                imported_count: 0,
                updated_count: 0,
                skipped_count: 0,
                settings: Some(workspace_meta.jira_settings),
                jira_error: Some(error.to_api_error()),
                error: Some(error.message),
            };
        }
    };

    let (imported_count, updated_count, skipped_count) =
        sync_jira_issues_into_workspace_meta(&mut workspace_meta, &fetched_issues, &secret.site_url);
    workspace_meta.jira_settings.last_sync_at = Some(now_iso());
    workspace_meta.jira_settings.last_sync_error = None;
    workspace_meta.updated_at = now_iso();

    if let Err(error) = persist_workspace_meta_update(&app, &workspace_root, &workspace_meta) {
        return JiraSyncPullResponse {
            request_id,
            ok: false,
            workspace_root: Some(workspace_root.display().to_string()),
            imported_count,
            updated_count,
            skipped_count,
            settings: Some(workspace_meta.jira_settings),
            jira_error: None,
            error: Some(error),
        };
    }

    JiraSyncPullResponse {
        request_id,
        ok: true,
        workspace_root: Some(workspace_root.display().to_string()),
        imported_count,
        updated_count,
        skipped_count,
        settings: Some(workspace_meta.jira_settings),
        jira_error: None,
        error: None,
    }
}

#[tauri::command]
fn jira_issue_open_in_browser(app: AppHandle, payload: JiraIssueOpenInBrowserPayload) -> JiraIssueOpenInBrowserResponse {
    let request_id = request_id();
    let (_, workspace_meta) = match active_workspace_meta(&app) {
        Ok(value) => value,
        Err(error) => {
            return JiraIssueOpenInBrowserResponse {
                request_id,
                ok: false,
                url: None,
                error: Some(error),
            }
        }
    };

    let issue_key = payload.issue_key.trim().to_uppercase();
    if issue_key.is_empty() {
        return JiraIssueOpenInBrowserResponse {
            request_id,
            ok: false,
            url: None,
            error: Some("issueKey must be a non-empty string.".to_string()),
        };
    }

    let site_url = match normalize_jira_site_url(&workspace_meta.jira_settings.site_url) {
        Ok(value) if !value.is_empty() => value,
        _ => {
            return JiraIssueOpenInBrowserResponse {
                request_id,
                ok: false,
                url: None,
                error: Some("Jira site URL is not configured for this workspace.".to_string()),
            }
        }
    };

    let url = jira_issue_browse_url(&site_url, &issue_key);
    match open_url_in_default_browser(&url) {
        Ok(()) => JiraIssueOpenInBrowserResponse {
            request_id,
            ok: true,
            url: Some(url),
            error: None,
        },
        Err(error) => JiraIssueOpenInBrowserResponse {
            request_id,
            ok: false,
            url: Some(url),
            error: Some(error),
        },
    }
}
