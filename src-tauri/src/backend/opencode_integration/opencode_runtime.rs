const OPEN_CODE_PROFILE_VERSION: &str = "0.1.7";
const OPEN_CODE_DEFAULT_FLOW: &str = "sdd";
const OPEN_CODE_DEFAULT_ARTIFACT_STORE: &str = "none";
const OPEN_CODE_DEFAULT_PHASE_SECONDS: u64 = 900;
const OPEN_CODE_PROFILE_FILE: &str = "opencode-profile.json";
const OPEN_CODE_SYNC_FILE: &str = "opencode-config.generated.json";

#[derive(Debug, Clone, Deserialize, Serialize)]
struct OpenCodeProfileDiskCommands {
    init: String,
    #[serde(alias = "newChange")]
    new_change: String,
    #[serde(rename = "continue")]
    continue_phase: String,
    apply: String,
    verify: String,
    archive: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct OpenCodeProfileDiskTimeouts {
    #[serde(alias = "phaseSeconds")]
    phase_seconds: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct OpenCodeProfileDiskSafety {
    #[serde(alias = "requireUserApprovalBetweenPhases")]
    require_user_approval_between_phases: bool,
    #[serde(alias = "allowParallelSpecDesign")]
    allow_parallel_spec_design: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct OpenCodeProfileDisk {
    version: String,
    enabled: bool,
    #[serde(alias = "artifactStore")]
    artifact_store: String,
    #[serde(alias = "defaultFlow")]
    default_flow: String,
    commands: OpenCodeProfileDiskCommands,
    timeouts: OpenCodeProfileDiskTimeouts,
    safety: OpenCodeProfileDiskSafety,
}

fn default_opencode_profile_commands() -> OpenCodeProfileCommands {
    OpenCodeProfileCommands {
        init: "/sdd-init".to_string(),
        new_change: "/sdd-new".to_string(),
        continue_phase: "/sdd-continue".to_string(),
        apply: "/sdd-apply".to_string(),
        verify: "/sdd-verify".to_string(),
        archive: "/sdd-archive".to_string(),
    }
}

fn default_opencode_profile() -> OpenCodeProfile {
    OpenCodeProfile {
        version: OPEN_CODE_PROFILE_VERSION.to_string(),
        enabled: true,
        artifact_store: OPEN_CODE_DEFAULT_ARTIFACT_STORE.to_string(),
        default_flow: OPEN_CODE_DEFAULT_FLOW.to_string(),
        commands: default_opencode_profile_commands(),
        timeouts: OpenCodeProfileTimeouts {
            phase_seconds: OPEN_CODE_DEFAULT_PHASE_SECONDS,
        },
        safety: OpenCodeProfileSafety {
            require_user_approval_between_phases: true,
            allow_parallel_spec_design: true,
        },
    }
}

fn profile_disk_from_profile(profile: &OpenCodeProfile) -> OpenCodeProfileDisk {
    OpenCodeProfileDisk {
        version: profile.version.clone(),
        enabled: profile.enabled,
        artifact_store: profile.artifact_store.clone(),
        default_flow: profile.default_flow.clone(),
        commands: OpenCodeProfileDiskCommands {
            init: profile.commands.init.clone(),
            new_change: profile.commands.new_change.clone(),
            continue_phase: profile.commands.continue_phase.clone(),
            apply: profile.commands.apply.clone(),
            verify: profile.commands.verify.clone(),
            archive: profile.commands.archive.clone(),
        },
        timeouts: OpenCodeProfileDiskTimeouts {
            phase_seconds: profile.timeouts.phase_seconds,
        },
        safety: OpenCodeProfileDiskSafety {
            require_user_approval_between_phases: profile
                .safety
                .require_user_approval_between_phases,
            allow_parallel_spec_design: profile.safety.allow_parallel_spec_design,
        },
    }
}

fn profile_from_disk(profile: &OpenCodeProfileDisk) -> OpenCodeProfile {
    OpenCodeProfile {
        version: profile.version.clone(),
        enabled: profile.enabled,
        artifact_store: profile.artifact_store.clone(),
        default_flow: profile.default_flow.clone(),
        commands: OpenCodeProfileCommands {
            init: profile.commands.init.clone(),
            new_change: profile.commands.new_change.clone(),
            continue_phase: profile.commands.continue_phase.clone(),
            apply: profile.commands.apply.clone(),
            verify: profile.commands.verify.clone(),
            archive: profile.commands.archive.clone(),
        },
        timeouts: OpenCodeProfileTimeouts {
            phase_seconds: profile.timeouts.phase_seconds,
        },
        safety: OpenCodeProfileSafety {
            require_user_approval_between_phases: profile
                .safety
                .require_user_approval_between_phases,
            allow_parallel_spec_design: profile.safety.allow_parallel_spec_design,
        },
    }
}

fn opencode_profile_path(worktree_path: &Path) -> PathBuf {
    worktree_path.join(".groove").join(OPEN_CODE_PROFILE_FILE)
}

fn opencode_sync_path(worktree_path: &Path) -> PathBuf {
    worktree_path.join(".groove").join(OPEN_CODE_SYNC_FILE)
}

fn backup_timestamp() -> String {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| format!("{}-{:09}", duration.as_secs(), duration.subsec_nanos()))
        .unwrap_or_else(|_| "0".to_string())
}

fn normalize_non_empty(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn normalize_alias_command(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return fallback.to_string();
    }

    if trimmed.starts_with('/') {
        return trimmed.to_string();
    }

    format!("/{trimmed}")
}

fn normalize_artifact_store(value: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "engram" => "engram".to_string(),
        "openspec" => "openspec".to_string(),
        "none" => "none".to_string(),
        _ => OPEN_CODE_DEFAULT_ARTIFACT_STORE.to_string(),
    }
}

fn normalize_opencode_profile(profile: &OpenCodeProfile) -> OpenCodeProfile {
    let defaults = default_opencode_profile();
    let phase_seconds = profile.timeouts.phase_seconds.clamp(30, 7200);

    OpenCodeProfile {
        version: normalize_non_empty(&profile.version, OPEN_CODE_PROFILE_VERSION),
        enabled: profile.enabled,
        artifact_store: normalize_artifact_store(&profile.artifact_store),
        default_flow: normalize_non_empty(&profile.default_flow, OPEN_CODE_DEFAULT_FLOW),
        commands: OpenCodeProfileCommands {
            init: normalize_alias_command(&profile.commands.init, &defaults.commands.init),
            new_change: normalize_alias_command(
                &profile.commands.new_change,
                &defaults.commands.new_change,
            ),
            continue_phase: normalize_alias_command(
                &profile.commands.continue_phase,
                &defaults.commands.continue_phase,
            ),
            apply: normalize_alias_command(&profile.commands.apply, &defaults.commands.apply),
            verify: normalize_alias_command(&profile.commands.verify, &defaults.commands.verify),
            archive: normalize_alias_command(&profile.commands.archive, &defaults.commands.archive),
        },
        timeouts: OpenCodeProfileTimeouts { phase_seconds },
        safety: OpenCodeProfileSafety {
            require_user_approval_between_phases: profile
                .safety
                .require_user_approval_between_phases,
            allow_parallel_spec_design: profile.safety.allow_parallel_spec_design,
        },
    }
}

fn merge_opencode_profile_patch(
    profile: &OpenCodeProfile,
    patch: &OpenCodeProfilePatch,
) -> OpenCodeProfile {
    let mut next = profile.clone();

    if let Some(version) = patch.version.as_deref() {
        next.version = version.to_string();
    }
    if let Some(enabled) = patch.enabled {
        next.enabled = enabled;
    }
    if let Some(artifact_store) = patch.artifact_store.as_deref() {
        next.artifact_store = artifact_store.to_string();
    }
    if let Some(default_flow) = patch.default_flow.as_deref() {
        next.default_flow = default_flow.to_string();
    }

    if let Some(commands_patch) = patch.commands.as_ref() {
        if let Some(init) = commands_patch.init.as_deref() {
            next.commands.init = init.to_string();
        }
        if let Some(new_change) = commands_patch.new_change.as_deref() {
            next.commands.new_change = new_change.to_string();
        }
        if let Some(continue_phase) = commands_patch.continue_phase.as_deref() {
            next.commands.continue_phase = continue_phase.to_string();
        }
        if let Some(apply) = commands_patch.apply.as_deref() {
            next.commands.apply = apply.to_string();
        }
        if let Some(verify) = commands_patch.verify.as_deref() {
            next.commands.verify = verify.to_string();
        }
        if let Some(archive) = commands_patch.archive.as_deref() {
            next.commands.archive = archive.to_string();
        }
    }

    if let Some(timeouts_patch) = patch.timeouts.as_ref() {
        if let Some(phase_seconds) = timeouts_patch.phase_seconds {
            next.timeouts.phase_seconds = phase_seconds;
        }
    }

    if let Some(safety_patch) = patch.safety.as_ref() {
        if let Some(require_approval) = safety_patch.require_user_approval_between_phases {
            next.safety.require_user_approval_between_phases = require_approval;
        }
        if let Some(allow_parallel) = safety_patch.allow_parallel_spec_design {
            next.safety.allow_parallel_spec_design = allow_parallel;
        }
    }

    normalize_opencode_profile(&next)
}

fn ensure_groove_dir(worktree_path: &Path) -> Result<PathBuf, String> {
    let groove_dir = worktree_path.join(".groove");
    fs::create_dir_all(&groove_dir)
        .map_err(|error| format!("Failed to create {}: {error}", groove_dir.display()))?;
    Ok(groove_dir)
}

fn read_or_default_opencode_profile(worktree_path: &Path) -> Result<OpenCodeProfile, String> {
    let profile_path = opencode_profile_path(worktree_path);
    if !path_is_file(&profile_path) {
        return Ok(default_opencode_profile());
    }

    let raw = fs::read_to_string(&profile_path)
        .map_err(|error| format!("Failed to read {}: {error}", profile_path.display()))?;
    let parsed = serde_json::from_str::<OpenCodeProfileDisk>(&raw).map_err(|error| {
        format!(
            "ProfileInvalid: failed to parse {}: {error}",
            profile_path.display()
        )
    })?;

    Ok(normalize_opencode_profile(&profile_from_disk(&parsed)))
}

fn read_existing_opencode_profile(worktree_path: &Path) -> Result<Option<OpenCodeProfile>, String> {
    let profile_path = opencode_profile_path(worktree_path);
    if !path_is_file(&profile_path) {
        return Ok(None);
    }

    let raw = fs::read_to_string(&profile_path)
        .map_err(|error| format!("Failed to read {}: {error}", profile_path.display()))?;
    let parsed = serde_json::from_str::<OpenCodeProfileDisk>(&raw).map_err(|error| {
        format!(
            "ProfileInvalid: failed to parse {}: {error}",
            profile_path.display()
        )
    })?;

    Ok(Some(normalize_opencode_profile(&profile_from_disk(
        &parsed,
    ))))
}

fn write_opencode_profile(worktree_path: &Path, profile: &OpenCodeProfile) -> Result<(), String> {
    ensure_groove_dir(worktree_path)?;
    let profile_path = opencode_profile_path(worktree_path);
    let normalized = normalize_opencode_profile(profile);
    let body = serde_json::to_string_pretty(&profile_disk_from_profile(&normalized))
        .map_err(|error| format!("Failed to serialize OpenCode profile: {error}"))?;
    fs::write(&profile_path, format!("{body}\n"))
        .map_err(|error| format!("Failed to write {}: {error}", profile_path.display()))
}

fn resolve_opencode_binary() -> Option<PathBuf> {
    let candidate = Command::new("opencode").arg("--version").output();
    if let Ok(output) = candidate {
        if output.status.code().is_some() {
            return Some(PathBuf::from("opencode"));
        }
    }

    let fallback = dirs_home()?.join(".opencode").join("bin").join("opencode");
    if path_is_file(&fallback) {
        Some(fallback)
    } else {
        None
    }
}

fn opencode_binary_to_string(path: &Path) -> String {
    path.to_str()
        .map(|value| value.to_string())
        .unwrap_or_else(|| path.display().to_string())
}

fn candidate_agent_teams_lite_dirs(worktree_path: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();

    if let Some(from_env) = std::env::var_os("AGENT_TEAMS_LITE_DIR") {
        let path = PathBuf::from(from_env);
        if seen.insert(path.clone()) {
            candidates.push(path);
        }
    }

    if let Some(home) = dirs_home() {
        let default_home = home.join(".local").join("share").join("agent-teams-lite");
        if seen.insert(default_home.clone()) {
            candidates.push(default_home);
        }

        let macos_default = home
            .join("Library")
            .join("Application Support")
            .join("agent-teams-lite");
        if seen.insert(macos_default.clone()) {
            candidates.push(macos_default);
        }

        let repo_clone = home.join("agent-teams-lite");
        if seen.insert(repo_clone.clone()) {
            candidates.push(repo_clone);
        }
    }

    let sibling_clone = worktree_path.join("agent-teams-lite");
    if seen.insert(sibling_clone.clone()) {
        candidates.push(sibling_clone);
    }

    candidates
}

fn detect_agent_teams_lite_dir(worktree_path: &Path) -> Option<PathBuf> {
    candidate_agent_teams_lite_dirs(worktree_path)
        .into_iter()
        .find(|path| path_is_directory(path))
}

fn missing_sdd_commands(worktree_path: &Path, agent_teams_lite_dir: Option<&Path>) -> Vec<String> {
    let required = [
        "sdd-init",
        "sdd-new",
        "sdd-continue",
        "sdd-apply",
        "sdd-verify",
        "sdd-archive",
    ];

    required
        .iter()
        .filter_map(|name| {
            let mut candidates = Vec::new();

            if let Some(atl_dir) = agent_teams_lite_dir {
                candidates.push(atl_dir.join("commands").join(format!("{name}.md")));
                candidates.push(
                    atl_dir
                        .join(".opencode")
                        .join("commands")
                        .join(format!("{name}.md")),
                );
                candidates.push(atl_dir.join("skills").join(name));
            }

            candidates.push(
                worktree_path
                    .join(".opencode")
                    .join("commands")
                    .join(format!("{name}.md")),
            );
            candidates.push(worktree_path.join(".opencode").join("skills").join(name));

            if let Some(home) = dirs_home() {
                candidates.push(
                    home.join(".opencode")
                        .join("commands")
                        .join(format!("{name}.md")),
                );
                candidates.push(home.join(".opencode").join("skills").join(name));
            }

            if candidates.iter().any(|path| path.exists()) {
                None
            } else {
                Some((*name).to_string())
            }
        })
        .collect()
}

fn atl_command_source_path(
    agent_teams_lite_dir: Option<&Path>,
    command_name: &str,
) -> Option<PathBuf> {
    let atl_dir = agent_teams_lite_dir?;
    let direct = atl_dir.join("commands").join(format!("{command_name}.md"));
    if path_is_file(&direct) {
        return Some(direct);
    }

    let nested = atl_dir
        .join(".opencode")
        .join("commands")
        .join(format!("{command_name}.md"));
    if path_is_file(&nested) {
        return Some(nested);
    }

    None
}

fn default_repaired_command_ref(
    command_name: &str,
    alias: &str,
    atl_source: Option<&Path>,
) -> String {
    let source_text = atl_source
        .map(|path| path.display().to_string())
        .unwrap_or_else(|| "not-available".to_string());
    format!(
        "# {command_name}\n\nThis command reference was generated by Groove repair.\n\n- command: /{command_name}\n- preferredAlias: {alias}\n- agentTeamsLiteSource: {source_text}\n"
    )
}

fn ensure_required_command_refs_for_repair(
    worktree_path: &Path,
    profile: &OpenCodeProfile,
    agent_teams_lite_dir: Option<&Path>,
    missing_commands: &[String],
    backup_dir: &Path,
) -> Result<Vec<String>, String> {
    if missing_commands.is_empty() {
        return Ok(Vec::new());
    }

    let commands_dir = worktree_path.join(".opencode").join("commands");
    fs::create_dir_all(&commands_dir)
        .map_err(|error| format!("Failed to create {}: {error}", commands_dir.display()))?;

    let phase_aliases = [
        ("sdd-init", profile.commands.init.as_str()),
        ("sdd-new", profile.commands.new_change.as_str()),
        ("sdd-continue", profile.commands.continue_phase.as_str()),
        ("sdd-apply", profile.commands.apply.as_str()),
        ("sdd-verify", profile.commands.verify.as_str()),
        ("sdd-archive", profile.commands.archive.as_str()),
    ];

    let mut actions = vec![format!(
        "Ensured local OpenCode command directory {}",
        commands_dir.display()
    )];

    for (command_name, alias) in phase_aliases {
        if !missing_commands.iter().any(|value| value == command_name) {
            continue;
        }

        let local_path = commands_dir.join(format!("{command_name}.md"));
        if backup_file_if_exists(&local_path, backup_dir)? {
            actions.push(format!("Backed up {}", local_path.display()));
        }

        let atl_source = atl_command_source_path(agent_teams_lite_dir, command_name);
        if let Some(source) = atl_source.as_ref() {
            let source_body = fs::read_to_string(source)
                .map_err(|error| format!("Failed to read {}: {error}", source.display()))?;
            fs::write(&local_path, source_body)
                .map_err(|error| format!("Failed to write {}: {error}", local_path.display()))?;
            actions.push(format!(
                "Provisioned {} from ATL source {}",
                local_path.display(),
                source.display()
            ));
            continue;
        }

        let body = format!(
            "{}\n",
            default_repaired_command_ref(command_name, alias, atl_source.as_deref())
        );
        fs::write(&local_path, body)
            .map_err(|error| format!("Failed to write {}: {error}", local_path.display()))?;
        actions.push(format!(
            "Provisioned fallback command reference {}",
            local_path.display()
        ));
    }

    Ok(actions)
}

#[derive(Debug, Clone)]
struct ArtifactStoreReadiness {
    ready: bool,
    blockers: Vec<String>,
    recommendations: Vec<String>,
    engram_binary_available: Option<bool>,
    engram_opencode_mcp_config_present: Option<bool>,
    engram_opencode_plugin_present: Option<bool>,
    engram_opencode_config_path: Option<String>,
    engram_opencode_plugin_path: Option<String>,
}

impl ArtifactStoreReadiness {
    fn all_messages(&self) -> Vec<String> {
        let mut messages = Vec::new();
        messages.extend(self.blockers.iter().map(|msg| format!("BLOCKER: {msg}")));
        messages.extend(
            self.recommendations
                .iter()
                .map(|msg| format!("RECOMMENDED: {msg}")),
        );
        messages
    }
}

fn engram_binary_available_on_path() -> bool {
    Command::new("engram")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn opencode_config_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(home) = dirs_home() {
        candidates.push(home.join(".config").join("opencode").join("opencode.json"));
        candidates.push(home.join(".opencode").join("opencode.json"));
    }

    if let Ok(appdata) = std::env::var("APPDATA") {
        candidates.push(
            PathBuf::from(appdata)
                .join("opencode")
                .join("opencode.json"),
        );
    }
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        candidates.push(
            PathBuf::from(user_profile)
                .join("AppData")
                .join("Roaming")
                .join("opencode")
                .join("opencode.json"),
        );
    }

    let mut deduped = Vec::new();
    let mut seen = HashSet::new();
    for candidate in candidates {
        if seen.insert(candidate.clone()) {
            deduped.push(candidate);
        }
    }

    deduped
}

fn resolve_opencode_config_path() -> PathBuf {
    opencode_config_candidates()
        .into_iter()
        .next()
        .unwrap_or_else(|| PathBuf::from("~/.config/opencode/opencode.json"))
}

fn opencode_mcp_has_engram_entry(parsed: &serde_json::Value) -> bool {
    let mcp_table = parsed
        .get("mcp")
        .or_else(|| parsed.get("mcpServers"))
        .or_else(|| parsed.get("mcp_servers"));

    let Some(table) = mcp_table else {
        return false;
    };

    if let Some(value) = table.get("engram") {
        return !value.is_null();
    }

    table
        .as_object()
        .map(|entries| {
            entries.iter().any(|(name, value)| {
                name.to_lowercase().contains("engram")
                    || value
                        .as_object()
                        .and_then(|inner| inner.get("command"))
                        .and_then(|command| command.as_str())
                        .map(|command| command.to_lowercase().contains("engram"))
                        .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn read_engram_mcp_presence(config_path: &Path) -> bool {
    if !path_is_file(config_path) {
        return false;
    }

    let Ok(raw) = fs::read_to_string(config_path) else {
        return false;
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return false;
    };

    opencode_mcp_has_engram_entry(&parsed)
}

fn evaluate_artifact_store_readiness(
    worktree_path: &Path,
    artifact_store: &str,
) -> ArtifactStoreReadiness {
    let normalized_store = normalize_artifact_store(artifact_store);

    match normalized_store.as_str() {
        "engram" => {
            let mut blockers = Vec::new();
            let mut recommendations = Vec::new();

            let has_env = std::env::var("ENGRAM_API_KEY")
                .ok()
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false);
            let has_global_key = resolve_engram_api_key_from_global_groove_config().is_some();
            let has_config_dir = dirs_home()
                .map(|home| home.join(".config").join("engram"))
                .map(|path| path_is_directory(&path))
                .unwrap_or(false);

            if !(has_env || has_config_dir || has_global_key) {
                blockers.push(
                    "artifact_store=engram requires an Engram API key. Set ENGRAM_API_KEY (your Engram API token), configure ~/.config/engram, or add it to ~/.groove/config.json or ~/.config/groove/config.json."
                        .to_string(),
                );
            }

            let engram_binary_available = engram_binary_available_on_path();
            if !engram_binary_available {
                blockers.push(
                    "artifact_store=engram expects the `engram` CLI to be available on PATH (for setup/serve flows)."
                        .to_string(),
                );
            }

            let opencode_config_path = resolve_opencode_config_path();
            let opencode_plugin_path = opencode_config_path
                .parent()
                .map(|dir| dir.join("plugins").join("engram.ts"))
                .unwrap_or_else(|| PathBuf::from("~/.config/opencode/plugins/engram.ts"));

            let engram_mcp_present = read_engram_mcp_presence(&opencode_config_path);
            if !engram_mcp_present {
                recommendations.push(format!(
                    "OpenCode MCP config does not appear to include an Engram entry at {}. Recommended: run `engram setup opencode` or add an `engram` MCP entry manually.",
                    opencode_config_path.display()
                ));
            }

            let engram_plugin_present = path_is_file(&opencode_plugin_path);
            if !engram_plugin_present {
                recommendations.push(format!(
                    "Optional OpenCode plugin not found at {}. Recommended for richer Engram/OpenCode integration.",
                    opencode_plugin_path.display()
                ));
            }

            ArtifactStoreReadiness {
                ready: blockers.is_empty(),
                blockers,
                recommendations,
                engram_binary_available: Some(engram_binary_available),
                engram_opencode_mcp_config_present: Some(engram_mcp_present),
                engram_opencode_plugin_present: Some(engram_plugin_present),
                engram_opencode_config_path: Some(opencode_config_path.display().to_string()),
                engram_opencode_plugin_path: Some(opencode_plugin_path.display().to_string()),
            }
        }
        "openspec" => {
            let mut blockers = Vec::new();
            let openspec_dir = worktree_path.join(".groove").join("openspec");
            if !path_is_directory(&openspec_dir) {
                blockers.push(format!(
                    "artifact_store=openspec expects {} to exist.",
                    openspec_dir.display()
                ));
            }

            ArtifactStoreReadiness {
                ready: blockers.is_empty(),
                blockers,
                recommendations: Vec::new(),
                engram_binary_available: None,
                engram_opencode_mcp_config_present: None,
                engram_opencode_plugin_present: None,
                engram_opencode_config_path: None,
                engram_opencode_plugin_path: None,
            }
        }
        "none" => ArtifactStoreReadiness {
            ready: true,
            blockers: Vec::new(),
            recommendations: Vec::new(),
            engram_binary_available: None,
            engram_opencode_mcp_config_present: None,
            engram_opencode_plugin_present: None,
            engram_opencode_config_path: None,
            engram_opencode_plugin_path: None,
        },
        _ => ArtifactStoreReadiness {
            ready: false,
            blockers: vec![format!(
                "Unsupported artifact store \"{}\". Use engram, openspec, or none.",
                artifact_store
            )],
            recommendations: Vec::new(),
            engram_binary_available: None,
            engram_opencode_mcp_config_present: None,
            engram_opencode_plugin_present: None,
            engram_opencode_config_path: None,
            engram_opencode_plugin_path: None,
        },
    }
}

fn engram_global_groove_config_candidates() -> Vec<PathBuf> {
    let Some(home) = dirs_home() else {
        return Vec::new();
    };

    vec![
        home.join(".groove").join("config.json"),
        home.join(".config").join("groove").join("config.json"),
    ]
}

fn extract_engram_api_key_from_global_groove_config_json(
    parsed: &serde_json::Value,
) -> Option<String> {
    let nested = parsed
        .get("engram")
        .and_then(|value| value.get("api_key"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);
    if nested.is_some() {
        return nested;
    }

    parsed
        .get("ENGRAM_API_KEY")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn resolve_engram_api_key_from_global_groove_config() -> Option<String> {
    for path in engram_global_groove_config_candidates() {
        if !path_is_file(&path) {
            continue;
        }

        let Ok(raw) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) else {
            continue;
        };

        if let Some(api_key) = extract_engram_api_key_from_global_groove_config_json(&parsed) {
            return Some(api_key);
        }
    }

    None
}

fn build_opencode_error(
    code: &str,
    message: &str,
    hint: &str,
    paths: Vec<String>,
) -> OpenCodeErrorDetail {
    OpenCodeErrorDetail {
        code: code.to_string(),
        message: message.to_string(),
        hint: hint.to_string(),
        paths,
    }
}

fn check_opencode_status_runtime(worktree_path: &Path) -> OpenCodeStatus {
    let mut warnings = Vec::new();
    let worktree_exists = path_is_directory(worktree_path);

    if !worktree_exists {
        warnings.push(format!(
            "Worktree path does not exist: {}",
            worktree_path.display()
        ));
    }

    let git_repo = if worktree_exists {
        let result = Command::new("git")
            .arg("-C")
            .arg(worktree_path)
            .args(["rev-parse", "--is-inside-work-tree"])
            .output();
        match result {
            Ok(output) => {
                output.status.code() == Some(0)
                    && String::from_utf8_lossy(&output.stdout).trim() == "true"
            }
            Err(_) => false,
        }
    } else {
        false
    };

    if worktree_exists && !git_repo {
        warnings.push("Path is not an active git repository/worktree.".to_string());
    }

    let opencode_binary = resolve_opencode_binary();
    let opencode_available = opencode_binary.is_some();
    if !opencode_available {
        warnings.push(
            "OpenCode binary not found. Install opencode or add ~/.opencode/bin to PATH."
                .to_string(),
        );
    }

    let agent_teams_lite_dir = detect_agent_teams_lite_dir(worktree_path);
    let agent_teams_lite_available = agent_teams_lite_dir.is_some();
    let missing_commands = missing_sdd_commands(worktree_path, agent_teams_lite_dir.as_deref());
    let required_commands_available = missing_commands.is_empty();
    if !agent_teams_lite_available && required_commands_available {
        warnings.push(
            "Agent Teams Lite directory is not detected; using available SDD command/skill refs from OpenCode paths."
                .to_string(),
        );
    } else if !agent_teams_lite_available {
        warnings.push(
            "Agent Teams Lite not found. Set AGENT_TEAMS_LITE_DIR or install to ~/.local/share/agent-teams-lite (or ~/Library/Application Support/agent-teams-lite on macOS)."
                .to_string(),
        );
    }
    if !missing_commands.is_empty() {
        warnings.push(format!(
            "Required SDD command/skill refs are missing: {}",
            missing_commands.join(", ")
        ));
    }

    let profile_path = opencode_profile_path(worktree_path);
    let profile_present = path_is_file(&profile_path);
    if !profile_present {
        warnings.push(format!(
            "OpenCode profile is missing: {}",
            profile_path.display()
        ));
    }

    let profile_read = read_existing_opencode_profile(worktree_path);
    let profile = match &profile_read {
        Ok(value) => value.clone(),
        Err(error) => {
            warnings.push(error.clone());
            None
        }
    };
    let profile_valid = profile.is_some();
    if profile_present && !profile_valid {
        warnings.push(format!(
            "OpenCode profile is invalid and must be repaired: {}",
            profile_path.display()
        ));
    }

    let artifact_store = profile.as_ref().map(|value| value.artifact_store.clone());
    let artifact_readiness = evaluate_artifact_store_readiness(
        worktree_path,
        artifact_store
            .as_deref()
            .unwrap_or(OPEN_CODE_DEFAULT_ARTIFACT_STORE),
    );
    warnings.extend(artifact_readiness.all_messages());
    let artifact_store_ready = artifact_readiness.ready;

    let sync_target_path = opencode_sync_path(worktree_path);
    let sync_target_exists = path_is_file(&sync_target_path);

    let atl_ready = agent_teams_lite_available || required_commands_available;
    let refs_ready = required_commands_available;
    let profile_exists_and_valid = profile_present && profile_valid;
    let sync_artifact_applied = sync_target_exists;

    let mut hard_blockers = Vec::new();
    let recommendations = artifact_readiness.recommendations.clone();
    if !atl_ready {
        hard_blockers.push(
            "Agent Teams Lite is not available. Set AGENT_TEAMS_LITE_DIR or install to ~/.local/share/agent-teams-lite (or ~/Library/Application Support/agent-teams-lite on macOS)."
                .to_string(),
        );
    }
    if atl_ready && !refs_ready {
        hard_blockers.push(format!(
            "Required ATL SDD refs are missing: {}",
            missing_commands.join(", ")
        ));
    }
    if !profile_exists_and_valid {
        hard_blockers.push(format!(
            "OpenCode profile must exist and be valid at {}.",
            profile_path.display()
        ));
    }
    if !sync_artifact_applied {
        hard_blockers.push(format!(
            "Sync artifact is missing at {}. Run sync/repair to regenerate it.",
            sync_target_path.display()
        ));
    }
    hard_blockers.extend(artifact_readiness.blockers.clone());

    let mut sanity_diagnostics = Vec::new();
    sanity_diagnostics.extend(
        hard_blockers
            .iter()
            .map(|message| format!("BLOCKER: {message}")),
    );
    sanity_diagnostics.extend(
        recommendations
            .iter()
            .map(|message| format!("RECOMMENDED: {message}")),
    );

    let sanity_checks = OpenCodeSanityChecks {
        agent_teams_lite_available: atl_ready,
        required_refs_present: refs_ready,
        profile_exists_and_valid,
        sync_artifact_applied,
        artifact_store_ready,
    };
    let sanity = OpenCodeSanityStatus {
        applied: worktree_exists
            && git_repo
            && opencode_available
            && sanity_checks.agent_teams_lite_available
            && sanity_checks.required_refs_present
            && sanity_checks.profile_exists_and_valid
            && sanity_checks.sync_artifact_applied
            && sanity_checks.artifact_store_ready,
        checks: sanity_checks,
        hard_blockers,
        recommendations,
        diagnostics: sanity_diagnostics,
    };

    OpenCodeStatus {
        worktree_path: worktree_path.display().to_string(),
        worktree_exists,
        git_repo,
        opencode_available,
        opencode_binary_path: opencode_binary
            .as_ref()
            .map(|path| path.display().to_string()),
        agent_teams_lite_available,
        agent_teams_lite_dir: agent_teams_lite_dir.map(|path| path.display().to_string()),
        required_commands_available,
        missing_commands,
        profile_present,
        profile_path: profile_path.display().to_string(),
        sync_target_exists,
        sync_target_path: sync_target_path.display().to_string(),
        artifact_store,
        artifact_store_ready,
        engram_binary_available: artifact_readiness.engram_binary_available,
        engram_opencode_mcp_config_present: artifact_readiness.engram_opencode_mcp_config_present,
        engram_opencode_plugin_present: artifact_readiness.engram_opencode_plugin_present,
        engram_opencode_config_path: artifact_readiness.engram_opencode_config_path,
        engram_opencode_plugin_path: artifact_readiness.engram_opencode_plugin_path,
        profile_valid,
        warnings,
        sanity,
    }
}

fn backup_path_for_repair(worktree_path: &Path) -> Result<PathBuf, String> {
    let groove_dir = ensure_groove_dir(worktree_path)?;
    let backup_dir = groove_dir.join(format!("backup-{}", backup_timestamp()));
    fs::create_dir_all(&backup_dir)
        .map_err(|error| format!("Failed to create {}: {error}", backup_dir.display()))?;
    Ok(backup_dir)
}

fn backup_file_if_exists(source: &Path, backup_dir: &Path) -> Result<bool, String> {
    if !path_is_file(source) {
        return Ok(false);
    }

    let Some(file_name) = source.file_name() else {
        return Err(format!("Invalid backup source path: {}", source.display()));
    };
    let target = backup_dir.join(file_name);
    fs::copy(source, &target).map_err(|error| {
        format!(
            "Failed to backup {} to {}: {error}",
            source.display(),
            target.display()
        )
    })?;

    Ok(true)
}

fn repair_opencode_integration_runtime(
    worktree_path: &Path,
) -> Result<OpenCodeRepairResult, String> {
    let initial_status = check_opencode_status_runtime(worktree_path);
    if initial_status.sanity.applied {
        return Ok(OpenCodeRepairResult {
            repaired: false,
            backup_path: None,
            actions: vec!["No repair needed; ATL sanity check is already healthy.".to_string()],
            post_repair_status: initial_status,
        });
    }

    if !initial_status.worktree_exists {
        return Err("Cannot repair because worktree path does not exist.".to_string());
    }

    let backup_dir = backup_path_for_repair(worktree_path)?;
    let mut actions = vec![format!("Created backup directory {}", backup_dir.display())];

    let profile_path = opencode_profile_path(worktree_path);
    let sync_path = opencode_sync_path(worktree_path);

    if backup_file_if_exists(&profile_path, &backup_dir)? {
        actions.push(format!("Backed up {}", profile_path.display()));
    }
    if backup_file_if_exists(&sync_path, &backup_dir)? {
        actions.push(format!("Backed up {}", sync_path.display()));
    }

    if !initial_status.profile_present || !initial_status.profile_valid {
        write_opencode_profile(worktree_path, &default_opencode_profile())?;
        actions.push(format!(
            "Wrote default profile to {}",
            profile_path.display()
        ));
    }

    let mut profile = read_or_default_opencode_profile(worktree_path)?;
    if normalize_artifact_store(&profile.artifact_store) == "engram" {
        profile.artifact_store = OPEN_CODE_DEFAULT_ARTIFACT_STORE.to_string();
        write_opencode_profile(worktree_path, &profile)?;
        actions.push("artifact_store migrated engram->none".to_string());
    }

    let command_ref_actions = ensure_required_command_refs_for_repair(
        worktree_path,
        &profile,
        initial_status
            .agent_teams_lite_dir
            .as_deref()
            .map(Path::new),
        &initial_status.missing_commands,
        &backup_dir,
    )?;
    actions.extend(command_ref_actions);

    if normalize_artifact_store(&profile.artifact_store) == "openspec" {
        let openspec_dir = worktree_path.join(".groove").join("openspec");
        fs::create_dir_all(&openspec_dir)
            .map_err(|error| format!("Failed to create {}: {error}", openspec_dir.display()))?;
        actions.push(format!(
            "Ensured artifact store directory {}",
            openspec_dir.display()
        ));
    }

    match sync_opencode_config_runtime(worktree_path) {
        Ok(sync_result) => {
            actions.push(sync_result.message);
        }
        Err(error) => {
            actions.push(format!(
                "Sync skipped/failed ({}): {}",
                error.code, error.message
            ));
        }
    }

    let post_status = check_opencode_status_runtime(worktree_path);
    if !post_status.sanity.applied {
        if !post_status.worktree_exists {
            actions.push("Repair remains blocked: worktree path does not exist.".to_string());
        }
        if !post_status.git_repo {
            actions
                .push("Repair remains blocked: path is not a git repository/worktree.".to_string());
        }
        if !post_status.opencode_available {
            actions.push(
                "Repair remains blocked: OpenCode binary is not available on PATH.".to_string(),
            );
        }
        if !post_status.required_commands_available {
            actions.push(format!(
                "Repair remains blocked: required SDD refs are still missing: {}",
                post_status.missing_commands.join(", ")
            ));
        }
        if !post_status.profile_valid {
            actions.push("Repair remains blocked: OpenCode profile is still invalid.".to_string());
        }
        if !post_status.sync_target_exists {
            actions.push("Repair remains blocked: sync artifact was not generated.".to_string());
        }
        if !post_status.artifact_store_ready {
            actions.push(
                "Repair remains blocked: configured artifact store is not ready.".to_string(),
            );
        }
    }

    Ok(OpenCodeRepairResult {
        repaired: post_status.sanity.applied,
        backup_path: Some(backup_dir.display().to_string()),
        actions,
        post_repair_status: post_status,
    })
}

fn build_phase_alias(profile: &OpenCodeProfile, phase: &str) -> Option<String> {
    match phase {
        "init" => Some(profile.commands.init.clone()),
        "new" | "new_change" => Some(profile.commands.new_change.clone()),
        "continue" => Some(profile.commands.continue_phase.clone()),
        "apply" => Some(profile.commands.apply.clone()),
        "verify" => Some(profile.commands.verify.clone()),
        "archive" => Some(profile.commands.archive.clone()),
        _ => None,
    }
}

fn normalize_flow_phase(phase: &str) -> Option<String> {
    let normalized = phase.trim().to_lowercase().replace('-', "_");
    match normalized.as_str() {
        "init" => Some("init".to_string()),
        "new" | "new_change" => Some("new_change".to_string()),
        "continue" => Some("continue".to_string()),
        "apply" => Some("apply".to_string()),
        "verify" => Some("verify".to_string()),
        "archive" => Some("archive".to_string()),
        _ => None,
    }
}

fn parse_timeout_error(error: &Option<String>) -> bool {
    error
        .as_ref()
        .map(|value| value.to_lowercase().contains("timed out"))
        .unwrap_or(false)
}

fn build_sync_payload(
    worktree_path: &Path,
    profile: &OpenCodeProfile,
    status: &OpenCodeStatus,
) -> serde_json::Value {
    serde_json::json!({
        "schema": "groove-opencode-runtime",
        "version": 1,
        "generatedAt": now_iso(),
        "worktreePath": worktree_path.display().to_string(),
        "profile": profile,
        "diagnostics": {
            "agentTeamsLiteDir": status.agent_teams_lite_dir,
            "opencodeBinaryPath": status.opencode_binary_path,
            "requiredCommandsAvailable": status.required_commands_available,
            "missingCommands": status.missing_commands,
            "artifactStoreReady": status.artifact_store_ready,
            "engramBinaryAvailable": status.engram_binary_available,
            "engramOpencodeMcpConfigPresent": status.engram_opencode_mcp_config_present,
            "engramOpencodePluginPresent": status.engram_opencode_plugin_present,
            "engramOpencodeConfigPath": status.engram_opencode_config_path,
            "engramOpencodePluginPath": status.engram_opencode_plugin_path,
        }
    })
}

fn sync_opencode_config_runtime(worktree_path: &Path) -> Result<SyncResult, OpenCodeErrorDetail> {
    if !path_is_directory(worktree_path) {
        return Err(build_opencode_error(
            "ProfileInvalid",
            "Worktree path does not exist.",
            "Provide an existing absolute worktree path.",
            vec![worktree_path.display().to_string()],
        ));
    }

    let profile = read_or_default_opencode_profile(worktree_path).map_err(|error| {
        build_opencode_error(
            "ProfileInvalid",
            "OpenCode profile is invalid.",
            "Fix .groove/opencode-profile.json and retry sync.",
            vec![
                opencode_profile_path(worktree_path).display().to_string(),
                error,
            ],
        )
    })?;

    let status = check_opencode_status_runtime(worktree_path);
    let artifact_readiness =
        evaluate_artifact_store_readiness(worktree_path, &profile.artifact_store);

    let sync_payload = build_sync_payload(worktree_path, &profile, &status);
    let sync_body = serde_json::to_string_pretty(&sync_payload).map_err(|error| {
        build_opencode_error(
            "SyncFailed",
            "Failed to serialize OpenCode sync artifact.",
            "Retry sync after fixing local JSON serialization issues.",
            vec![error.to_string()],
        )
    })?;

    let groove_dir = ensure_groove_dir(worktree_path).map_err(|error| {
        build_opencode_error(
            "SyncFailed",
            "Failed to prepare .groove directory.",
            "Ensure worktree is writable.",
            vec![worktree_path.display().to_string(), error],
        )
    })?;
    let sync_path = groove_dir.join(OPEN_CODE_SYNC_FILE);

    let next_body = format!("{sync_body}\n");
    let existing_body = fs::read_to_string(&sync_path).ok();
    let changed = existing_body
        .as_deref()
        .map(|value| value != next_body)
        .unwrap_or(true);

    if changed {
        fs::write(&sync_path, &next_body).map_err(|error| {
            build_opencode_error(
                "SyncFailed",
                "Failed to write OpenCode sync artifact.",
                "Ensure .groove is writable and retry sync.",
                vec![sync_path.display().to_string(), error.to_string()],
            )
        })?;
    }

    Ok(SyncResult {
        ok: true,
        changed,
        profile_path: opencode_profile_path(worktree_path).display().to_string(),
        sync_artifact_path: sync_path.display().to_string(),
        warnings: artifact_readiness.all_messages(),
        message: if changed {
            if artifact_readiness.ready {
                "OpenCode config artifact synchronized.".to_string()
            } else {
                "OpenCode config artifact synchronized with warnings.".to_string()
            }
        } else {
            if artifact_readiness.ready {
                "OpenCode config artifact already up to date.".to_string()
            } else {
                "OpenCode config artifact already up to date (warnings present).".to_string()
            }
        },
    })
}

fn run_opencode_flow_runtime(
    worktree_path: &Path,
    phase: &str,
    args: &[String],
) -> OpenCodeRunResult {
    let run_id = Uuid::new_v4().to_string();
    let started = Instant::now();
    let normalized_phase = normalize_flow_phase(phase);

    let blocked = |error: OpenCodeErrorDetail| OpenCodeRunResult {
        run_id: run_id.clone(),
        phase: phase.to_string(),
        status: "blocked".to_string(),
        exit_code: None,
        duration_ms: started.elapsed().as_millis() as u64,
        summary: Some(error.message.clone()),
        stdout: String::new(),
        stderr: String::new(),
        error: Some(error),
    };

    if !path_is_directory(worktree_path) {
        return blocked(build_opencode_error(
            "ProfileInvalid",
            "Worktree path does not exist.",
            "Provide an existing absolute worktree path.",
            vec![worktree_path.display().to_string()],
        ));
    }

    let Ok(valid_worktree) = validate_git_worktree_path(&worktree_path.display().to_string())
    else {
        return blocked(build_opencode_error(
            "ProfileInvalid",
            "Worktree path must be a git worktree.",
            "Select a valid git worktree path before running OpenCode phases.",
            vec![worktree_path.display().to_string()],
        ));
    };

    let Some(normalized_phase) = normalized_phase else {
        return blocked(build_opencode_error(
            "ProfileInvalid",
            "Unknown OpenCode phase.",
            "Use one of init, new_change, continue, apply, verify, archive.",
            vec![phase.to_string()],
        ));
    };

    let profile = match read_or_default_opencode_profile(&valid_worktree) {
        Ok(profile) => profile,
        Err(error) => {
            return blocked(build_opencode_error(
                "ProfileInvalid",
                "OpenCode profile is invalid.",
                "Fix .groove/opencode-profile.json and retry.",
                vec![
                    opencode_profile_path(&valid_worktree).display().to_string(),
                    error,
                ],
            ));
        }
    };

    if !profile.enabled {
        return blocked(build_opencode_error(
            "ProfileInvalid",
            "OpenCode profile is disabled.",
            "Set enabled=true in .groove/opencode-profile.json.",
            vec![opencode_profile_path(&valid_worktree).display().to_string()],
        ));
    }

    let status = check_opencode_status_runtime(&valid_worktree);
    if !status.opencode_available {
        return blocked(build_opencode_error(
            "OpencodeMissing",
            "OpenCode binary is not available.",
            "Install opencode and ensure it is on PATH.",
            vec![valid_worktree.display().to_string()],
        ));
    }
    if !status.agent_teams_lite_available {
        if status.required_commands_available {
            // ATL directory is optional when required refs are already available.
        } else {
            return blocked(build_opencode_error(
                "AgentTeamsLiteMissing",
                "Agent Teams Lite is not available.",
                "Set AGENT_TEAMS_LITE_DIR or install agent-teams-lite locally.",
                vec![valid_worktree.display().to_string()],
            ));
        }
    }
    if !status.required_commands_available {
        return blocked(build_opencode_error(
            "AgentTeamsLiteMissing",
            "Required SDD command files are missing.",
            "Reinstall or update agent-teams-lite to include /sdd-* command assets.",
            vec![status
                .agent_teams_lite_dir
                .unwrap_or_else(|| valid_worktree.display().to_string())],
        ));
    }

    let artifact_readiness =
        evaluate_artifact_store_readiness(&valid_worktree, &profile.artifact_store);
    if !artifact_readiness.ready {
        return blocked(build_opencode_error(
            "ArtifactStoreUnavailable",
            "Configured artifact store is unavailable.",
            "Set ENGRAM_API_KEY (your Engram API token), configure ~/.config/engram, or add the key to ~/.groove/config.json or ~/.config/groove/config.json; ensure the `engram` binary is on PATH; otherwise switch artifactStore to none.",
            vec![valid_worktree.display().to_string()],
        ));
    }

    let Some(alias_command) = build_phase_alias(&profile, &normalized_phase) else {
        return blocked(build_opencode_error(
            "ProfileInvalid",
            "No alias command configured for phase.",
            "Update .groove/opencode-profile.json commands mapping.",
            vec![opencode_profile_path(&valid_worktree).display().to_string()],
        ));
    };

    let binary = status
        .opencode_binary_path
        .as_deref()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("opencode"));
    let mut command = Command::new(opencode_binary_to_string(&binary));
    command
        .current_dir(&valid_worktree)
        .arg(alias_command.clone());
    for arg in args {
        command.arg(arg);
    }

    if let Some(agent_teams_lite_dir) = status.agent_teams_lite_dir.as_deref() {
        command.env("AGENT_TEAMS_LITE_DIR", agent_teams_lite_dir);
    }

    if normalize_artifact_store(&profile.artifact_store) == "engram" {
        let has_env_key = std::env::var("ENGRAM_API_KEY")
            .ok()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false);
        if !has_env_key {
            if let Some(api_key) = resolve_engram_api_key_from_global_groove_config() {
                command.env("ENGRAM_API_KEY", api_key);
            }
        }
    }

    let timeout = Duration::from_secs(profile.timeouts.phase_seconds);
    let command_result = run_command_with_timeout(
        command,
        timeout,
        format!("Failed to execute OpenCode flow phase {}", normalized_phase),
        format!("OpenCode phase {}", normalized_phase),
    );

    let duration_ms = started.elapsed().as_millis() as u64;
    let timed_out = parse_timeout_error(&command_result.error);
    if timed_out {
        return OpenCodeRunResult {
            run_id,
            phase: normalized_phase,
            status: "timeout".to_string(),
            exit_code: command_result.exit_code,
            duration_ms,
            summary: Some(format!(
                "Phase timed out after {} seconds.",
                profile.timeouts.phase_seconds
            )),
            stdout: command_result.stdout,
            stderr: command_result.stderr,
            error: Some(build_opencode_error(
                "PhaseTimeout",
                "OpenCode phase timed out.",
                "Increase profile.timeouts.phaseSeconds or reduce flow scope.",
                vec![valid_worktree.display().to_string()],
            )),
        };
    }

    if let Some(error) = command_result.error {
        return OpenCodeRunResult {
            run_id,
            phase: normalized_phase,
            status: "failed".to_string(),
            exit_code: command_result.exit_code,
            duration_ms,
            summary: Some("OpenCode process failed to execute.".to_string()),
            stdout: command_result.stdout,
            stderr: command_result.stderr,
            error: Some(build_opencode_error(
                "SyncFailed",
                "OpenCode process execution failed.",
                "Review stderr and ensure opencode runtime dependencies are installed.",
                vec![error],
            )),
        };
    }

    if command_result.exit_code == Some(0) {
        return OpenCodeRunResult {
            run_id,
            phase: normalized_phase,
            status: if command_result.stderr.trim().is_empty() {
                "ok".to_string()
            } else {
                "warning".to_string()
            },
            exit_code: command_result.exit_code,
            duration_ms,
            summary: Some(format!(
                "Executed {} with {} arg(s).",
                alias_command,
                args.len()
            )),
            stdout: command_result.stdout,
            stderr: command_result.stderr,
            error: None,
        };
    }

    OpenCodeRunResult {
        run_id,
        phase: normalized_phase,
        status: "failed".to_string(),
        exit_code: command_result.exit_code,
        duration_ms,
        summary: Some("OpenCode phase exited with a non-zero code.".to_string()),
        stdout: command_result.stdout,
        stderr: command_result.stderr,
        error: Some(build_opencode_error(
            "SyncFailed",
            "OpenCode phase failed.",
            "Inspect stderr for flow-specific errors.",
            vec![valid_worktree.display().to_string()],
        )),
    }
}

#[cfg(test)]
mod opencode_runtime_tests {
    use super::*;

    #[test]
    fn extracts_nested_engram_api_key_from_global_config_json() {
        let parsed = serde_json::json!({
            "engram": {
                "api_key": " test-key "
            }
        });

        assert_eq!(
            extract_engram_api_key_from_global_groove_config_json(&parsed).as_deref(),
            Some("test-key")
        );
    }

    #[test]
    fn extracts_top_level_engram_api_key_fallback_from_global_config_json() {
        let parsed = serde_json::json!({
            "ENGRAM_API_KEY": " top-level-key "
        });

        assert_eq!(
            extract_engram_api_key_from_global_groove_config_json(&parsed).as_deref(),
            Some("top-level-key")
        );
    }

    #[test]
    fn normalizes_profile_aliases_and_defaults() {
        let profile = OpenCodeProfile {
            version: " ".to_string(),
            enabled: true,
            artifact_store: "unknown".to_string(),
            default_flow: " ".to_string(),
            commands: OpenCodeProfileCommands {
                init: "sdd-init".to_string(),
                new_change: " ".to_string(),
                continue_phase: "sdd-continue".to_string(),
                apply: "sdd-apply".to_string(),
                verify: "sdd-verify".to_string(),
                archive: "sdd-archive".to_string(),
            },
            timeouts: OpenCodeProfileTimeouts { phase_seconds: 2 },
            safety: OpenCodeProfileSafety {
                require_user_approval_between_phases: true,
                allow_parallel_spec_design: true,
            },
        };

        let normalized = normalize_opencode_profile(&profile);
        assert_eq!(normalized.version, "0.1.7");
        assert_eq!(normalized.artifact_store, "none");
        assert_eq!(normalized.default_flow, "sdd");
        assert_eq!(normalized.commands.init, "/sdd-init");
        assert_eq!(normalized.commands.new_change, "/sdd-new");
        assert_eq!(normalized.timeouts.phase_seconds, 30);
    }

    #[test]
    fn merges_profile_patch_without_losing_other_fields() {
        let profile = default_opencode_profile();
        let patch = OpenCodeProfilePatch {
            version: None,
            enabled: Some(false),
            artifact_store: Some("none".to_string()),
            default_flow: None,
            commands: Some(OpenCodeProfileCommandsPatch {
                init: None,
                new_change: Some("/custom-new".to_string()),
                continue_phase: None,
                apply: None,
                verify: None,
                archive: None,
            }),
            timeouts: Some(OpenCodeProfileTimeoutsPatch {
                phase_seconds: Some(1200),
            }),
            safety: None,
        };

        let merged = merge_opencode_profile_patch(&profile, &patch);
        assert!(!merged.enabled);
        assert_eq!(merged.artifact_store, "none");
        assert_eq!(merged.commands.new_change, "/custom-new");
        assert_eq!(merged.commands.init, "/sdd-init");
        assert_eq!(merged.timeouts.phase_seconds, 1200);
    }

    #[test]
    fn normalizes_phase_alias_mapping() {
        let profile = default_opencode_profile();
        assert_eq!(
            build_phase_alias(&profile, "new_change").as_deref(),
            Some("/sdd-new")
        );
        assert_eq!(normalize_flow_phase("NEW").as_deref(), Some("new_change"));
    }
}
