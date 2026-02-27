use base64::Engine;
use reqwest::header::{AUTHORIZATION, RETRY_AFTER};
use sha2::{Digest, Sha256};

const JIRA_KEYCHAIN_SERVICE: &str = "groove.jira";
const JIRA_RETRY_ATTEMPTS: usize = 4;
const JIRA_SYNC_MAX_RESULTS_CAP: u32 = 200;

#[derive(Debug, Clone)]
struct JiraConnectionSecret {
    site_url: String,
    email: String,
    token: String,
}

#[derive(Debug, Clone)]
struct JiraRuntimeError {
    code: String,
    message: String,
    retry_after_seconds: Option<u64>,
}

impl JiraRuntimeError {
    fn new(code: &str, message: String) -> Self {
        Self {
            code: code.to_string(),
            message,
            retry_after_seconds: None,
        }
    }

    fn with_retry_after(mut self, retry_after_seconds: Option<u64>) -> Self {
        self.retry_after_seconds = retry_after_seconds;
        self
    }

    fn to_api_error(&self) -> JiraApiError {
        JiraApiError {
            code: self.code.clone(),
            message: self.message.clone(),
            retry_after_seconds: self.retry_after_seconds,
        }
    }
}

fn workspace_jira_hash(workspace_root: &Path) -> String {
    let mut hasher = Sha256::new();
    let normalized_root = workspace_root
        .canonicalize()
        .unwrap_or_else(|_| workspace_root.to_path_buf())
        .display()
        .to_string();
    hasher.update(normalized_root.as_bytes());
    let digest = hasher.finalize();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)
}

fn jira_keyring_account(workspace_root: &Path, email: &str) -> String {
    let workspace_hash = workspace_jira_hash(workspace_root);
    format!("{}:{}", workspace_hash, email.trim().to_lowercase())
}

fn jira_keyring_entry(workspace_root: &Path, email: &str) -> Result<keyring::Entry, JiraRuntimeError> {
    let account = jira_keyring_account(workspace_root, email);
    keyring::Entry::new(JIRA_KEYCHAIN_SERVICE, &account)
        .map_err(|error| JiraRuntimeError::new("keychain_error", format!("Failed to open keychain entry: {error}")))
}

fn jira_store_token(workspace_root: &Path, email: &str, token: &str) -> Result<(), JiraRuntimeError> {
    let entry = jira_keyring_entry(workspace_root, email)?;
    entry
        .set_password(token)
        .map_err(|error| JiraRuntimeError::new("keychain_error", format!("Failed to store Jira API token in keychain: {error}")))
}

fn jira_read_token(workspace_root: &Path, email: &str) -> Result<Option<String>, JiraRuntimeError> {
    let entry = jira_keyring_entry(workspace_root, email)?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(JiraRuntimeError::new(
            "keychain_error",
            format!("Failed to read Jira API token from keychain: {error}"),
        )),
    }
}

fn jira_delete_token(workspace_root: &Path, email: &str) -> Result<(), JiraRuntimeError> {
    let entry = jira_keyring_entry(workspace_root, email)?;
    match entry.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(JiraRuntimeError::new(
            "keychain_error",
            format!("Failed to remove Jira API token from keychain: {error}"),
        )),
    }
}

fn jira_auth_header_value(email: &str, token: &str) -> String {
    let raw = format!("{}:{}", email.trim(), token.trim());
    let encoded = base64::engine::general_purpose::STANDARD.encode(raw.as_bytes());
    format!("Basic {encoded}")
}

fn jitter_delay_ms(attempt: usize) -> u64 {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_nanos() as u64)
        .unwrap_or(0);
    let backoff_ms = 300_u64.saturating_mul(2_u64.saturating_pow(attempt as u32));
    let jitter_ms = nanos % 220;
    backoff_ms.saturating_add(jitter_ms).min(8_000)
}

fn parse_retry_after_seconds(response: &reqwest::Response) -> Option<u64> {
    response
        .headers()
        .get(RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok())
}

fn status_error_code(status: reqwest::StatusCode) -> &'static str {
    match status.as_u16() {
        400 => "invalid_request",
        401 | 403 => "auth_failed",
        404 => "not_found",
        429 => "rate_limited",
        500..=599 => "upstream_error",
        _ => "jira_http_error",
    }
}

async fn jira_get_json<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    secret: &JiraConnectionSecret,
    path_and_query: &str,
) -> Result<T, JiraRuntimeError> {
    let url = format!("{}{}", secret.site_url, path_and_query);
    let auth_header = jira_auth_header_value(&secret.email, &secret.token);
    let mut latest_error: Option<JiraRuntimeError> = None;

    for attempt in 0..=JIRA_RETRY_ATTEMPTS {
        let response = client
            .get(&url)
            .header(AUTHORIZATION, auth_header.clone())
            .header("Accept", "application/json")
            .send()
            .await;

        match response {
            Ok(response) => {
                if response.status().is_success() {
                    return response.json::<T>().await.map_err(|error| {
                        JiraRuntimeError::new(
                            "decode_error",
                            format!("Failed to parse Jira response payload: {error}"),
                        )
                    });
                }

                let status = response.status();
                let retry_after_seconds = parse_retry_after_seconds(&response);
                let body = response.text().await.unwrap_or_default();
                let body_line = body.lines().next().unwrap_or_default().trim().to_string();
                let message = if body_line.is_empty() {
                    format!("Jira request failed with status {}.", status.as_u16())
                } else {
                    format!("Jira request failed with status {}: {}", status.as_u16(), body_line)
                };

                let runtime_error = JiraRuntimeError::new(status_error_code(status), message)
                    .with_retry_after(retry_after_seconds);

                let should_retry = status == reqwest::StatusCode::TOO_MANY_REQUESTS || status.is_server_error();
                if should_retry && attempt < JIRA_RETRY_ATTEMPTS {
                    let delay_ms = retry_after_seconds
                        .map(|value| value.saturating_mul(1000))
                        .unwrap_or_else(|| jitter_delay_ms(attempt));
                    std::thread::sleep(Duration::from_millis(delay_ms));
                    latest_error = Some(runtime_error);
                    continue;
                }

                return Err(runtime_error);
            }
            Err(error) => {
                let runtime_error = JiraRuntimeError::new(
                    "network_error",
                    format!("Failed to reach Jira Cloud API: {error}"),
                );
                if attempt < JIRA_RETRY_ATTEMPTS {
                    std::thread::sleep(Duration::from_millis(jitter_delay_ms(attempt)));
                    latest_error = Some(runtime_error);
                    continue;
                }
                return Err(runtime_error);
            }
        }
    }

    Err(latest_error.unwrap_or_else(|| JiraRuntimeError::new("unknown", "Jira request failed.".to_string())))
}

async fn jira_post_json<B: serde::Serialize, T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    secret: &JiraConnectionSecret,
    path: &str,
    body: &B,
) -> Result<T, JiraRuntimeError> {
    let url = format!("{}{}", secret.site_url, path);
    let auth_header = jira_auth_header_value(&secret.email, &secret.token);
    let mut latest_error: Option<JiraRuntimeError> = None;

    for attempt in 0..=JIRA_RETRY_ATTEMPTS {
        let response = client
            .post(&url)
            .header(AUTHORIZATION, auth_header.clone())
            .header("Accept", "application/json")
            .json(body)
            .send()
            .await;

        match response {
            Ok(response) => {
                if response.status().is_success() {
                    return response.json::<T>().await.map_err(|error| {
                        JiraRuntimeError::new(
                            "decode_error",
                            format!("Failed to parse Jira response payload: {error}"),
                        )
                    });
                }

                let status = response.status();
                let retry_after_seconds = parse_retry_after_seconds(&response);
                let body = response.text().await.unwrap_or_default();
                let body_line = body.lines().next().unwrap_or_default().trim().to_string();
                let message = if body_line.is_empty() {
                    format!("Jira request failed with status {}.", status.as_u16())
                } else {
                    format!("Jira request failed with status {}: {}", status.as_u16(), body_line)
                };

                let runtime_error = JiraRuntimeError::new(status_error_code(status), message)
                    .with_retry_after(retry_after_seconds);

                let should_retry = status == reqwest::StatusCode::TOO_MANY_REQUESTS || status.is_server_error();
                if should_retry && attempt < JIRA_RETRY_ATTEMPTS {
                    let delay_ms = retry_after_seconds
                        .map(|value| value.saturating_mul(1000))
                        .unwrap_or_else(|| jitter_delay_ms(attempt));
                    std::thread::sleep(Duration::from_millis(delay_ms));
                    latest_error = Some(runtime_error);
                    continue;
                }

                return Err(runtime_error);
            }
            Err(error) => {
                let runtime_error = JiraRuntimeError::new(
                    "network_error",
                    format!("Failed to reach Jira Cloud API: {error}"),
                );
                if attempt < JIRA_RETRY_ATTEMPTS {
                    std::thread::sleep(Duration::from_millis(jitter_delay_ms(attempt)));
                    latest_error = Some(runtime_error);
                    continue;
                }
                return Err(runtime_error);
            }
        }
    }

    Err(latest_error.unwrap_or_else(|| JiraRuntimeError::new("unknown", "Jira request failed.".to_string())))
}

fn jira_priority_from_name(name: Option<&str>) -> TaskPriority {
    let normalized = name.unwrap_or("medium").trim().to_lowercase();
    if normalized.contains("blocker") || normalized.contains("critical") || normalized.contains("highest") {
        TaskPriority::Urgent
    } else if normalized.contains("high") {
        TaskPriority::High
    } else if normalized.contains("low") || normalized.contains("lowest") {
        TaskPriority::Low
    } else {
        TaskPriority::Medium
    }
}

fn jira_description_to_text(value: Option<&serde_json::Value>) -> String {
    fn collect_text(value: &serde_json::Value, output: &mut Vec<String>) {
        match value {
            serde_json::Value::String(text) => {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    output.push(trimmed.to_string());
                }
            }
            serde_json::Value::Array(items) => {
                for item in items {
                    collect_text(item, output);
                }
            }
            serde_json::Value::Object(map) => {
                if let Some(text) = map.get("text").and_then(|item| item.as_str()) {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        output.push(trimmed.to_string());
                    }
                }
                if let Some(content) = map.get("content") {
                    collect_text(content, output);
                }
            }
            _ => {}
        }
    }

    let Some(value) = value else {
        return String::new();
    };

    let mut chunks = Vec::new();
    collect_text(value, &mut chunks);
    chunks.join("\n").trim().to_string()
}

fn compose_jira_task_description(issue: &JiraIssueWire) -> String {
    let status = issue
        .fields
        .status
        .as_ref()
        .map(|status| status.name.trim())
        .filter(|status| !status.is_empty())
        .unwrap_or("Unknown");
    let priority = issue
        .fields
        .priority
        .as_ref()
        .map(|priority| priority.name.trim())
        .filter(|priority| !priority.is_empty())
        .unwrap_or("Unknown");
    let details = jira_description_to_text(issue.fields.description.as_ref());

    if details.is_empty() {
        format!("Status: {status}\nPriority: {priority}")
    } else {
        format!("Status: {status}\nPriority: {priority}\n\n{details}")
    }
}

fn jira_issue_browse_url(site_url: &str, issue_key: &str) -> String {
    format!("{}/browse/{}", site_url.trim_end_matches('/'), issue_key)
}

fn sync_jira_issues_into_workspace_meta(
    workspace_meta: &mut WorkspaceMeta,
    issues: &[JiraIssueWire],
    site_url: &str,
) -> (usize, usize, usize) {
    let now = now_iso();
    let mut imported_count = 0usize;
    let mut updated_count = 0usize;
    let mut skipped_count = 0usize;
    let chunk_size = 4usize;

    for chunk in issues.chunks(chunk_size) {
        for issue in chunk {
            let issue_key = issue.key.trim();
            if issue_key.is_empty() {
                skipped_count += 1;
                continue;
            }

            let title = issue.fields.summary.trim();
            let resolved_title = if title.is_empty() { issue_key } else { title };
            let description = compose_jira_task_description(issue);
            let mapped_priority = jira_priority_from_name(issue.fields.priority.as_ref().map(|value| value.name.as_str()));
            let external_url = jira_issue_browse_url(site_url, issue_key);

            if let Some(existing) = workspace_meta.tasks.iter_mut().find(|task| {
                task.external_id.as_deref() == Some(issue_key)
                    || (task.origin == TaskOrigin::ExternalSync
                        && task.external_url.as_deref() == Some(external_url.as_str()))
            }) {
                existing.title = resolved_title.to_string();
                existing.description = description;
                existing.priority = mapped_priority.clone();
                existing.origin = TaskOrigin::ExternalSync;
                existing.external_id = Some(issue_key.to_string());
                existing.external_url = Some(external_url);
                existing.updated_at = now.clone();
                updated_count += 1;
                continue;
            }

            workspace_meta.tasks.push(WorkspaceTask {
                id: Uuid::new_v4().to_string(),
                title: resolved_title.to_string(),
                description,
                priority: mapped_priority.clone(),
                consellour_priority: mapped_priority,
                created_at: now.clone(),
                updated_at: now.clone(),
                last_interacted_at: now.clone(),
                origin: TaskOrigin::ExternalSync,
                external_id: Some(issue_key.to_string()),
                external_url: Some(external_url),
            });
            imported_count += 1;
        }
    }

    (imported_count, updated_count, skipped_count)
}

async fn jira_fetch_myself(
    client: &reqwest::Client,
    secret: &JiraConnectionSecret,
) -> Result<JiraMyselfResponse, JiraRuntimeError> {
    jira_get_json(client, secret, "/rest/api/3/myself").await
}

async fn jira_fetch_projects(
    client: &reqwest::Client,
    secret: &JiraConnectionSecret,
    include_archived: bool,
) -> Result<Vec<JiraProjectSummary>, JiraRuntimeError> {
    let path = if include_archived {
        "/rest/api/3/project/search?maxResults=100&startAt=0".to_string()
    } else {
        "/rest/api/3/project/search?maxResults=100&startAt=0&status=live".to_string()
    };
    let response = jira_get_json::<JiraProjectSearchResponse>(client, secret, &path).await?;
    Ok(response
        .values
        .into_iter()
        .map(|project| JiraProjectSummary {
            key: project.key,
            name: project.name,
            project_type_key: project.project_type_key,
        })
        .collect())
}

async fn jira_fetch_issues_for_sync(
    client: &reqwest::Client,
    secret: &JiraConnectionSecret,
    jql: &str,
    max_results: u32,
) -> Result<Vec<JiraIssueWire>, JiraRuntimeError> {
    let capped_max_results = max_results.max(1).min(JIRA_SYNC_MAX_RESULTS_CAP);
    let mut all_issues = Vec::<JiraIssueWire>::new();
    let mut next_page_token: Option<String> = None;

    while (all_issues.len() as u32) < capped_max_results {
        let remaining = capped_max_results.saturating_sub(all_issues.len() as u32);
        let page_size = remaining.min(50);
        let request_body = JiraIssueSearchJqlRequest {
            jql: jql.to_string(),
            max_results: page_size,
            fields: vec![
                "summary".to_string(),
                "description".to_string(),
                "status".to_string(),
                "priority".to_string(),
            ],
            next_page_token: next_page_token.clone(),
        };
        let response = jira_post_json::<JiraIssueSearchJqlRequest, JiraIssueSearchResponse>(
            client,
            secret,
            "/rest/api/3/search/jql",
            &request_body,
        )
        .await?;
        if response.issues.is_empty() {
            break;
        }

        next_page_token = response
            .next_page_token
            .and_then(|token| if token.trim().is_empty() { None } else { Some(token) });
        all_issues.extend(response.issues);

        if next_page_token.is_none() {
            break;
        }
    }

    Ok(all_issues)
}
