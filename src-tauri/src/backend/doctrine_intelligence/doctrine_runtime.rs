// Doctrine intelligence: scans worktrees, reads each one's Claude Code
// conversation JSONL, picks the first 5 + last 5 user prompts, and packages
// the result into a report with an exact tiktoken-based input-token count.
//
// This file is `include!()`'d into the registry's translation unit, so it
// shares scope with `WorkspaceMeta`, `WorktreeRecord`, `SummaryRecord`,
// `read_workspace_meta_file`, `effective_workspace_root`, `request_id`,
// `encode_claude_project_dir_name`, `dirs_home`, etc.

const DOCTRINE_DEFAULT_MAX_CASES: usize = 15;
const DOCTRINE_PROMPTS_PER_CASE: usize = 10;
const DOCTRINE_PROMPTS_HEAD: usize = 5;
const DOCTRINE_PROMPTS_TAIL: usize = 5;

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DoctrineReportRequest {
    #[serde(default)]
    max_cases: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DoctrineWorktreeCase {
    branch: String,
    prompts: Vec<String>,
    date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    summary: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DoctrineReportResponse {
    request_id: String,
    ok: bool,
    cases: Vec<DoctrineWorktreeCase>,
    report_text: String,
    input_tokens: usize,
    worktrees_scanned: usize,
    worktrees_qualified: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

struct DoctrineSessionExtract {
    prompts: Vec<String>,
    claude_summaries: Vec<String>,
    latest_timestamp: Option<String>,
}

fn doctrine_count_input_tokens(text: &str) -> usize {
    use once_cell::sync::Lazy;
    static BPE: Lazy<Option<tiktoken_rs::CoreBPE>> =
        Lazy::new(|| tiktoken_rs::cl100k_base().ok());
    match BPE.as_ref() {
        Some(bpe) => bpe.encode_with_special_tokens(text).len(),
        // Fallback only if cl100k_base failed to load — chars/4 is a rough Claude approximation.
        None => text.chars().count() / 4,
    }
}

fn doctrine_find_latest_session_jsonl(worktree_path: &Path) -> Option<PathBuf> {
    let home = dirs_home()?;
    let project_dir = home
        .join(".claude")
        .join("projects")
        .join(encode_claude_project_dir_name(worktree_path));
    if !path_is_directory(&project_dir) {
        return None;
    }
    let entries = fs::read_dir(&project_dir).ok()?;
    let mut latest: Option<(std::time::SystemTime, PathBuf)> = None;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|v| v.to_str()) != Some("jsonl") {
            continue;
        }
        let Ok(metadata) = entry.metadata() else { continue };
        let Ok(modified) = metadata.modified() else { continue };
        match &latest {
            Some((current, _)) if *current >= modified => {}
            _ => latest = Some((modified, path)),
        }
    }
    latest.map(|(_, path)| path)
}

fn doctrine_extract_user_text(message_value: &serde_json::Value) -> Option<String> {
    let content = message_value.get("content")?;
    if let Some(s) = content.as_str() {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            return None;
        }
        // Skip Claude Code's command-message envelopes — those are slash-command echoes, not user intent.
        if trimmed.starts_with("<command-message>")
            || trimmed.starts_with("<command-name>")
            || trimmed.starts_with("<local-command-stdout>")
        {
            return None;
        }
        return Some(s.to_string());
    }
    if let Some(arr) = content.as_array() {
        let mut buf = String::new();
        for item in arr {
            let t = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
            // tool_result blocks are tool output, not user text.
            if t == "tool_result" {
                continue;
            }
            if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                if !buf.is_empty() {
                    buf.push('\n');
                }
                buf.push_str(text);
            }
        }
        let trimmed = buf.trim();
        if trimmed.is_empty() {
            return None;
        }
        return Some(buf);
    }
    None
}

fn doctrine_extract_session(path: &Path) -> Option<DoctrineSessionExtract> {
    use std::io::BufRead;
    let file = fs::File::open(path).ok()?;
    let reader = std::io::BufReader::new(file);
    let mut prompts: Vec<String> = Vec::new();
    let mut claude_summaries: Vec<String> = Vec::new();
    let mut latest_timestamp: Option<String> = None;

    for line in reader.lines() {
        let Ok(line) = line else { continue };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) else {
            continue;
        };

        // Sidechain (subagent) messages aren't part of the user's main thread.
        if value
            .get("isSidechain")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            continue;
        }

        let entry_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match entry_type {
            "user" => {
                if let Some(message) = value.get("message") {
                    if let Some(text) = doctrine_extract_user_text(message) {
                        prompts.push(text);
                    }
                }
            }
            "summary" => {
                let s = value
                    .get("summary")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if !s.is_empty() {
                    claude_summaries.push(s);
                }
            }
            _ => {}
        }

        if let Some(ts) = value.get("timestamp").and_then(|v| v.as_str()) {
            let later = match latest_timestamp.as_deref() {
                Some(prev) => ts > prev,
                None => true,
            };
            if later {
                latest_timestamp = Some(ts.to_string());
            }
        }
    }

    Some(DoctrineSessionExtract {
        prompts,
        claude_summaries,
        latest_timestamp,
    })
}

fn doctrine_window_prompts(prompts: &[String]) -> Vec<String> {
    if prompts.len() <= DOCTRINE_PROMPTS_PER_CASE {
        return prompts.to_vec();
    }
    let head = &prompts[..DOCTRINE_PROMPTS_HEAD];
    let tail = &prompts[prompts.len() - DOCTRINE_PROMPTS_TAIL..];
    let mut out = Vec::with_capacity(DOCTRINE_PROMPTS_PER_CASE);
    out.extend(head.iter().cloned());
    out.extend(tail.iter().cloned());
    out
}

fn doctrine_choose_summary(record: &WorktreeRecord, jsonl_summaries: &[String]) -> Option<String> {
    // Prefer the most-recent app-stored summary (richer, curated). Fall back
    // to the most recent Claude JSONL summary. When the app summary has both
    // a one-liner and full body, fold them so claude sees both.
    if let Some(latest) = record
        .summaries
        .iter()
        .max_by(|a, b| a.created_at.cmp(&b.created_at))
    {
        let one_liner = latest.one_liner.trim();
        let full = latest.summary.trim();
        match (one_liner.is_empty(), full.is_empty()) {
            (false, false) => return Some(format!("**{one_liner}**\n\n{full}")),
            (true, false) => return Some(full.to_string()),
            (false, true) => return Some(one_liner.to_string()),
            (true, true) => {}
        }
    }
    jsonl_summaries
        .last()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn doctrine_assemble_report(cases: &[DoctrineWorktreeCase]) -> String {
    let mut out = String::new();
    out.push_str("# Doctrine Report\n\n");
    out.push_str(&format!("Cases: {}\n\n", cases.len()));
    for (idx, case) in cases.iter().enumerate() {
        out.push_str(&format!("## Case {} — `{}`\n\n", idx + 1, case.branch));
        out.push_str(&format!("**Last activity:** {}\n\n", case.date));
        match &case.summary {
            Some(summary) => {
                out.push_str("### What this branch was about\n\n");
                out.push_str(summary);
                out.push_str("\n\n");
            }
            None => {
                out.push_str("### What this branch was about\n\n");
                out.push_str("_No summary recorded for this worktree._\n\n");
            }
        }
        out.push_str("### User prompts (first 5 + last 5)\n\n");
        for (pidx, prompt) in case.prompts.iter().enumerate() {
            out.push_str(&format!("{}. {}\n", pidx + 1, prompt.replace('\n', " ⏎ ")));
        }
        out.push_str("\n---\n\n");
    }
    out
}

fn doctrine_generate_report_blocking(
    app: AppHandle,
    payload: DoctrineReportRequest,
    request_id: String,
) -> DoctrineReportResponse {
    let max_cases = payload.max_cases.unwrap_or(DOCTRINE_DEFAULT_MAX_CASES).max(1);

    let workspace_root = match active_workspace_root_from_state(&app) {
        Ok(value) => value,
        Err(error) => {
            return DoctrineReportResponse {
                request_id,
                ok: false,
                cases: Vec::new(),
                report_text: String::new(),
                input_tokens: 0,
                worktrees_scanned: 0,
                worktrees_qualified: 0,
                error: Some(error),
            };
        }
    };

    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    let meta = match read_workspace_meta_file(&workspace_json) {
        Ok(meta) => meta,
        Err(error) => {
            return DoctrineReportResponse {
                request_id,
                ok: false,
                cases: Vec::new(),
                report_text: String::new(),
                input_tokens: 0,
                worktrees_scanned: 0,
                worktrees_qualified: 0,
                error: Some(format!("Failed to read workspace metadata: {error}")),
            };
        }
    };

    let scan_root = effective_workspace_root(&workspace_root, &meta);
    let mut candidates: Vec<DoctrineWorktreeCase> = Vec::new();
    let mut scanned = 0usize;

    for (worktree_name, record) in &meta.worktree_records {
        scanned += 1;
        let worktree_path = scan_root.join(".worktrees").join(worktree_name);

        let Some(jsonl_path) = doctrine_find_latest_session_jsonl(&worktree_path) else {
            // No Claude conversation on disk — skip.
            continue;
        };
        let Some(extract) = doctrine_extract_session(&jsonl_path) else {
            continue;
        };
        if extract.prompts.is_empty() {
            continue;
        }

        let has_app_summary = !record.summaries.is_empty();
        let has_jsonl_summary = !extract.claude_summaries.is_empty();
        if !has_app_summary && !has_jsonl_summary {
            continue;
        }

        let date = extract
            .latest_timestamp
            .clone()
            .unwrap_or_else(|| record.created_at.clone());

        candidates.push(DoctrineWorktreeCase {
            branch: branch_guess_from_worktree_name(worktree_name),
            prompts: doctrine_window_prompts(&extract.prompts),
            date,
            summary: doctrine_choose_summary(record, &extract.claude_summaries),
        });
    }

    // Most-recent activity first.
    candidates.sort_by(|a, b| b.date.cmp(&a.date));
    if candidates.len() > max_cases {
        candidates.truncate(max_cases);
    }

    let report_text = doctrine_assemble_report(&candidates);
    let input_tokens = doctrine_count_input_tokens(&report_text);

    DoctrineReportResponse {
        request_id,
        ok: true,
        worktrees_qualified: candidates.len(),
        cases: candidates,
        report_text,
        input_tokens,
        worktrees_scanned: scanned,
        error: None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum DoctrineState {
    Ready,
    Inactive,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DoctrineRecord {
    id: String,
    created_at: String,
    input_tokens: usize,
    output_tokens: usize,
    result: String,
    state: DoctrineState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    instructions: Option<String>,
    // Imperative directives distilled from `result`'s `## Doctrine Directives`
    // section, stored verbatim so prompt injection never re-parses Markdown.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    directives: Option<String>,
}

const DOCTRINE_STORE_VERSION: u32 = 2;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DoctrineStore {
    #[serde(default = "default_doctrine_store_version")]
    version: u32,
    #[serde(default)]
    doctrines: Vec<DoctrineRecord>,
}

fn default_doctrine_store_version() -> u32 {
    DOCTRINE_STORE_VERSION
}

impl Default for DoctrineStore {
    fn default() -> Self {
        Self {
            version: DOCTRINE_STORE_VERSION,
            doctrines: Vec::new(),
        }
    }
}

fn doctrine_store_path(workspace_root: &Path) -> PathBuf {
    workspace_root.join(".groove").join("doctrines.json")
}

fn read_doctrine_store(workspace_root: &Path) -> Result<DoctrineStore, String> {
    let path = doctrine_store_path(workspace_root);
    if !path_is_file(&path) {
        return Ok(DoctrineStore::default());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    if raw.trim().is_empty() {
        return Ok(DoctrineStore::default());
    }
    serde_json::from_str::<DoctrineStore>(&raw)
        .map_err(|error| format!("Failed to parse {}: {error}", path.display()))
}

fn write_doctrine_store(workspace_root: &Path, store: &DoctrineStore) -> Result<(), String> {
    let groove_dir = workspace_root.join(".groove");
    fs::create_dir_all(&groove_dir)
        .map_err(|error| format!("Failed to create {}: {error}", groove_dir.display()))?;
    let path = doctrine_store_path(workspace_root);
    let body = serde_json::to_string_pretty(store)
        .map_err(|error| format!("Failed to serialize doctrine store: {error}"))?;
    fs::write(&path, body)
        .map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

/// Extract the body of the `## Doctrine Directives` section from a generated
/// doctrine Markdown document. Returns the trimmed text between that heading
/// and the next `## ` heading (or end of document), or None if absent/empty.
fn doctrine_parse_directives(markdown: &str) -> Option<String> {
    let mut lines = markdown.lines();
    // Find the directives heading (match on the heading text, ignore case/level).
    for line in lines.by_ref() {
        let h = line.trim_start_matches('#').trim();
        if line.trim_start().starts_with('#') && h.eq_ignore_ascii_case("Doctrine Directives") {
            break;
        }
    }
    let mut body = String::new();
    for line in lines {
        // Stop at the next top-level (## or #) heading.
        let trimmed = line.trim_start();
        if trimmed.starts_with("# ") || trimmed.starts_with("## ") {
            break;
        }
        body.push_str(line);
        body.push('\n');
    }
    let trimmed = body.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Read the workspace's doctrine store and return the directives of the active
/// (`Ready`) doctrine, if one exists and has non-empty directives.
fn doctrine_active_directives(workspace_root: &Path) -> Option<String> {
    let store = read_doctrine_store(workspace_root).ok()?;
    store
        .doctrines
        .iter()
        .find(|record| record.state == DoctrineState::Ready)
        .and_then(|record| record.directives.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn doctrine_now_iso() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn doctrine_sort_records_desc(records: &mut [DoctrineRecord]) {
    records.sort_by(|a, b| b.created_at.cmp(&a.created_at));
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DoctrineResultRequest {
    report_text: String,
    #[serde(default)]
    instructions: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DoctrineResultResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    new_doctrine_id: Option<String>,
    #[serde(default)]
    doctrines: Vec<DoctrineRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DoctrineListResponse {
    request_id: String,
    ok: bool,
    #[serde(default)]
    doctrines: Vec<DoctrineRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DoctrineSetActiveRequest {
    id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DoctrineSetActiveResponse {
    request_id: String,
    ok: bool,
    #[serde(default)]
    doctrines: Vec<DoctrineRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

const DOCTRINE_RESULT_INSTRUCTIONS: &str = "You are analyzing a Doctrine Report extracted from real coding sessions across multiple worktrees. Each case in the report contains three signals — treat them with different weights:

- **Branch name** — often cryptic (release tags, internal slugs); never use the branch name alone to infer what the work was about.
- **\"What this branch was about\"** — the curated summary of the actual work that happened. THIS is your primary signal for understanding intent and for categorization.
- **\"User prompts\"** — the first 5 and last 5 user prompts in that session. Use these to characterize *how* the user approaches their work, not what the work was.

Ground every observation in the summary first; quote prompts only as evidence for *style* of approach.

Produce a single Markdown document with this structure:

1. `# Doctrine Analysis` — a 2-3 sentence overview of what the report shows.
2. `## Categorization` — a table or bullet list with one row per case. Each row must include: the branch (in code formatting), a one-sentence \"About:\" derived from the summary so the reader knows what each branch was, and one or more categories (e.g. \"bug\", \"feature\", \"fix\", \"frontend fix\", \"refactor\", \"infrastructure\", \"investigation\", \"docs\", \"performance\", \"tests\" — invent more when the report calls for them).
3. `## Approach by category` — for each category that has at least one case, write a `### {category}` subsection. Under it, write **How is the user approaching these issues?** and describe recurring patterns in scope, level of detail, iteration style, blockers. For every claim, name at least one specific branch (and what that branch was about, per its summary) and quote short fragments from real prompts as evidence.
4. `## Cross-cutting observations` — a short closing section noting patterns that span categories.
5. `## Doctrine Directives` — distill everything above into 5-10 **imperative, actionable** bullet points that a coding agent should follow when starting brand-new work in this codebase. Each bullet is a directive (\"Scope each change to a single concern.\", \"Write the failing test before the fix.\", \"State the acceptance check up front.\"), grounded in the observed patterns — not a description of what the user did. Keep each bullet to one sentence. This section is consumed verbatim as guidance injected into new sessions, so write directives that stand on their own without the rest of the document.

If a case has no summary, say so explicitly when you mention it instead of inventing intent from its branch name or prompts.

Output ONLY the Markdown — no preamble, no meta-commentary, no fenced code wrapper around the whole document.";

fn doctrine_generate_result_blocking(
    app: AppHandle,
    payload: DoctrineResultRequest,
    request_id: String,
) -> DoctrineResultResponse {
    let report_text = payload.report_text.trim();
    if report_text.is_empty() {
        return DoctrineResultResponse {
            request_id,
            ok: false,
            new_doctrine_id: None,
            doctrines: Vec::new(),
            error: Some("Report text is empty. Generate a doctrine report first.".to_string()),
        };
    }

    let workspace_root = match active_workspace_root_from_state(&app) {
        Ok(value) => value,
        Err(error) => {
            return DoctrineResultResponse {
                request_id,
                ok: false,
                new_doctrine_id: None,
                doctrines: Vec::new(),
                error: Some(error),
            };
        }
    };

    let claude_bin = resolve_claude_code_bin();
    let extra_instructions = payload
        .instructions
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let mut prompt = String::with_capacity(
        DOCTRINE_RESULT_INSTRUCTIONS.len()
            + report_text.len()
            + extra_instructions.map(str::len).unwrap_or(0)
            + 256,
    );
    prompt.push_str(DOCTRINE_RESULT_INSTRUCTIONS);
    prompt.push_str("\n\n");
    if let Some(extra) = extra_instructions {
        prompt.push_str(
            "ADDITIONAL INSTRUCTIONS FROM THE USER (apply these on top of the structure above; if they conflict with the structure, prefer the user's intent while still emitting Markdown only):\n\n",
        );
        prompt.push_str(extra);
        prompt.push_str("\n\n");
    }
    prompt.push_str("---\nDOCTRINE REPORT:\n\n");
    prompt.push_str(report_text);

    // Pipe the prompt over stdin: an argv-based prompt blows past Linux's
    // MAX_ARG_STRLEN (~128 KB per arg) once a doctrine report grows.
    let mut child = match Command::new(&claude_bin)
        .args(["-p", "--output-format", "text"])
        .current_dir(&workspace_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            return DoctrineResultResponse {
                request_id,
                ok: false,
                new_doctrine_id: None,
                doctrines: Vec::new(),
                error: Some(format!(
                    "Failed to spawn '{claude_bin}': {error}. Is Claude Code installed and on PATH?"
                )),
            };
        }
    };

    if let Some(mut stdin) = child.stdin.take() {
        if let Err(error) = stdin.write_all(prompt.as_bytes()) {
            let _ = child.kill();
            return DoctrineResultResponse {
                request_id,
                ok: false,
                new_doctrine_id: None,
                doctrines: Vec::new(),
                error: Some(format!("Failed to write prompt to Claude CLI stdin: {error}")),
            };
        }
        // Dropping stdin closes it so claude knows the prompt is complete.
    }

    let raw = match child.wait_with_output() {
        Ok(out) if out.status.success() => out,
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let detail = if !stderr.is_empty() {
                stderr
            } else if !stdout.is_empty() {
                stdout
            } else {
                format!("exit code {:?}", out.status.code())
            };
            return DoctrineResultResponse {
                request_id,
                ok: false,
                new_doctrine_id: None,
                doctrines: Vec::new(),
                error: Some(format!("Claude CLI failed: {detail}")),
            };
        }
        Err(error) => {
            return DoctrineResultResponse {
                request_id,
                ok: false,
                new_doctrine_id: None,
                doctrines: Vec::new(),
                error: Some(format!("Failed to wait for Claude CLI: {error}")),
            };
        }
    };

    let markdown = String::from_utf8_lossy(&raw.stdout).trim().to_string();
    if markdown.is_empty() {
        return DoctrineResultResponse {
            request_id,
            ok: false,
            new_doctrine_id: None,
            doctrines: Vec::new(),
            error: Some("Claude CLI returned an empty response.".to_string()),
        };
    }

    let mut store = match read_doctrine_store(&workspace_root) {
        Ok(store) => store,
        Err(error) => {
            return DoctrineResultResponse {
                request_id,
                ok: false,
                new_doctrine_id: None,
                doctrines: Vec::new(),
                error: Some(error),
            };
        }
    };

    for record in store.doctrines.iter_mut() {
        record.state = DoctrineState::Inactive;
    }

    let directives = doctrine_parse_directives(&markdown);
    let new_record = DoctrineRecord {
        id: Uuid::new_v4().to_string(),
        created_at: doctrine_now_iso(),
        input_tokens: doctrine_count_input_tokens(&prompt),
        output_tokens: doctrine_count_input_tokens(&markdown),
        result: markdown,
        state: DoctrineState::Ready,
        instructions: extra_instructions.map(str::to_string),
        directives,
    };
    let new_id = new_record.id.clone();
    store.doctrines.push(new_record);

    if let Err(error) = write_doctrine_store(&workspace_root, &store) {
        return DoctrineResultResponse {
            request_id,
            ok: false,
            new_doctrine_id: None,
            doctrines: Vec::new(),
            error: Some(error),
        };
    }

    doctrine_sort_records_desc(&mut store.doctrines);

    DoctrineResultResponse {
        request_id,
        ok: true,
        new_doctrine_id: Some(new_id),
        doctrines: store.doctrines,
        error: None,
    }
}

fn doctrine_list_blocking(app: AppHandle, request_id: String) -> DoctrineListResponse {
    let workspace_root = match active_workspace_root_from_state(&app) {
        Ok(value) => value,
        Err(error) => {
            return DoctrineListResponse {
                request_id,
                ok: false,
                doctrines: Vec::new(),
                error: Some(error),
            };
        }
    };

    let mut store = match read_doctrine_store(&workspace_root) {
        Ok(store) => store,
        Err(error) => {
            return DoctrineListResponse {
                request_id,
                ok: false,
                doctrines: Vec::new(),
                error: Some(error),
            };
        }
    };

    doctrine_sort_records_desc(&mut store.doctrines);

    DoctrineListResponse {
        request_id,
        ok: true,
        doctrines: store.doctrines,
        error: None,
    }
}

fn doctrine_set_active_blocking(
    app: AppHandle,
    payload: DoctrineSetActiveRequest,
    request_id: String,
) -> DoctrineSetActiveResponse {
    let target_id = payload.id.trim();
    if target_id.is_empty() {
        return DoctrineSetActiveResponse {
            request_id,
            ok: false,
            doctrines: Vec::new(),
            error: Some("Doctrine id is required.".to_string()),
        };
    }

    let workspace_root = match active_workspace_root_from_state(&app) {
        Ok(value) => value,
        Err(error) => {
            return DoctrineSetActiveResponse {
                request_id,
                ok: false,
                doctrines: Vec::new(),
                error: Some(error),
            };
        }
    };

    let mut store = match read_doctrine_store(&workspace_root) {
        Ok(store) => store,
        Err(error) => {
            return DoctrineSetActiveResponse {
                request_id,
                ok: false,
                doctrines: Vec::new(),
                error: Some(error),
            };
        }
    };

    if !store.doctrines.iter().any(|record| record.id == target_id) {
        return DoctrineSetActiveResponse {
            request_id,
            ok: false,
            doctrines: Vec::new(),
            error: Some(format!("No doctrine with id '{target_id}' exists.")),
        };
    }

    for record in store.doctrines.iter_mut() {
        record.state = if record.id == target_id {
            DoctrineState::Ready
        } else {
            DoctrineState::Inactive
        };
    }

    if let Err(error) = write_doctrine_store(&workspace_root, &store) {
        return DoctrineSetActiveResponse {
            request_id,
            ok: false,
            doctrines: Vec::new(),
            error: Some(error),
        };
    }

    doctrine_sort_records_desc(&mut store.doctrines);

    DoctrineSetActiveResponse {
        request_id,
        ok: true,
        doctrines: store.doctrines,
        error: None,
    }
}

#[cfg(test)]
mod doctrine_directives_tests {
    use super::*;

    fn record(id: &str, state: DoctrineState, directives: Option<&str>) -> DoctrineRecord {
        DoctrineRecord {
            id: id.to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            input_tokens: 0,
            output_tokens: 0,
            result: String::new(),
            state,
            instructions: None,
            directives: directives.map(str::to_string),
        }
    }

    #[test]
    fn parse_directives_extracts_section_and_stops_at_next_heading() {
        let markdown = "# Doctrine Analysis\n\nOverview.\n\n## Doctrine Directives\n\n- Scope each change to one concern.\n- Write the failing test first.\n\n## Cross-cutting observations\n\nIgnored.\n";
        let parsed = doctrine_parse_directives(markdown).expect("directives present");
        assert!(parsed.contains("Scope each change to one concern."));
        assert!(parsed.contains("Write the failing test first."));
        assert!(!parsed.contains("Ignored."));
        assert!(!parsed.contains("Cross-cutting"));
    }

    #[test]
    fn parse_directives_returns_none_when_absent_or_empty() {
        assert!(doctrine_parse_directives("# Doctrine Analysis\n\nNo directives here.\n").is_none());
        // Heading present but body empty.
        assert!(doctrine_parse_directives("## Doctrine Directives\n\n## Next\n").is_none());
    }

    #[test]
    fn active_directives_returns_ready_record_only() {
        let workspace_root =
            std::env::temp_dir().join(format!("groove-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(workspace_root.join(".groove")).expect("mkdir workspace");

        let store = DoctrineStore {
            version: DOCTRINE_STORE_VERSION,
            doctrines: vec![
                record("old", DoctrineState::Inactive, Some("- Stale directive.")),
                record("active", DoctrineState::Ready, Some("- Use the active directive.")),
            ],
        };
        write_doctrine_store(&workspace_root, &store).expect("write store");

        let directives = doctrine_active_directives(&workspace_root);
        assert_eq!(directives.as_deref(), Some("- Use the active directive."));

        let _ = std::fs::remove_dir_all(&workspace_root);
    }

    #[test]
    fn active_directives_none_when_no_ready_or_empty_directives() {
        let workspace_root =
            std::env::temp_dir().join(format!("groove-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(workspace_root.join(".groove")).expect("mkdir workspace");

        // Ready record but no directives stored.
        let store = DoctrineStore {
            version: DOCTRINE_STORE_VERSION,
            doctrines: vec![record("active", DoctrineState::Ready, None)],
        };
        write_doctrine_store(&workspace_root, &store).expect("write store");
        assert!(doctrine_active_directives(&workspace_root).is_none());

        let _ = std::fs::remove_dir_all(&workspace_root);
    }
}
