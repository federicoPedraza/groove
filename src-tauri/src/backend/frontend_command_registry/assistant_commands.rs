// IPC commands backing the Settings → Assistant page. They register Groove's
// embedded MCP server with Claude Code and report whether that connection is
// healthy. Both shell out to the `claude` CLI (resolved the same way terminal
// sessions resolve it) and read Groove's own MCP port from `groove_mcp_port()`.
//
// The CLI calls and the localhost probe can each take a couple of seconds, so
// the Tauri commands are `async` and offload the blocking work via
// `spawn_blocking` — a synchronous command would run on the UI thread and
// freeze the app. This mirrors `groove_summary` and friends.

/// Name Groove registers itself under in Claude Code's MCP config.
const GROOVE_MCP_CLIENT_NAME: &str = "groove";

/// Builds the local endpoint URL Claude Code should POST JSON-RPC to.
fn groove_mcp_endpoint() -> String {
    format!("http://127.0.0.1:{}/mcp", groove_mcp_port())
}

/// Probes Groove's MCP endpoint with a JSON-RPC `initialize` and confirms the
/// reply is actually our server (carries `GROOVE_MCP_SERVER_NAME`), not just
/// some other process squatting on the port. No HTTP client crate is available,
/// so this speaks a minimal HTTP/1.1 request over a localhost TCP socket.
fn probe_groove_mcp_server(port: u16) -> bool {
    let address = format!("127.0.0.1:{port}");
    let mut stream = match std::net::TcpStream::connect(&address) {
        Ok(stream) => stream,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));

    let payload = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": GROOVE_MCP_PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name": "groove-assistant-probe", "version": "1"},
        },
    })
    .to_string();

    let request = format!(
        "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nAccept: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        payload.len(),
        payload,
    );

    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let _ = stream.flush();

    let mut buffer = Vec::new();
    let mut chunk = [0u8; 4096];
    loop {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(read) => {
                buffer.extend_from_slice(&chunk[..read]);
                if buffer.len() > 65_536 {
                    break;
                }
            }
            // A read timeout still leaves us whatever arrived first — use it.
            Err(_) => break,
        }
    }

    let response = String::from_utf8_lossy(&buffer);
    let status_ok = response
        .lines()
        .next()
        .map(|line| line.contains(" 200"))
        .unwrap_or(false);
    status_ok && response.contains(GROOVE_MCP_SERVER_NAME)
}

/// Registers Groove's MCP server in Claude Code at user (global) scope so it is
/// available regardless of the directory Claude Code is launched from. Runs off
/// the UI thread because `claude mcp add` may block for a moment.
#[tauri::command]
async fn assistant_connect_transport() -> AssistantConnectResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || {
        assistant_connect_transport_blocking(request_id)
    })
    .await
    {
        Ok(response) => response,
        Err(error) => AssistantConnectResponse {
            request_id: fallback_request_id,
            ok: false,
            already_connected: false,
            endpoint: groove_mcp_endpoint(),
            scope: "user".to_string(),
            message: None,
            error: Some(format!(
                "Failed to run assistant connect worker thread: {error}"
            )),
        },
    }
}

fn assistant_connect_transport_blocking(request_id: String) -> AssistantConnectResponse {
    let endpoint = groove_mcp_endpoint();
    let scope = "user".to_string();

    if groove_mcp_disabled() {
        return AssistantConnectResponse {
            request_id,
            ok: false,
            already_connected: false,
            endpoint,
            scope,
            message: None,
            error: Some(
                "Groove's MCP server is turned off (GROOVE_MCP_DISABLED). Re-enable it and restart Groove before connecting."
                    .to_string(),
            ),
        };
    }

    let claude_bin = resolve_claude_code_bin();
    let output = Command::new(&claude_bin)
        .args([
            "mcp",
            "add",
            "--scope",
            "user",
            "--transport",
            "http",
            GROOVE_MCP_CLIENT_NAME,
            &endpoint,
        ])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            AssistantConnectResponse {
                request_id,
                ok: true,
                already_connected: false,
                endpoint,
                scope,
                message: Some(if stdout.is_empty() {
                    "Connected Groove's MCP transport to Claude Code.".to_string()
                } else {
                    stdout
                }),
                error: None,
            }
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let combined = if stderr.is_empty() { stdout } else { stderr };
            // Re-adding an existing server is a non-error no-op for our purposes.
            if combined.to_lowercase().contains("already exists") {
                AssistantConnectResponse {
                    request_id,
                    ok: true,
                    already_connected: true,
                    endpoint,
                    scope,
                    message: Some(format!(
                        "'{GROOVE_MCP_CLIENT_NAME}' is already registered in Claude Code."
                    )),
                    error: None,
                }
            } else {
                AssistantConnectResponse {
                    request_id,
                    ok: false,
                    already_connected: false,
                    endpoint,
                    scope,
                    message: None,
                    error: Some(if combined.is_empty() {
                        format!(
                            "Claude CLI exited with status {:?} while adding the transport.",
                            out.status.code()
                        )
                    } else {
                        combined
                    }),
                }
            }
        }
        Err(error) => AssistantConnectResponse {
            request_id,
            ok: false,
            already_connected: false,
            endpoint,
            scope,
            message: None,
            error: Some(format!(
                "Could not run the Claude CLI ('{claude_bin}'): {error}. Make sure Claude Code is installed and on PATH."
            )),
        },
    }
}

/// Reports whether the Assistant link is healthy end-to-end: Groove's endpoint
/// is reachable, Claude Code has it registered, and Claude can connect to it.
/// Runs off the UI thread — `claude mcp list` live-pings every server.
#[tauri::command]
async fn assistant_validate_mcp() -> AssistantValidateResponse {
    let request_id = request_id();
    let fallback_request_id = request_id.clone();

    match tauri::async_runtime::spawn_blocking(move || {
        assistant_validate_mcp_blocking(request_id)
    })
    .await
    {
        Ok(response) => response,
        Err(error) => AssistantValidateResponse {
            request_id: fallback_request_id,
            ok: false,
            server_running: false,
            registered_in_claude: false,
            claude_connection_ok: false,
            endpoint: groove_mcp_endpoint(),
            details: None,
            error: Some(format!(
                "Failed to run assistant validate worker thread: {error}"
            )),
        },
    }
}

fn assistant_validate_mcp_blocking(request_id: String) -> AssistantValidateResponse {
    let port = groove_mcp_port();
    let endpoint = groove_mcp_endpoint();

    let server_running = !groove_mcp_disabled() && probe_groove_mcp_server(port);

    let claude_bin = resolve_claude_code_bin();
    // `claude mcp list` live-pings every configured server and prints a line per
    // server, e.g. `groove: http://127.0.0.1:4923/mcp (HTTP) - ✓ Connected`.
    let output = Command::new(&claude_bin).args(["mcp", "list"]).output();

    let (registered_in_claude, claude_connection_ok, details, error) = match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let groove_line = stdout.lines().find(|line| {
                line.split(':')
                    .next()
                    .map(|key| key.trim() == GROOVE_MCP_CLIENT_NAME)
                    .unwrap_or(false)
            });

            match groove_line {
                Some(line) => {
                    let lower = line.to_lowercase();
                    let connected = lower.contains("connected") && !lower.contains("failed");
                    (true, connected, Some(line.trim().to_string()), None)
                }
                None => {
                    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                    (
                        false,
                        false,
                        None,
                        Some(if stderr.is_empty() {
                            format!(
                                "'{GROOVE_MCP_CLIENT_NAME}' is not registered in Claude Code yet. Use Connect to add it."
                            )
                        } else {
                            stderr
                        }),
                    )
                }
            }
        }
        Err(err) => (
            false,
            false,
            None,
            Some(format!(
                "Could not run the Claude CLI ('{claude_bin}'): {err}. Make sure Claude Code is installed and on PATH."
            )),
        ),
    };

    AssistantValidateResponse {
        request_id,
        ok: server_running && registered_in_claude && claude_connection_ok,
        server_running,
        registered_in_claude,
        claude_connection_ok,
        endpoint,
        details,
        error,
    }
}

/// Builds the current project + global rules snapshot for the Settings UI.
/// Resolves the active workspace the same way MCP handlers do (persisted root);
/// `project_workspace` is None when no workspace is open.
fn assistant_rules_list_response(
    app: &AppHandle,
    request_id: String,
    error: Option<String>,
) -> AssistantRulesListResponse {
    let workspace_root = resolve_workspace_root(app, &None, None, &[], &None).ok();
    let (global, project) = assistant_rules_collect(app, workspace_root.as_deref());
    AssistantRulesListResponse {
        request_id,
        ok: error.is_none(),
        global,
        project,
        project_workspace: workspace_root.map(|path| path.display().to_string()),
        error,
    }
}

#[tauri::command]
fn assistant_rules_list(app: AppHandle) -> AssistantRulesListResponse {
    assistant_rules_list_response(&app, request_id(), None)
}

#[tauri::command]
fn assistant_rule_add(app: AppHandle, scope: String, text: String) -> AssistantRulesListResponse {
    let request_id = request_id();
    let workspace_root = resolve_workspace_root(&app, &None, None, &[], &None).ok();
    let outcome = assistant_rules_scope_path(&app, scope.trim(), workspace_root.as_deref())
        .and_then(|path| assistant_rules_add(&path, &text).map(|_| ()));
    match outcome {
        Ok(()) => assistant_rules_list_response(&app, request_id, None),
        Err(error) => assistant_rules_list_response(&app, request_id, Some(error)),
    }
}

#[tauri::command]
fn assistant_rule_remove(app: AppHandle, scope: String, id: String) -> AssistantRulesListResponse {
    let request_id = request_id();
    let workspace_root = resolve_workspace_root(&app, &None, None, &[], &None).ok();
    let outcome = assistant_rules_scope_path(&app, scope.trim(), workspace_root.as_deref())
        .and_then(|path| assistant_rules_remove(&path, id.trim()).map(|_| ()));
    match outcome {
        Ok(()) => assistant_rules_list_response(&app, request_id, None),
        Err(error) => assistant_rules_list_response(&app, request_id, Some(error)),
    }
}
