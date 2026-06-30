const GROOVE_MCP_DEFAULT_PORT: u16 = 4923;
const GROOVE_MCP_PROTOCOL_VERSION: &str = "2025-06-18";
const GROOVE_MCP_SERVER_NAME: &str = "groove-worktrees";
const GROOVE_MCP_MAX_BODY_BYTES: u64 = 4 * 1024 * 1024;
const GROOVE_MCP_TERMINAL_TAIL_CHARS: usize = 12_000;
const GROOVE_MCP_PROMPT_SUBMIT_DELAY: Duration = Duration::from_millis(200);
const GROOVE_MCP_WAIT_POLL_INTERVAL: Duration = Duration::from_millis(500);
// Settle time after play_worktree before typing an initial prompt, so the
// Claude Code TUI has booted enough to receive it.
const GROOVE_MCP_PLAY_PROMPT_SETTLE: Duration = Duration::from_millis(2500);

fn groove_mcp_disabled() -> bool {
    std::env::var("GROOVE_MCP_DISABLED")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn groove_mcp_port() -> u16 {
    std::env::var("GROOVE_MCP_PORT")
        .ok()
        .and_then(|value| value.trim().parse::<u16>().ok())
        .unwrap_or(GROOVE_MCP_DEFAULT_PORT)
}

fn start_groove_mcp_server(app: AppHandle) {
    if groove_mcp_disabled() {
        eprintln!("[groove-mcp] disabled via GROOVE_MCP_DISABLED.");
        return;
    }

    let port = groove_mcp_port();
    thread::spawn(move || {
        let server = match tiny_http::Server::http(("127.0.0.1", port)) {
            Ok(server) => server,
            Err(error) => {
                eprintln!("[groove-mcp] failed to bind 127.0.0.1:{port}: {error}");
                return;
            }
        };
        eprintln!(
            "[groove-mcp] listening on http://127.0.0.1:{port}/mcp — connect with: claude mcp add --transport http groove http://127.0.0.1:{port}/mcp"
        );

        loop {
            match server.recv() {
                Ok(request) => {
                    let app = app.clone();
                    thread::spawn(move || handle_groove_mcp_http_request(app, request));
                }
                Err(error) => {
                    eprintln!("[groove-mcp] accept error: {error}");
                }
            }
        }
    });
}

fn groove_mcp_http_response(
    status: u16,
    body: Option<serde_json::Value>,
) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let payload = body.map(|value| value.to_string().into_bytes()).unwrap_or_default();
    let mut response = tiny_http::Response::from_data(payload).with_status_code(status);
    if let Ok(header) =
        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
    {
        response = response.with_header(header);
    }
    response
}

fn groove_mcp_origin_allowed(request: &tiny_http::Request) -> bool {
    let Some(origin) = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Origin"))
        .map(|header| header.value.as_str().to_ascii_lowercase())
    else {
        return true;
    };

    origin == "null"
        || origin.starts_with("http://127.0.0.1")
        || origin.starts_with("https://127.0.0.1")
        || origin.starts_with("http://localhost")
        || origin.starts_with("https://localhost")
}

fn handle_groove_mcp_http_request(app: AppHandle, mut request: tiny_http::Request) {
    if !groove_mcp_origin_allowed(&request) {
        let _ = request.respond(groove_mcp_http_response(
            403,
            Some(serde_json::json!({"error": "Origin not allowed."})),
        ));
        return;
    }

    match request.method() {
        tiny_http::Method::Post => {}
        tiny_http::Method::Delete => {
            let _ = request.respond(groove_mcp_http_response(200, None));
            return;
        }
        _ => {
            let _ = request.respond(groove_mcp_http_response(
                405,
                Some(serde_json::json!({"error": "Method not allowed. POST JSON-RPC to this endpoint."})),
            ));
            return;
        }
    }

    let mut body = String::new();
    if request
        .as_reader()
        .take(GROOVE_MCP_MAX_BODY_BYTES)
        .read_to_string(&mut body)
        .is_err()
    {
        let _ = request.respond(groove_mcp_http_response(
            400,
            Some(serde_json::json!({"error": "Failed to read request body."})),
        ));
        return;
    }

    let message = match serde_json::from_str::<serde_json::Value>(&body) {
        Ok(value) => value,
        Err(error) => {
            let _ = request.respond(groove_mcp_http_response(
                400,
                Some(serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": serde_json::Value::Null,
                    "error": {"code": -32700, "message": format!("Parse error: {error}")},
                })),
            ));
            return;
        }
    };

    // Notifications carry no id and expect no JSON-RPC response.
    if message.get("id").map(|id| id.is_null()).unwrap_or(true) {
        let _ = request.respond(groove_mcp_http_response(202, None));
        return;
    }

    let response = groove_mcp_dispatch(&app, &message);
    let _ = request.respond(groove_mcp_http_response(200, Some(response)));
}

fn groove_mcp_dispatch(app: &AppHandle, message: &serde_json::Value) -> serde_json::Value {
    let id = message.get("id").cloned().unwrap_or(serde_json::Value::Null);
    let method = message
        .get("method")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    let params = message
        .get("params")
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));

    let result: Result<serde_json::Value, (i64, String)> = match method {
        "initialize" => Ok(groove_mcp_initialize_result(app, &params)),
        "ping" => Ok(serde_json::json!({})),
        "tools/list" => Ok(serde_json::json!({"tools": groove_mcp_tool_definitions()})),
        "resources/list" => Ok(serde_json::json!({"resources": []})),
        "prompts/list" => Ok(serde_json::json!({"prompts": []})),
        "tools/call" => Ok(groove_mcp_handle_tool_call(app, &params)),
        _ => Err((-32601, format!("Method not found: {method}"))),
    };

    match result {
        Ok(result) => serde_json::json!({"jsonrpc": "2.0", "id": id, "result": result}),
        Err((code, message)) => serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {"code": code, "message": message},
        }),
    }
}

fn groove_mcp_initialize_result(app: &AppHandle, params: &serde_json::Value) -> serde_json::Value {
    let protocol_version = params
        .get("protocolVersion")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(GROOVE_MCP_PROTOCOL_VERSION);

    let instructions = format!(
        "Tools for the Groove desktop app: inspect and control Git worktrees in the active workspace, start/stop in-app terminal sessions, and interact with each worktree's Claude Code session (read transcript, send prompts, wait for replies).{}",
        assistant_rules_instructions_block(app),
    );

    serde_json::json!({
        "protocolVersion": protocol_version,
        "capabilities": {"tools": {"listChanged": false}},
        "serverInfo": {
            "name": GROOVE_MCP_SERVER_NAME,
            "version": env!("CARGO_PKG_VERSION"),
        },
        "instructions": instructions,
    })
}

fn groove_mcp_tool_definitions() -> serde_json::Value {
    let worktree_property = serde_json::json!({
        "type": "string",
        "description": "Worktree directory name inside .worktrees/ (as returned by list_worktrees), or \"__workspace__\" for sessions rooted at the workspace root itself.",
    });

    serde_json::json!([
        {
            "name": "list_worktrees",
            "description": "List every worktree in the active Groove workspace with branch, path, status, Groove state, Claude session flag, and active in-app terminal sessions.",
            "inputSchema": {"type": "object", "properties": {}, "additionalProperties": false},
        },
        {
            "name": "search_worktrees",
            "description": "Search worktrees in the active workspace by case-insensitive substring across name, branch, status, and Groove state.",
            "inputSchema": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Substring to match."}},
                "required": ["query"],
                "additionalProperties": false,
            },
        },
        {
            "name": "get_worktree",
            "description": "Get full details for one worktree: branch, path, status, Groove state, summaries, comments, active terminal sessions, and Claude session info.",
            "inputSchema": {
                "type": "object",
                "properties": {"worktree": worktree_property},
                "required": ["worktree"],
                "additionalProperties": false,
            },
        },
        {
            "name": "create_worktree",
            "description": "Create a new Git worktree in the active workspace. \"branch\" is the full branch name (e.g. \"feat/foo-bar\"); the worktree directory is created automatically under the workspace's .worktrees/ (slashes in the branch become underscores), so no path is needed. Optionally set an initial Groove state, and optionally play it and send a first prompt in one call. When a first prompt is sent, the active Groove doctrine's directives are prepended by default so the session follows the workspace's working style (disable with applyDoctrine=false).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "branch": {
                        "type": "string",
                        "description": "Full branch name to create, e.g. \"feat/Q587XR1C-email-refactor\".",
                    },
                    "base": {
                        "type": "string",
                        "description": "Base branch to fork from. Defaults to the groove binary's default (current HEAD).",
                    },
                    "state": {
                        "type": "string",
                        "enum": ["pending", "hunting", "fighting", "wounded", "defeated", "blocked", "forgotten"],
                        "description": "Initial Groove state for the worktree, e.g. \"hunting\". Defaults to \"pending\".",
                    },
                    "play": {
                        "type": "boolean",
                        "description": "Start an in-app session after creating the worktree. Defaults to false.",
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["claudeCode", "opencode", "plain"],
                        "description": "What to launch when play is true. Defaults to \"claudeCode\".",
                    },
                    "prompt": {
                        "type": "string",
                        "description": "When play is true (claudeCode), a first prompt to type into the session after it starts.",
                    },
                    "applyDoctrine": {
                        "type": "boolean",
                        "description": "When sending the first prompt, prepend the active Groove doctrine's directives so the session follows the workspace's established working style. Defaults to true. Set false to send the prompt verbatim.",
                    },
                },
                "required": ["branch"],
                "additionalProperties": false,
            },
        },
        {
            "name": "list_assistant_rules",
            "description": "List the persistent assistant rules/memories you must follow when using Groove, for both scopes: \"project\" (the active workspace) and \"global\" (this device). Call this at the start of a session.",
            "inputSchema": {"type": "object", "properties": {}, "additionalProperties": false},
        },
        {
            "name": "add_assistant_rule",
            "description": "Remember a new rule/memory to follow in future Groove sessions. Use \"project\" scope for workspace-specific conventions, \"global\" for device-wide preferences.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "scope": {
                        "type": "string",
                        "enum": ["project", "global"],
                        "description": "\"project\" = active workspace only; \"global\" = every workspace on this device.",
                    },
                    "text": {"type": "string", "description": "The rule to remember."},
                },
                "required": ["scope", "text"],
                "additionalProperties": false,
            },
        },
        {
            "name": "remove_assistant_rule",
            "description": "Forget a previously saved assistant rule by its id (from list_assistant_rules).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "scope": {
                        "type": "string",
                        "enum": ["project", "global"],
                        "description": "Scope the rule lives in.",
                    },
                    "id": {"type": "string", "description": "Rule id from list_assistant_rules."},
                },
                "required": ["scope", "id"],
                "additionalProperties": false,
            },
        },
        {
            "name": "play_worktree",
            "description": "Start (or reuse) an in-app terminal session for a worktree. Default mode \"claudeCode\" launches Claude Code in the worktree (resuming its existing session when one exists).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "worktree": worktree_property,
                    "mode": {
                        "type": "string",
                        "enum": ["claudeCode", "opencode", "plain"],
                        "description": "What to launch in the terminal. Defaults to \"claudeCode\".",
                    },
                    "forceRestart": {
                        "type": "boolean",
                        "description": "Kill any existing sessions for the worktree and start fresh. Defaults to false (reuses the latest session).",
                    },
                },
                "required": ["worktree"],
                "additionalProperties": false,
            },
        },
        {
            "name": "pause_worktree",
            "description": "Pause a worktree: close all of its in-app terminal sessions and stop any externally running groove process for it.",
            "inputSchema": {
                "type": "object",
                "properties": {"worktree": worktree_property},
                "required": ["worktree"],
                "additionalProperties": false,
            },
        },
        {
            "name": "get_worktree_claude_session",
            "description": "Resolve the Claude Code session attached to a worktree: session id, transcript path, whether it has started, and whether a live Claude terminal is open.",
            "inputSchema": {
                "type": "object",
                "properties": {"worktree": worktree_property},
                "required": ["worktree"],
                "additionalProperties": false,
            },
        },
        {
            "name": "read_worktree_session",
            "description": "Read the most recent messages from a worktree's Claude Code session transcript (user and assistant turns, with tool-use names).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "worktree": worktree_property,
                    "limit": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 200,
                        "description": "Maximum number of trailing messages to return. Defaults to 20.",
                    },
                },
                "required": ["worktree"],
                "additionalProperties": false,
            },
        },
        {
            "name": "send_worktree_prompt",
            "description": "Type a prompt into the worktree's live Claude Code terminal session and submit it. Requires an active claudeCode session (use play_worktree first). Pair with wait_for_worktree_response to collect the reply.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "worktree": worktree_property,
                    "prompt": {"type": "string", "description": "Prompt text to send to Claude Code."},
                    "sessionId": {"type": "string", "description": "Specific in-app terminal session id. Defaults to the latest Claude Code session for the worktree."},
                },
                "required": ["worktree", "prompt"],
                "additionalProperties": false,
            },
        },
        {
            "name": "wait_for_worktree_response",
            "description": "Block until the worktree's Claude Code session finishes responding (transcript goes quiet with an assistant reply after the last user prompt), then return that reply. Returns status \"timeout\" with any partial reply if the deadline passes.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "worktree": worktree_property,
                    "timeoutSeconds": {
                        "type": "integer",
                        "minimum": 5,
                        "maximum": 600,
                        "description": "Maximum seconds to wait. Defaults to 120.",
                    },
                    "quietMillis": {
                        "type": "integer",
                        "minimum": 500,
                        "maximum": 30000,
                        "description": "How long the transcript must stay unchanged before the response is considered complete. Defaults to 2500.",
                    },
                },
                "required": ["worktree"],
                "additionalProperties": false,
            },
        },
        {
            "name": "read_worktree_terminal",
            "description": "Read the current screen contents (recent output) of a worktree's in-app terminal session, with ANSI escape codes stripped.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "worktree": worktree_property,
                    "sessionId": {"type": "string", "description": "Specific terminal session id. Defaults to the latest session for the worktree."},
                },
                "required": ["worktree"],
                "additionalProperties": false,
            },
        },
    ])
}

fn groove_mcp_handle_tool_call(app: &AppHandle, params: &serde_json::Value) -> serde_json::Value {
    let name = params
        .get("name")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    let arguments = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));

    let arg_str = |key: &str| -> Option<String> {
        arguments
            .get(key)
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string())
    };

    let require_worktree = || -> Result<String, String> {
        arg_str("worktree").ok_or_else(|| "\"worktree\" is required.".to_string())
    };

    let result: Result<serde_json::Value, String> = match name {
        "list_worktrees" => groove_mcp_list_worktrees(app),
        "search_worktrees" => match arg_str("query") {
            Some(query) => groove_mcp_search_worktrees(app, &query),
            None => Err("\"query\" is required.".to_string()),
        },
        "get_worktree" => require_worktree().and_then(|worktree| groove_mcp_get_worktree(app, &worktree)),
        "create_worktree" => match arg_str("branch") {
            Some(branch) => {
                let play = arguments
                    .get("play")
                    .and_then(|value| value.as_bool())
                    .unwrap_or(false);
                let apply_doctrine = arguments
                    .get("applyDoctrine")
                    .and_then(|value| value.as_bool())
                    .unwrap_or(true);
                groove_mcp_create_worktree(
                    app,
                    &branch,
                    arg_str("base").as_deref(),
                    arg_str("state").as_deref(),
                    play,
                    arg_str("mode").as_deref(),
                    arg_str("prompt").as_deref(),
                    apply_doctrine,
                )
            }
            None => Err("\"branch\" is required.".to_string()),
        },
        "list_assistant_rules" => groove_mcp_list_assistant_rules(app),
        "add_assistant_rule" => match (arg_str("scope"), arg_str("text")) {
            (Some(scope), Some(text)) => groove_mcp_add_assistant_rule(app, &scope, &text),
            (None, _) => Err("\"scope\" is required (\"project\" or \"global\").".to_string()),
            (_, None) => Err("\"text\" is required.".to_string()),
        },
        "remove_assistant_rule" => match (arg_str("scope"), arg_str("id")) {
            (Some(scope), Some(id)) => groove_mcp_remove_assistant_rule(app, &scope, &id),
            (None, _) => Err("\"scope\" is required (\"project\" or \"global\").".to_string()),
            (_, None) => Err("\"id\" is required.".to_string()),
        },
        "play_worktree" => require_worktree().and_then(|worktree| {
            let mode = arg_str("mode");
            let force_restart = arguments
                .get("forceRestart")
                .and_then(|value| value.as_bool())
                .unwrap_or(false);
            groove_mcp_play_worktree(app, &worktree, mode.as_deref(), force_restart)
        }),
        "pause_worktree" => {
            require_worktree().and_then(|worktree| groove_mcp_pause_worktree(app, &worktree))
        }
        "get_worktree_claude_session" => require_worktree()
            .and_then(|worktree| groove_mcp_get_worktree_claude_session(app, &worktree)),
        "read_worktree_session" => require_worktree().and_then(|worktree| {
            let limit = arguments
                .get("limit")
                .and_then(|value| value.as_u64())
                .map(|value| value.clamp(1, 200) as usize)
                .unwrap_or(20);
            groove_mcp_read_worktree_session(app, &worktree, limit)
        }),
        "send_worktree_prompt" => require_worktree().and_then(|worktree| {
            let prompt = arg_str("prompt").ok_or_else(|| "\"prompt\" is required.".to_string())?;
            groove_mcp_send_worktree_prompt(app, &worktree, &prompt, arg_str("sessionId").as_deref())
        }),
        "wait_for_worktree_response" => require_worktree().and_then(|worktree| {
            let timeout_seconds = arguments
                .get("timeoutSeconds")
                .and_then(|value| value.as_u64())
                .map(|value| value.clamp(5, 600))
                .unwrap_or(120);
            let quiet_millis = arguments
                .get("quietMillis")
                .and_then(|value| value.as_u64())
                .map(|value| value.clamp(500, 30_000))
                .unwrap_or(2500);
            groove_mcp_wait_for_worktree_response(app, &worktree, timeout_seconds, quiet_millis)
        }),
        "read_worktree_terminal" => require_worktree().and_then(|worktree| {
            groove_mcp_read_worktree_terminal(app, &worktree, arg_str("sessionId").as_deref())
        }),
        _ => Err(format!("Unknown tool: {name}")),
    };

    match result {
        Ok(value) => {
            let text = serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string());
            serde_json::json!({
                "content": [{"type": "text", "text": text}],
                "isError": false,
            })
        }
        Err(error) => serde_json::json!({
            "content": [{"type": "text", "text": error}],
            "isError": true,
        }),
    }
}

fn groove_mcp_active_workspace_root(app: &AppHandle) -> Result<PathBuf, String> {
    resolve_workspace_root(app, &None, None, &[], &None)
        .map_err(|error| format!("{error} Open a workspace in the Groove app first."))
}

/// Like `resolve_terminal_worktree_context`, but resolves the active workspace
/// first so a missing worktree reports "worktree not found" instead of the
/// misleading "no active workspace" error.
fn groove_mcp_resolve_worktree(
    app: &AppHandle,
    worktree: &str,
) -> Result<(PathBuf, PathBuf), String> {
    if !is_safe_path_token(worktree) {
        return Err("worktree contains unsafe characters or path segments.".to_string());
    }
    let workspace_root = groove_mcp_active_workspace_root(app)?;
    if worktree == GROOVE_WORKSPACE_TERMINAL_WORKTREE {
        return Ok((workspace_root.clone(), workspace_root));
    }
    let effective_root = ensure_workspace_meta(&workspace_root)
        .map(|(meta, _)| effective_workspace_root(&workspace_root, &meta))
        .unwrap_or_else(|_| workspace_root.clone());
    if !path_is_directory(&effective_root.join(".worktrees").join(worktree)) {
        return Err(format!(
            "Worktree \"{worktree}\" was not found in the active workspace ({}). Use list_worktrees to see available worktrees.",
            workspace_root.display()
        ));
    }
    let worktree_path = ensure_worktree_in_dir(&effective_root, worktree, ".worktrees")?;
    Ok((workspace_root, worktree_path))
}

/// Create a new worktree in the active workspace, mirroring the success path of
/// the `groove_new` Tauri command, then optionally set its Groove state and play
/// it with a first prompt. Runs on the MCP request thread, where blocking is fine.
fn groove_mcp_create_worktree(
    app: &AppHandle,
    branch: &str,
    base: Option<&str>,
    state: Option<&str>,
    play: bool,
    mode: Option<&str>,
    prompt: Option<&str>,
    apply_doctrine: bool,
) -> Result<serde_json::Value, String> {
    let branch = branch.trim();
    if branch.is_empty() || !is_safe_path_token(branch) {
        return Err(
            "\"branch\" is required and must be a safe path token (no spaces, no \"..\").".to_string(),
        );
    }
    if let Some(base) = base {
        if !is_safe_path_token(base) {
            return Err("\"base\" contains unsafe characters or path segments.".to_string());
        }
    }

    // Parse the optional initial state up-front, so we fail before touching git.
    let parsed_state = match state {
        Some(value) => Some(
            serde_json::from_value::<WorktreeState>(serde_json::json!(value)).map_err(|_| {
                format!(
                    "Unknown state \"{value}\". Valid states: pending, hunting, fighting, wounded, defeated, blocked, forgotten."
                )
            })?,
        ),
        None => None,
    };

    let workspace_root = groove_mcp_active_workspace_root(app)?;
    let effective_root = ensure_workspace_meta(&workspace_root)
        .map(|(meta, _)| effective_workspace_root(&workspace_root, &meta))
        .unwrap_or_else(|_| workspace_root.clone());

    let mut args = vec!["create".to_string(), branch.to_string()];
    if let Some(base) = base {
        args.push("--base".to_string());
        args.push(base.to_string());
    }

    let result = run_command(&groove_binary_path(app), &args, &effective_root);
    if result.exit_code != Some(0) || result.error.is_some() {
        let detail = result.error.clone().unwrap_or_else(|| {
            let stderr = result.stderr.trim();
            if stderr.is_empty() {
                format!("groove create exited with status {:?}.", result.exit_code)
            } else {
                stderr.to_string()
            }
        });
        return Err(format!("Failed to create worktree \"{branch}\": {detail}"));
    }

    // Post-create registration, mirroring groove_new's success path.
    let stamped = branch.replace('/', "_");
    register_worktree_record(&workspace_root, &stamped)?;
    let _ = sync_worktree_records_with_disk(&workspace_root, &effective_root);
    record_worktree_last_executed_at(app, &workspace_root, &stamped)?;

    let worktree_path = ensure_worktree_in_dir(&effective_root, &stamped, ".worktrees")?;
    let _ = apply_configured_worktree_symlinks(&workspace_root, &worktree_path);
    ensure_claude_hooks(&worktree_path, &stamped);

    if let Some(parsed_state) = parsed_state {
        set_worktree_state(&workspace_root, &stamped, parsed_state)?;
    }

    // Honor the configured max worktree count (LRU eviction, skipping
    // running/dirty worktrees); emits a "worktree-evicted" event on removal.
    run_post_create_eviction(app, &workspace_root, &effective_root);

    invalidate_workspace_context_cache(app, &workspace_root);
    invalidate_groove_list_cache_for_workspace(app, &workspace_root);

    let mut response = serde_json::json!({
        "name": stamped,
        "branch": branch,
        "path": worktree_path.display().to_string(),
        "state": state.unwrap_or("pending"),
        "created": true,
        "played": false,
        "promptSent": false,
        "doctrineApplied": false,
    });

    if play {
        let session = groove_mcp_play_worktree(app, &stamped, mode, false)?;
        response["played"] = serde_json::Value::Bool(true);
        if let Some(session_id) = session.get("sessionId").cloned() {
            response["sessionId"] = session_id;
        }

        if let Some(prompt) = prompt {
            if mode.unwrap_or("claudeCode") == "claudeCode" {
                // Optionally prepend the active doctrine's directives so the new
                // session inherits the workspace's established working style.
                let directives = if apply_doctrine {
                    doctrine_active_directives(&workspace_root)
                } else {
                    None
                };
                let full_prompt = match &directives {
                    Some(directives) => format!(
                        "Follow these working-style directives (from the active Groove doctrine) for everything below:\n\n{directives}\n\n---\n\n{prompt}"
                    ),
                    None => prompt.to_string(),
                };
                // Let the Claude TUI boot before typing the first prompt.
                thread::sleep(GROOVE_MCP_PLAY_PROMPT_SETTLE);
                groove_mcp_send_worktree_prompt(app, &stamped, &full_prompt, None)?;
                response["promptSent"] = serde_json::Value::Bool(true);
                response["doctrineApplied"] = serde_json::Value::Bool(directives.is_some());
            } else {
                response["promptNote"] = serde_json::Value::String(
                    "prompt is only delivered for mode \"claudeCode\"; skipped.".to_string(),
                );
            }
        }
    }

    Ok(response)
}

fn groove_mcp_list_assistant_rules(app: &AppHandle) -> Result<serde_json::Value, String> {
    let workspace_root = groove_mcp_active_workspace_root(app).ok();
    let (global, project) = assistant_rules_collect(app, workspace_root.as_deref());
    Ok(serde_json::json!({
        "global": global,
        "project": project,
        "projectWorkspace": workspace_root.map(|path| path.display().to_string()),
    }))
}

fn groove_mcp_add_assistant_rule(
    app: &AppHandle,
    scope: &str,
    text: &str,
) -> Result<serde_json::Value, String> {
    let workspace_root = match scope {
        "project" => Some(groove_mcp_active_workspace_root(app)?),
        _ => None,
    };
    let path = assistant_rules_scope_path(app, scope, workspace_root.as_deref())?;
    let rule = assistant_rules_add(&path, text)?;
    Ok(serde_json::json!({"scope": scope, "rule": rule}))
}

fn groove_mcp_remove_assistant_rule(
    app: &AppHandle,
    scope: &str,
    id: &str,
) -> Result<serde_json::Value, String> {
    let workspace_root = match scope {
        "project" => Some(groove_mcp_active_workspace_root(app)?),
        _ => None,
    };
    let path = assistant_rules_scope_path(app, scope, workspace_root.as_deref())?;
    let removed = assistant_rules_remove(&path, id)?;
    Ok(serde_json::json!({"scope": scope, "id": id, "removed": removed}))
}

fn groove_mcp_sessions_by_worktree(
    app: &AppHandle,
    workspace_root: &Path,
) -> HashMap<String, Vec<serde_json::Value>> {
    let state = app.state::<GrooveTerminalState>();
    let Ok(sessions_state) = state.inner.lock() else {
        return HashMap::new();
    };

    let root_key = workspace_root_storage_key(workspace_root);
    let mut sessions_by_worktree: HashMap<String, Vec<serde_json::Value>> = HashMap::new();
    for session in sessions_state.sessions_by_id.values() {
        if workspace_root_storage_key(Path::new(&session.workspace_root)) != root_key {
            continue;
        }
        sessions_by_worktree
            .entry(session.worktree.clone())
            .or_default()
            .push(serde_json::json!({
                "sessionId": session.session_id,
                "command": session.command,
                "startedAt": session.started_at,
            }));
    }
    sessions_by_worktree
}

fn groove_mcp_worktree_rows(app: &AppHandle) -> Result<(PathBuf, Vec<serde_json::Value>), String> {
    let workspace_root = groove_mcp_active_workspace_root(app)?;
    let context = build_workspace_context(app, &workspace_root, request_id(), false);
    if let Some(error) = context.error {
        return Err(error);
    }

    let records = context
        .workspace_meta
        .as_ref()
        .map(|meta| meta.worktree_records.clone())
        .unwrap_or_default();
    let active_sessions = groove_mcp_sessions_by_worktree(app, &workspace_root);

    let rows = context
        .rows
        .iter()
        .map(|row| {
            let record = records.get(&row.worktree);
            serde_json::json!({
                "name": row.worktree,
                "branch": row.branch_guess,
                "path": row.path,
                "status": row.status,
                "lastExecutedAt": row.last_executed_at,
                "state": record
                    .and_then(|value| serde_json::to_value(value.state).ok())
                    .unwrap_or(serde_json::Value::Null),
                "claudeSessionStarted": record
                    .map(|value| value.claude_session_started)
                    .unwrap_or(false),
                "activeTerminalSessions": active_sessions
                    .get(&row.worktree)
                    .cloned()
                    .unwrap_or_default(),
            })
        })
        .collect::<Vec<_>>();

    Ok((workspace_root, rows))
}

fn groove_mcp_list_worktrees(app: &AppHandle) -> Result<serde_json::Value, String> {
    let (workspace_root, rows) = groove_mcp_worktree_rows(app)?;
    Ok(serde_json::json!({
        "workspaceRoot": workspace_root.display().to_string(),
        "count": rows.len(),
        "worktrees": rows,
    }))
}

fn groove_mcp_search_worktrees(app: &AppHandle, query: &str) -> Result<serde_json::Value, String> {
    let (workspace_root, rows) = groove_mcp_worktree_rows(app)?;
    let needle = query.to_lowercase();
    let matches = rows
        .into_iter()
        .filter(|row| {
            ["name", "branch", "status", "state"].iter().any(|key| {
                row.get(key)
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_lowercase().contains(&needle))
                    .unwrap_or(false)
            })
        })
        .collect::<Vec<_>>();

    Ok(serde_json::json!({
        "workspaceRoot": workspace_root.display().to_string(),
        "query": query,
        "count": matches.len(),
        "worktrees": matches,
    }))
}

fn groove_mcp_get_worktree(app: &AppHandle, worktree: &str) -> Result<serde_json::Value, String> {
    let (workspace_root, worktree_path) =
        groove_mcp_resolve_worktree(app, worktree)?;
    let context = build_workspace_context(app, &workspace_root, request_id(), false);
    if let Some(error) = context.error {
        return Err(error);
    }

    let row = context.rows.iter().find(|row| row.worktree == worktree);
    let record = context
        .workspace_meta
        .as_ref()
        .and_then(|meta| meta.worktree_records.get(worktree));

    let claude_session = record.map(|record| {
        let session_id = resolve_existing_claude_session_id(&worktree_path, &record.id);
        serde_json::json!({
            "worktreeId": record.id,
            "started": record.claude_session_started,
            "sessionId": session_id,
            "transcriptPath": session_id
                .as_deref()
                .and_then(|id| groove_mcp_claude_transcript_path(&worktree_path, id))
                .map(|path| path.display().to_string()),
        })
    });

    let summaries = record
        .map(|record| {
            record
                .summaries
                .iter()
                .map(|summary| {
                    serde_json::json!({
                        "createdAt": summary.created_at,
                        "summary": summary.summary,
                        "oneLiner": summary.one_liner,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let comments = record
        .map(|record| {
            record
                .comments
                .iter()
                .map(|comment| {
                    serde_json::json!({
                        "createdAt": comment.created_at,
                        "message": comment.message,
                        "state": serde_json::to_value(comment.state).ok(),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let active_sessions = groove_mcp_sessions_by_worktree(app, &workspace_root)
        .remove(worktree)
        .unwrap_or_default();

    Ok(serde_json::json!({
        "name": worktree,
        "workspaceRoot": workspace_root.display().to_string(),
        "path": worktree_path.display().to_string(),
        "branch": row.map(|row| row.branch_guess.clone()),
        "status": row.map(|row| row.status.clone()),
        "lastExecutedAt": row.and_then(|row| row.last_executed_at.clone()),
        "state": record
            .and_then(|record| serde_json::to_value(record.state).ok())
            .unwrap_or(serde_json::Value::Null),
        "createdAt": record.map(|record| record.created_at.clone()),
        "claudeSession": claude_session,
        "summaries": summaries,
        "comments": comments,
        "activeTerminalSessions": active_sessions,
    }))
}

fn groove_mcp_play_worktree(
    app: &AppHandle,
    worktree: &str,
    mode: Option<&str>,
    force_restart: bool,
) -> Result<serde_json::Value, String> {
    let open_mode = validate_groove_terminal_open_mode(Some(mode.unwrap_or("claudeCode")))?;
    let (workspace_root, worktree_path) =
        groove_mcp_resolve_worktree(app, worktree)?;

    let state = app.state::<GrooveTerminalState>();
    let session = open_groove_terminal_session(
        app,
        &state,
        &workspace_root,
        worktree,
        &worktree_path,
        open_mode,
        None,
        None,
        None,
        force_restart,
        false,
        false,
    )?;

    Ok(serde_json::json!({
        "sessionId": session.session_id,
        "worktree": session.worktree,
        "worktreePath": session.worktree_path,
        "command": session.command,
        "startedAt": session.started_at,
    }))
}

fn groove_mcp_pause_worktree(app: &AppHandle, worktree: &str) -> Result<serde_json::Value, String> {
    let (workspace_root, _) = groove_mcp_resolve_worktree(app, worktree)?;
    let worktree_key = groove_terminal_session_key(&workspace_root, worktree);
    let workspace_root_rendered = workspace_root.display().to_string();

    let state = app.state::<GrooveTerminalState>();
    let sessions_to_close = {
        let mut sessions_state = state
            .inner
            .lock()
            .map_err(|error| format!("Failed to acquire Groove terminal state lock: {error}"))?;
        let session_ids = sessions_state
            .session_ids_by_worktree
            .get(&worktree_key)
            .cloned()
            .unwrap_or_default();
        session_ids
            .iter()
            .filter_map(|session_id| remove_session_by_id(&mut sessions_state, session_id))
            .collect::<Vec<_>>()
    };

    let mut closed_session_ids = Vec::new();
    for mut session in sessions_to_close {
        let session_id = session.session_id.clone();
        let _ = session.child.kill();
        let _ = collect_groove_terminal_exit_status(session.child.as_mut());
        drop(session);
        let _ = clear_running_groove_if_session_matches(app, &workspace_root, worktree, &session_id);
        emit_groove_terminal_lifecycle_event(
            app,
            &session_id,
            &workspace_root_rendered,
            worktree,
            "closed",
            Some("Terminal session closed by MCP pause_worktree.".to_string()),
        );
        closed_session_ids.push(session_id);
    }
    invalidate_groove_list_cache_for_workspace(app, &workspace_root);

    let stop = groove_stop(
        app.clone(),
        GrooveStopPayload {
            root_name: None,
            known_worktrees: Vec::new(),
            workspace_meta: None,
            worktree: worktree.to_string(),
            instance_id: None,
            dir: None,
        },
    );

    Ok(serde_json::json!({
        "worktree": worktree,
        "closedTerminalSessions": closed_session_ids,
        "externalStop": {
            "ok": stop.ok,
            "alreadyStopped": stop.already_stopped,
            "pid": stop.pid,
            "error": stop.error,
        },
    }))
}

fn groove_mcp_claude_transcript_path(worktree_path: &Path, session_id: &str) -> Option<PathBuf> {
    let home = dirs_home()?;
    Some(
        home.join(".claude")
            .join("projects")
            .join(encode_claude_project_dir_name(worktree_path))
            .join(format!("{session_id}.jsonl")),
    )
}

/// Resolves (workspace_root, worktree_path, worktree_id, transcript_path) for a
/// worktree's Claude Code session. `transcript_path` is None when no session
/// transcript exists yet.
fn groove_mcp_resolve_claude_session(
    app: &AppHandle,
    worktree: &str,
) -> Result<(PathBuf, PathBuf, String, Option<(String, PathBuf)>), String> {
    let (workspace_root, worktree_path) =
        groove_mcp_resolve_worktree(app, worktree)?;

    // The workspace pseudo-worktree has no Groove record; its Claude session
    // is whichever transcript is newest for the workspace root itself.
    let worktree_id = if worktree == GROOVE_WORKSPACE_TERMINAL_WORKTREE {
        GROOVE_WORKSPACE_TERMINAL_WORKTREE.to_string()
    } else {
        let (workspace_meta, _) = ensure_workspace_meta(&workspace_root)?;
        let Some(record) = workspace_meta.worktree_records.get(worktree) else {
            return Err(format!(
                "No Groove record found for worktree \"{worktree}\". Open it in the app or start it with play_worktree first."
            ));
        };
        record.id.clone()
    };

    let session =
        resolve_existing_claude_session_id(&worktree_path, &worktree_id).and_then(|session_id| {
            groove_mcp_claude_transcript_path(&worktree_path, &session_id)
                .filter(|path| path_is_file(path))
                .map(|path| (session_id, path))
        });

    Ok((workspace_root, worktree_path, worktree_id, session))
}

fn groove_mcp_get_worktree_claude_session(
    app: &AppHandle,
    worktree: &str,
) -> Result<serde_json::Value, String> {
    let (workspace_root, _, worktree_id, session) =
        groove_mcp_resolve_claude_session(app, worktree)?;
    let (workspace_meta, _) = ensure_workspace_meta(&workspace_root)?;
    let started = workspace_meta
        .worktree_records
        .get(worktree)
        .map(|record| record.claude_session_started)
        .unwrap_or(false);

    let claude_bin = resolve_claude_code_bin();
    let has_live_terminal = groove_mcp_sessions_by_worktree(app, &workspace_root)
        .get(worktree)
        .map(|sessions| {
            sessions.iter().any(|session| {
                session
                    .get("command")
                    .and_then(|value| value.as_str())
                    .map(|command| command.starts_with(&claude_bin))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false);

    Ok(serde_json::json!({
        "worktree": worktree,
        "worktreeId": worktree_id,
        "claudeSessionStarted": started,
        "sessionId": session.as_ref().map(|(id, _)| id.clone()),
        "transcriptPath": session.as_ref().map(|(_, path)| path.display().to_string()),
        "hasLiveClaudeTerminal": has_live_terminal,
    }))
}

/// One parsed conversational entry from a Claude Code session transcript.
struct GrooveMcpTranscriptMessage {
    role: String,
    text: String,
    tool_uses: Vec<String>,
    timestamp: Option<String>,
}

fn groove_mcp_parse_claude_transcript(
    path: &Path,
) -> Result<Vec<GrooveMcpTranscriptMessage>, String> {
    let content = fs::read_to_string(path).map_err(|error| {
        format!(
            "Failed to read Claude session transcript {}: {error}",
            path.display()
        )
    })?;

    let mut messages = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(entry) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let entry_type = entry
            .get("type")
            .and_then(|value| value.as_str())
            .unwrap_or_default();
        if entry_type != "user" && entry_type != "assistant" {
            continue;
        }
        if entry
            .get("isMeta")
            .and_then(|value| value.as_bool())
            .unwrap_or(false)
        {
            continue;
        }

        let message = entry.get("message").cloned().unwrap_or_default();
        let mut text_parts = Vec::new();
        let mut tool_uses = Vec::new();
        let mut has_tool_result = false;
        match message.get("content") {
            Some(serde_json::Value::String(text)) => text_parts.push(text.clone()),
            Some(serde_json::Value::Array(items)) => {
                for item in items {
                    match item.get("type").and_then(|value| value.as_str()) {
                        Some("text") => {
                            if let Some(text) = item.get("text").and_then(|value| value.as_str()) {
                                text_parts.push(text.to_string());
                            }
                        }
                        Some("tool_use") => {
                            if let Some(name) = item.get("name").and_then(|value| value.as_str()) {
                                tool_uses.push(name.to_string());
                            }
                        }
                        Some("tool_result") => has_tool_result = true,
                        _ => {}
                    }
                }
            }
            _ => {}
        }

        // Tool results echo back as "user" entries; they are machine traffic,
        // not conversation turns.
        if entry_type == "user" && has_tool_result {
            continue;
        }
        let text = text_parts.join("\n");
        if text.trim().is_empty() && tool_uses.is_empty() {
            continue;
        }

        messages.push(GrooveMcpTranscriptMessage {
            role: entry_type.to_string(),
            text,
            tool_uses,
            timestamp: entry
                .get("timestamp")
                .and_then(|value| value.as_str())
                .map(|value| value.to_string()),
        });
    }

    Ok(messages)
}

fn groove_mcp_read_worktree_session(
    app: &AppHandle,
    worktree: &str,
    limit: usize,
) -> Result<serde_json::Value, String> {
    let (_, _, _, session) = groove_mcp_resolve_claude_session(app, worktree)?;
    let Some((session_id, transcript_path)) = session else {
        return Err(format!(
            "No Claude Code session transcript found for worktree \"{worktree}\". Start one with play_worktree (mode \"claudeCode\")."
        ));
    };

    let messages = groove_mcp_parse_claude_transcript(&transcript_path)?;
    let total = messages.len();
    let tail = messages
        .into_iter()
        .skip(total.saturating_sub(limit))
        .map(|message| {
            serde_json::json!({
                "role": message.role,
                "text": message.text,
                "toolUses": message.tool_uses,
                "timestamp": message.timestamp,
            })
        })
        .collect::<Vec<_>>();

    Ok(serde_json::json!({
        "worktree": worktree,
        "sessionId": session_id,
        "transcriptPath": transcript_path.display().to_string(),
        "totalMessages": total,
        "messages": tail,
    }))
}

/// Last assistant text reply that came after the most recent real user prompt.
fn groove_mcp_latest_assistant_reply(
    path: &Path,
) -> Result<Option<(String, Option<String>)>, String> {
    let messages = groove_mcp_parse_claude_transcript(path)?;
    let last_user_index = messages
        .iter()
        .rposition(|message| message.role == "user");

    let reply = messages
        .iter()
        .enumerate()
        .filter(|(index, message)| {
            message.role == "assistant"
                && !message.text.trim().is_empty()
                && last_user_index.map(|user| *index > user).unwrap_or(true)
        })
        .map(|(_, message)| (message.text.clone(), message.timestamp.clone()))
        .last();

    Ok(reply)
}

fn groove_mcp_terminal_write(
    state: &State<GrooveTerminalState>,
    session_id: &str,
    bytes: &[u8],
) -> Result<(), String> {
    let mut sessions_state = state
        .inner
        .lock()
        .map_err(|error| format!("Failed to acquire Groove terminal state lock: {error}"))?;
    let Some(session) = sessions_state.sessions_by_id.get_mut(session_id) else {
        return Err("The Claude Code terminal session closed before the prompt was sent.".to_string());
    };
    session
        .writer
        .write_all(bytes)
        .and_then(|_| session.writer.flush())
        .map_err(|error| format!("Failed to write to Groove terminal session: {error}"))
}

fn groove_mcp_send_worktree_prompt(
    app: &AppHandle,
    worktree: &str,
    prompt: &str,
    requested_session_id: Option<&str>,
) -> Result<serde_json::Value, String> {
    let (workspace_root, _) = groove_mcp_resolve_worktree(app, worktree)?;
    let worktree_key = groove_terminal_session_key(&workspace_root, worktree);
    let claude_bin = resolve_claude_code_bin();

    let state = app.state::<GrooveTerminalState>();
    let session_id = {
        let sessions_state = state
            .inner
            .lock()
            .map_err(|error| format!("Failed to acquire Groove terminal state lock: {error}"))?;
        match requested_session_id {
            Some(requested) => {
                resolve_terminal_session_id(&sessions_state, &worktree_key, Some(requested))?
            }
            None => sessions_state
                .session_ids_by_worktree
                .get(&worktree_key)
                .and_then(|session_ids| {
                    session_ids
                        .iter()
                        .rev()
                        .find(|session_id| {
                            sessions_state
                                .sessions_by_id
                                .get(session_id.as_str())
                                .map(|session| session.command.starts_with(&claude_bin))
                                .unwrap_or(false)
                        })
                        .cloned()
                })
                .ok_or_else(|| {
                    format!(
                        "No live Claude Code terminal session for worktree \"{worktree}\". Start one with play_worktree (mode \"claudeCode\")."
                    )
                })?,
        }
    };

    // Bracketed paste keeps multi-line prompts from being submitted line by
    // line; the carriage return is sent separately so the TUI has settled.
    groove_mcp_terminal_write(
        &state,
        &session_id,
        format!("\u{1b}[200~{prompt}\u{1b}[201~").as_bytes(),
    )?;
    thread::sleep(GROOVE_MCP_PROMPT_SUBMIT_DELAY);
    groove_mcp_terminal_write(&state, &session_id, b"\r")?;

    Ok(serde_json::json!({
        "worktree": worktree,
        "sessionId": session_id,
        "submitted": true,
        "hint": "Use wait_for_worktree_response to collect Claude's reply.",
    }))
}

fn groove_mcp_wait_for_worktree_response(
    app: &AppHandle,
    worktree: &str,
    timeout_seconds: u64,
    quiet_millis: u64,
) -> Result<serde_json::Value, String> {
    let (_, worktree_path, worktree_id, session) =
        groove_mcp_resolve_claude_session(app, worktree)?;

    // The transcript file may not exist yet right after the first prompt of a
    // brand-new session, so fall back to the expected path and wait for it.
    let (session_id, transcript_path) = match session {
        Some(found) => found,
        None => {
            let expected = groove_mcp_claude_transcript_path(&worktree_path, &worktree_id)
                .ok_or_else(|| "Could not resolve the home directory.".to_string())?;
            (worktree_id, expected)
        }
    };

    let deadline = Instant::now() + Duration::from_secs(timeout_seconds);
    let quiet = Duration::from_millis(quiet_millis);
    let mut last_len: u64 = 0;
    let mut last_change = Instant::now();

    loop {
        let len = fs::metadata(&transcript_path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        if len != last_len {
            last_len = len;
            last_change = Instant::now();
        }

        if len > 0 && last_change.elapsed() >= quiet {
            if let Some((text, responded_at)) =
                groove_mcp_latest_assistant_reply(&transcript_path)?
            {
                return Ok(serde_json::json!({
                    "status": "completed",
                    "worktree": worktree,
                    "sessionId": session_id,
                    "response": text,
                    "respondedAt": responded_at,
                }));
            }
        }

        if Instant::now() >= deadline {
            let partial = groove_mcp_latest_assistant_reply(&transcript_path)
                .ok()
                .flatten();
            return Ok(serde_json::json!({
                "status": "timeout",
                "worktree": worktree,
                "sessionId": session_id,
                "timeoutSeconds": timeout_seconds,
                "partialResponse": partial.map(|(text, _)| text),
            }));
        }

        thread::sleep(GROOVE_MCP_WAIT_POLL_INTERVAL);
    }
}

fn groove_mcp_strip_ansi(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(current) = chars.next() {
        if current == '\u{1b}' {
            match chars.peek() {
                Some('[') => {
                    chars.next();
                    while let Some(&next) = chars.peek() {
                        chars.next();
                        if ('@'..='~').contains(&next) {
                            break;
                        }
                    }
                }
                Some(']') => {
                    chars.next();
                    while let Some(next) = chars.next() {
                        if next == '\u{7}' {
                            break;
                        }
                        if next == '\u{1b}' && chars.peek() == Some(&'\\') {
                            chars.next();
                            break;
                        }
                    }
                }
                Some(_) => {
                    chars.next();
                }
                None => {}
            }
        } else if current != '\r' {
            output.push(current);
        }
    }
    output
}

fn groove_mcp_read_worktree_terminal(
    app: &AppHandle,
    worktree: &str,
    requested_session_id: Option<&str>,
) -> Result<serde_json::Value, String> {
    let (workspace_root, _) = groove_mcp_resolve_worktree(app, worktree)?;
    let worktree_key = groove_terminal_session_key(&workspace_root, worktree);

    let state = app.state::<GrooveTerminalState>();
    let sessions_state = state
        .inner
        .lock()
        .map_err(|error| format!("Failed to acquire Groove terminal state lock: {error}"))?;
    let session_id =
        resolve_terminal_session_id(&sessions_state, &worktree_key, requested_session_id)?;
    let Some(session) = sessions_state.sessions_by_id.get(&session_id) else {
        return Err("No active Groove terminal session found for this worktree.".to_string());
    };

    let session = groove_terminal_session_with_snapshot_from_state(session);
    let screen = groove_mcp_strip_ansi(session.snapshot.as_deref().unwrap_or_default());
    let tail_start = screen
        .char_indices()
        .rev()
        .nth(GROOVE_MCP_TERMINAL_TAIL_CHARS.saturating_sub(1))
        .map(|(index, _)| index)
        .unwrap_or(0);

    Ok(serde_json::json!({
        "worktree": worktree,
        "sessionId": session.session_id,
        "command": session.command,
        "startedAt": session.started_at,
        "screen": &screen[tail_start..],
    }))
}

#[cfg(test)]
mod mcp_runtime_tests {
    use super::*;

    fn write_temp_transcript(lines: &[&str]) -> PathBuf {
        let path = std::env::temp_dir().join(format!("groove-mcp-test-{}.jsonl", Uuid::new_v4()));
        fs::write(&path, lines.join("\n")).expect("write temp transcript");
        path
    }

    #[test]
    fn strips_csi_and_osc_sequences() {
        let input = "\u{1b}[1;32mhello\u{1b}[0m\r\n\u{1b}]0;title\u{7}world";
        assert_eq!(groove_mcp_strip_ansi(input), "hello\nworld");
    }

    #[test]
    fn parses_transcript_and_skips_machine_entries() {
        let path = write_temp_transcript(&[
            r#"{"type":"summary","summary":"ignored"}"#,
            r#"{"type":"user","isMeta":true,"message":{"role":"user","content":"meta noise"}}"#,
            r#"{"type":"user","message":{"role":"user","content":"fix the bug"},"timestamp":"t1"}"#,
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Bash","input":{}}]},"timestamp":"t2"}"#,
            r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"ok"}]},"timestamp":"t3"}"#,
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"done, fixed"}]},"timestamp":"t4"}"#,
        ]);

        let messages = groove_mcp_parse_claude_transcript(&path).expect("parse transcript");
        let _ = fs::remove_file(&path);

        assert_eq!(messages.len(), 3);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[0].text, "fix the bug");
        assert_eq!(messages[1].tool_uses, vec!["Bash".to_string()]);
        assert_eq!(messages[2].text, "done, fixed");
        assert_eq!(messages[2].timestamp.as_deref(), Some("t4"));
    }

    #[test]
    fn latest_assistant_reply_follows_last_user_prompt() {
        let path = write_temp_transcript(&[
            r#"{"type":"user","message":{"role":"user","content":"first question"}}"#,
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"first answer"}]}}"#,
            r#"{"type":"user","message":{"role":"user","content":"second question"}}"#,
        ]);
        let reply = groove_mcp_latest_assistant_reply(&path).expect("parse transcript");
        let _ = fs::remove_file(&path);
        assert!(reply.is_none());

        let path = write_temp_transcript(&[
            r#"{"type":"user","message":{"role":"user","content":"second question"}}"#,
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"partial"}]},"timestamp":"t1"}"#,
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"final answer"}]},"timestamp":"t2"}"#,
        ]);
        let reply = groove_mcp_latest_assistant_reply(&path).expect("parse transcript");
        let _ = fs::remove_file(&path);
        assert_eq!(reply, Some(("final answer".to_string(), Some("t2".to_string()))));
    }
}
