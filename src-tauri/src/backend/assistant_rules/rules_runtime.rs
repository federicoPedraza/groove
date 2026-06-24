// Persistent "rules"/memories the MCP assistant writes down and is expected to
// follow when driving Groove. Two scopes:
//   - global  → <appData>/assistant-rules.json   (every workspace on this device)
//   - project → <workspaceRoot>/.groove/assistant-rules.json (active workspace)
// Storage mirrors the doctrine store (plain JSON list, pretty-printed, default
// when missing). Shared by both the MCP server and the Tauri IPC commands.

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AssistantRule {
    id: String,
    text: String,
    created_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AssistantRuleStore {
    #[serde(default)]
    rules: Vec<AssistantRule>,
}

fn assistant_rules_global_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data dir: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create {}: {error}", dir.display()))?;
    Ok(dir.join("assistant-rules.json"))
}

fn assistant_rules_project_path(workspace_root: &Path) -> PathBuf {
    workspace_root.join(".groove").join("assistant-rules.json")
}

fn read_assistant_rule_store(path: &Path) -> Result<AssistantRuleStore, String> {
    if !path_is_file(path) {
        return Ok(AssistantRuleStore::default());
    }
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    if raw.trim().is_empty() {
        return Ok(AssistantRuleStore::default());
    }
    serde_json::from_str::<AssistantRuleStore>(&raw)
        .map_err(|error| format!("Failed to parse {}: {error}", path.display()))
}

fn write_assistant_rule_store(path: &Path, store: &AssistantRuleStore) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    }
    let body = serde_json::to_string_pretty(store)
        .map_err(|error| format!("Failed to serialize assistant rules: {error}"))?;
    fs::write(path, body).map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

/// Resolves the JSON file for a scope. "project" requires an active workspace.
fn assistant_rules_scope_path(
    app: &AppHandle,
    scope: &str,
    workspace_root: Option<&Path>,
) -> Result<PathBuf, String> {
    match scope {
        "global" => assistant_rules_global_path(app),
        "project" => {
            let root = workspace_root.ok_or_else(|| {
                "No active workspace. Open a workspace in Groove to use project-scoped rules."
                    .to_string()
            })?;
            Ok(assistant_rules_project_path(root))
        }
        other => Err(format!(
            "Unknown scope \"{other}\". Use \"global\" or \"project\"."
        )),
    }
}

fn assistant_rules_add(path: &Path, text: &str) -> Result<AssistantRule, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("\"text\" must be a non-empty rule.".to_string());
    }
    let mut store = read_assistant_rule_store(path)?;
    let rule = AssistantRule {
        id: Uuid::new_v4().to_string(),
        text: text.to_string(),
        created_at: now_iso(),
    };
    store.rules.push(rule.clone());
    write_assistant_rule_store(path, &store)?;
    Ok(rule)
}

fn assistant_rules_remove(path: &Path, id: &str) -> Result<bool, String> {
    let mut store = read_assistant_rule_store(path)?;
    let before = store.rules.len();
    store.rules.retain(|rule| rule.id != id);
    let removed = store.rules.len() != before;
    if removed {
        write_assistant_rule_store(path, &store)?;
    }
    Ok(removed)
}

/// Reads both scopes, tolerating read errors as empty lists (so a malformed
/// project file never hides global rules, and vice versa).
fn assistant_rules_collect(
    app: &AppHandle,
    workspace_root: Option<&Path>,
) -> (Vec<AssistantRule>, Vec<AssistantRule>) {
    let global = assistant_rules_global_path(app)
        .and_then(|path| read_assistant_rule_store(&path))
        .map(|store| store.rules)
        .unwrap_or_default();
    let project = workspace_root
        .map(|root| {
            read_assistant_rule_store(&assistant_rules_project_path(root))
                .map(|store| store.rules)
                .unwrap_or_default()
        })
        .unwrap_or_default();
    (global, project)
}

/// Builds the block appended to the MCP `initialize` instructions so a freshly
/// connected agent immediately sees the rules it must follow. Empty when there
/// are none.
fn assistant_rules_instructions_block(app: &AppHandle) -> String {
    let workspace_root = resolve_workspace_root(app, &None, None, &[], &None).ok();
    let (global, project) = assistant_rules_collect(app, workspace_root.as_deref());
    if global.is_empty() && project.is_empty() {
        return String::new();
    }
    let mut out = String::from(
        "\n\nPersistent assistant rules you MUST follow (managed via list_assistant_rules / add_assistant_rule / remove_assistant_rule):",
    );
    if !project.is_empty() {
        out.push_str("\n[project]");
        for rule in &project {
            out.push_str(&format!("\n- {}", rule.text));
        }
    }
    if !global.is_empty() {
        out.push_str("\n[global]");
        for rule in &global {
            out.push_str(&format!("\n- {}", rule.text));
        }
    }
    out
}
