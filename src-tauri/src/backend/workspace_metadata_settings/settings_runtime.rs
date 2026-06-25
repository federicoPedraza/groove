fn default_worktree_symlink_paths() -> Vec<String> {
    DEFAULT_WORKTREE_SYMLINK_PATHS
        .iter()
        .map(|value| value.to_string())
        .collect()
}

fn default_opencode_settings() -> OpencodeSettings {
    OpencodeSettings {
        enabled: false,
        default_model: None,
        settings_directory: default_opencode_settings_directory(),
    }
}

fn default_opencode_settings_directory() -> String {
    "~/.config/opencode".to_string()
}

fn normalize_opencode_settings(settings: &OpencodeSettings) -> OpencodeSettings {
    let mut normalized = settings.clone();
    normalized.default_model = settings
        .default_model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());
    normalized.settings_directory = settings.settings_directory.trim().to_string();
    if normalized.settings_directory.is_empty() {
        normalized.settings_directory = default_opencode_settings_directory();
    }
    normalized
}

fn normalize_default_terminal(value: &str) -> Result<String, String> {
    workspace::normalize_default_terminal(value, &SUPPORTED_DEFAULT_TERMINALS)
}

fn normalize_theme_mode(value: &str) -> Result<String, String> {
    workspace::normalize_theme_mode(value, &SUPPORTED_THEME_MODES)
}

fn parse_terminal_command_tokens(command: &str) -> Result<Vec<String>, String> {
    terminal::parse_terminal_command_tokens(command)
}

fn parse_play_groove_command_tokens(command: &str) -> Result<Vec<String>, String> {
    terminal::parse_play_groove_command_tokens(command)
}

fn normalize_play_groove_command(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("playGrooveCommand must be a non-empty string.".to_string());
    }
    if is_groove_terminal_play_command(trimmed) {
        return Ok(trimmed.to_string());
    }
    parse_play_groove_command_tokens(trimmed)?;
    Ok(trimmed.to_string())
}

fn normalize_open_terminal_at_worktree_command(
    value: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(trimmed) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    if is_groove_terminal_open_command(trimmed) {
        return Ok(Some(trimmed.to_string()));
    }

    parse_terminal_command_tokens(trimmed)
        .map_err(|error| error.replace("terminalCustomCommand", "openTerminalAtWorktreeCommand"))?;

    Ok(Some(trimmed.to_string()))
}

fn normalize_worktree_symlink_paths(paths: &[String]) -> Vec<String> {
    workspace::normalize_worktree_symlink_paths(paths)
}

fn validate_worktree_symlink_paths(paths: &[String]) -> Result<Vec<String>, String> {
    workspace::validate_worktree_symlink_paths(paths)
}

fn resolve_play_groove_command(
    command_template: &str,
    target: &str,
    worktree_path: &Path,
) -> Result<(String, Vec<String>), String> {
    let tokens = parse_play_groove_command_tokens(command_template)?;
    let worktree = worktree_path.display().to_string();
    let escaped_worktree = shell_single_quote_escape(&worktree);
    let contains_worktree_placeholder = tokens
        .iter()
        .any(|token| token.contains("{worktree}") || token.contains("{worktree_escaped}"));
    let contains_target_placeholder = tokens.iter().any(|token| token.contains("{target}"));

    let mut resolved_tokens = tokens
        .into_iter()
        .map(|token| {
            token
                .replace("{worktree_escaped}", &escaped_worktree)
                .replace("{worktree}", &worktree)
                .replace("{target}", target)
        })
        .collect::<Vec<_>>();
    if !contains_worktree_placeholder && !contains_target_placeholder {
        resolved_tokens.push(target.to_string());
    }

    let Some((program, args)) = resolved_tokens.split_first() else {
        return Err("playGrooveCommand must include an executable command.".to_string());
    };

    Ok((program.to_string(), args.to_vec()))
}

fn shell_single_quote_escape(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }

    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn parse_custom_terminal_command(
    command: &str,
    worktree_path: &Path,
) -> Result<(String, Vec<String>), String> {
    let tokens = parse_terminal_command_tokens(command)?;
    let worktree = worktree_path.display().to_string();
    let contains_worktree_placeholder = tokens.iter().any(|token| token.contains("{worktree}"));

    let mut resolved_tokens = tokens
        .into_iter()
        .map(|token| token.replace("{worktree}", &worktree))
        .collect::<Vec<_>>();
    if !contains_worktree_placeholder {
        resolved_tokens.push(worktree);
    }

    let Some((program, args)) = resolved_tokens.split_first() else {
        return Err("terminalCustomCommand must include an executable command.".to_string());
    };

    Ok((program.to_string(), args.to_vec()))
}

fn run_command_with_timeout(
    mut command: Command,
    timeout: Duration,
    spawn_error_context: String,
    timeout_context: String,
) -> CommandResult {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return CommandResult {
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                error: Some(format!("{spawn_error_context}: {error}")),
            };
        }
    };

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                return match child.wait_with_output() {
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
                        error: Some(format!(
                            "Failed to collect command output for {timeout_context}: {error}"
                        )),
                    },
                };
            }
            Ok(None) => {
                if started.elapsed() >= timeout {
                    let _ = child.kill();
                    return match child.wait_with_output() {
                        Ok(output) => CommandResult {
                            exit_code: output.status.code(),
                            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                            error: Some(format!(
                                "Command {timeout_context} timed out after {} seconds and was terminated.",
                                timeout.as_secs()
                            )),
                        },
                        Err(error) => CommandResult {
                            exit_code: None,
                            stdout: String::new(),
                            stderr: String::new(),
                            error: Some(format!(
                                "Command {timeout_context} timed out after {} seconds and could not be reaped: {error}",
                                timeout.as_secs()
                            )),
                        },
                    };
                }

                thread::sleep(COMMAND_TIMEOUT_POLL_INTERVAL);
            }
            Err(error) => {
                return CommandResult {
                    exit_code: None,
                    stdout: String::new(),
                    stderr: String::new(),
                    error: Some(format!(
                        "Failed while waiting for {timeout_context}: {error}"
                    )),
                };
            }
        }
    }
}

fn spawn_terminal_process(
    binary: &str,
    args: &[String],
    cwd: &Path,
    worktree_path: &Path,
) -> Result<(), std::io::Error> {
    let mut command = Command::new(binary);
    command
        .args(args)
        .current_dir(cwd)
        .env("PWD", cwd.display().to_string())
        .env("GROOVE_WORKTREE", worktree_path.display().to_string());
    if let Some(path) = augmented_child_path() {
        command.env("PATH", path);
    }

    // Clean AppImage-injected environment variables so the child terminal uses
    // system libraries and paths instead of the FUSE-mounted AppImage ones.
    // Skip PATH — already handled by augmented_child_path() using PATH_ORIG.
    for (key, value) in crate::backend::common::platform_env::appimage_cleaned_env() {
        if key == "PATH" { continue; }
        match value {
            Some(restored) => { command.env(&key, restored); }
            None => { command.env_remove(&key); }
        }
    }

    command.spawn().map(|_| ())
}

fn launch_plain_terminal(
    worktree_path: &Path,
    default_terminal: &str,
    terminal_custom_command: Option<&str>,
) -> Result<String, String> {
    let worktree = worktree_path.display().to_string();

    if default_terminal == "custom" {
        let Some(custom_command) = terminal_custom_command
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            return Err(
                "Default terminal is set to custom, but terminalCustomCommand is empty."
                    .to_string(),
            );
        };

        let (program, args) = parse_custom_terminal_command(custom_command, worktree_path)?;
        spawn_terminal_process(&program, &args, worktree_path, worktree_path)
            .map_err(|error| format!("Failed to launch terminal command {program}: {error}"))?;

        let command = std::iter::once(program.as_str())
            .chain(args.iter().map(|value| value.as_str()))
            .collect::<Vec<_>>()
            .join(" ");
        return Ok(command);
    }

    let normalized_terminal = if default_terminal == "none" {
        "auto"
    } else {
        default_terminal
    };

    let mut candidates: Vec<(String, Vec<String>)> = match normalized_terminal {
        "ghostty" => vec![(
            "ghostty".to_string(),
            vec![format!("--working-directory={worktree}")],
        )],
        "warp" => vec![(
            "warp".to_string(),
            vec!["--working-directory".to_string(), worktree.clone()],
        )],
        "kitty" => vec![(
            "kitty".to_string(),
            vec!["--directory".to_string(), worktree.clone()],
        )],
        "alacritty" => vec![(
            "alacritty".to_string(),
            vec!["--working-directory".to_string(), worktree.clone()],
        )],
        "gnome" => vec![(
            "gnome-terminal".to_string(),
            vec![format!("--working-directory={worktree}")],
        )],
        "xterm" => vec![(
            "xterm".to_string(),
            vec!["-e".to_string(), format!("cd '{}' && exec \"$SHELL\"", worktree.replace('\'', "'\\''"))],
        )],
        "auto" => {
            let mut terminals = vec![
                // x-terminal-emulator is a Debian alternatives symlink; it
                // typically points to gnome-terminal which uses D-Bus and
                // ignores the parent process CWD. Pass --working-directory
                // so the shell opens in the right place.
                (
                    "x-terminal-emulator".to_string(),
                    vec![format!("--working-directory={worktree}")],
                ),
                (
                    "warp".to_string(),
                    vec!["--working-directory".to_string(), worktree.clone()],
                ),
                (
                    "kitty".to_string(),
                    vec!["--directory".to_string(), worktree.clone()],
                ),
                (
                    "gnome-terminal".to_string(),
                    vec![format!("--working-directory={worktree}")],
                ),
                (
                    "alacritty".to_string(),
                    vec!["--working-directory".to_string(), worktree.clone()],
                ),
                (
                    "ghostty".to_string(),
                    vec![format!("--working-directory={worktree}")],
                ),
                (
                    "xterm".to_string(),
                    vec!["-e".to_string(), format!("cd '{}' && exec \"$SHELL\"", worktree.replace('\'', "'\\''"))],
                ),
            ];
            if let Some(platform_terminal) =
                crate::backend::common::platform_env::platform_default_terminal_candidate(&worktree)
            {
                terminals.insert(0, platform_terminal);
            }
            terminals
        }
        _ => {
            return Err(format!(
                "Unsupported default terminal \"{default_terminal}\" for terminal launch."
            ))
        }
    };

    let mut launch_errors: Vec<String> = Vec::new();
    for (program, args) in candidates.drain(..) {
        match spawn_terminal_process(&program, &args, worktree_path, worktree_path) {
            Ok(()) => {
                let command = std::iter::once(program.as_str())
                    .chain(args.iter().map(|value| value.as_str()))
                    .collect::<Vec<_>>()
                    .join(" ");
                return Ok(command);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                launch_errors.push(format!("{program}: {error}"));
            }
        }
    }

    if launch_errors.is_empty() {
        Err("No supported terminal application was found to open this worktree.".to_string())
    } else {
        Err(format!(
            "Failed to open terminal for this worktree: {}",
            launch_errors.join(" | ")
        ))
    }
}

fn launch_open_terminal_at_worktree_command(
    worktree_path: &Path,
    workspace_meta: &WorkspaceMeta,
) -> Result<String, String> {
    if let Some(command_override) = workspace_meta
        .open_terminal_at_worktree_command
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if is_groove_terminal_open_command(command_override) {
            return launch_plain_terminal(
                worktree_path,
                &workspace_meta.default_terminal,
                workspace_meta.terminal_custom_command.as_deref(),
            );
        }

        let (program, args) = parse_custom_terminal_command(command_override, worktree_path)?;
        spawn_terminal_process(&program, &args, worktree_path, worktree_path)
            .map_err(|error| format!("Failed to launch terminal command {program}: {error}"))?;

        return Ok(std::iter::once(program.as_str())
            .chain(args.iter().map(|value| value.as_str()))
            .collect::<Vec<_>>()
            .join(" "));
    }

    launch_plain_terminal(
        worktree_path,
        &workspace_meta.default_terminal,
        workspace_meta.terminal_custom_command.as_deref(),
    )
}

fn is_restricted_worktree_symlink_path(path: &str) -> bool {
    workspace::is_restricted_worktree_symlink_path(path)
}

fn is_safe_path_token(value: &str) -> bool {
    workspace::is_safe_path_token(value)
}

fn is_valid_root_name(value: &str) -> bool {
    !value.trim().is_empty()
        && !value.contains('/')
        && !value.contains('\\')
        && value != "."
        && value != ".."
}

fn validate_known_worktrees(known_worktrees: &[String]) -> Result<Vec<String>, String> {
    workspace::validate_known_worktrees(known_worktrees)
}

fn validate_optional_relative_path(
    value: &Option<String>,
    label: &str,
) -> Result<Option<String>, String> {
    let Some(raw) = value else {
        return Ok(None);
    };

    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} must be a non-empty string when provided."));
    }

    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err(format!("{label} must be a relative path."));
    }

    for component in path.components() {
        if matches!(component, Component::ParentDir | Component::CurDir) {
            return Err(format!("{label} contains unsafe path segments."));
        }
    }

    Ok(Some(trimmed.to_string()))
}

/// 100-name library of short (3–6 char) creature-y bug names. Per-unit names
/// are drawn directly from this list on every roll — the previous per-workspace
/// pool of 10 was removed so any of the 100 can show up. Names that have been
/// rolled in a workspace are tracked in `WorkspaceMeta.known_bugs`.
/// Goldmines / Gems always render with their static names.
const BUG_NAME_LIBRARY: &[&str] = &[
    "Omen", "Kirla", "Mern", "Kez", "Vex", "Drix", "Nyx", "Skarn", "Glin", "Thrax",
    "Korv", "Brak", "Zerg", "Mok", "Quill", "Snar", "Yenn", "Drog", "Pip", "Hex",
    "Slag", "Wisp", "Glob", "Ymir", "Onyx", "Pesk", "Tovl", "Wend", "Squa", "Twil",
    "Glop", "Rune", "Krug", "Smel", "Voth", "Krat", "Bask", "Frot", "Glim", "Tarn",
    "Rin", "Soul", "Drex", "Vyne", "Wirm", "Yrex", "Zar", "Mox", "Lirn", "Vorm",
    "Ker", "Nub", "Jerk", "Quip", "Reek", "Krev", "Yez", "Pog", "Yob", "Yek",
    "Shun", "Spin", "Crux", "Daxx", "Nim", "Pirl", "Mirk", "Brel", "Korn", "Rax",
    "Zlin", "Trog", "Ruk", "Slik", "Bom", "Crun", "Dril", "Ekk", "Fop", "Gru",
    "Hak", "Imp", "Jux", "Lop", "Murn", "Olm", "Pez", "Quor", "Ral", "Shu",
    "Tym", "Urz", "Wob", "Xer", "Yarl", "Zob", "Brez", "Drak", "Klin", "Pyx",
];

const GOLDMINE_UNIT_NAME: &str = "Goldmine";
const GEMS_UNIT_NAME: &str = "Gems";

// Unit kind probabilities (must sum to 1.0).
const GEMS_UNIT_PROBABILITY: f64 = 0.05;
const GOLDMINE_UNIT_PROBABILITY: f64 = 0.20;

// Reward multipliers vs the bug (base) reward range.
const GOLDMINE_REWARD_MULTIPLIER: f64 = 1.5;
const GEMS_REWARD_MULTIPLIER: f64 = 3.0;

/// Picks one bug name uniformly from the static library.
fn pick_bug_name() -> String {
    use rand::seq::SliceRandom;
    let mut rng = rand::thread_rng();
    BUG_NAME_LIBRARY
        .choose(&mut rng)
        .map(|name| (*name).to_string())
        .unwrap_or_default()
}

/// Reward range for a given unit level. Levels are clamped to `1..=5`.
fn reward_range_for_level(level: u8) -> (u32, u32) {
    match level.clamp(1, 5) {
        1 => (0, 50),
        2 => (50, 120),
        3 => (100, 230),
        4 => (200, 400),
        5 => (500, 960),
        _ => (0, 0),
    }
}

/// Rolls a fresh `WorktreeUnit`. 20 % goldmine / 80 % bug, level uniform 1..=5,
/// reward uniform within the level's range; goldmines multiply the reward by
/// 1.5 (rounded). Bug names are drawn from the workspace's local pool;
/// goldmines always carry the name "Goldmine".
///
/// Currently only invoked from the test suite — production code paths no
/// longer auto-assign units; an explicit user action ("Discover") will wire
/// this up next.
#[allow(dead_code)]
fn roll_worktree_unit() -> WorktreeUnit {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let level: u8 = rng.gen_range(1u8..=5);
    roll_worktree_unit_with_level(level)
}

/// Rolls a `WorktreeUnit` with a fixed `level` (clamped to `1..=5`). Kind,
/// reward, and name are randomized:
///
/// - 5 % gems (3× base reward, named "Gems")
/// - 20 % goldmines (1.5× base reward, named "Goldmine")
/// - 75 % bugs (1× base reward, name drawn from the static 100-name library)
fn roll_worktree_unit_with_level(level: u8) -> WorktreeUnit {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let level = level.clamp(1, 5);
    let roll: f64 = rng.gen();
    let kind = if roll < GEMS_UNIT_PROBABILITY {
        WorktreeUnitKind::Gems
    } else if roll < GEMS_UNIT_PROBABILITY + GOLDMINE_UNIT_PROBABILITY {
        WorktreeUnitKind::Goldmine
    } else {
        WorktreeUnitKind::Bug
    };
    let (min, max) = reward_range_for_level(level);
    let base: u32 = rng.gen_range(min..=max);
    let reward = match kind {
        WorktreeUnitKind::Gems => ((base as f64) * GEMS_REWARD_MULTIPLIER).round() as u32,
        WorktreeUnitKind::Goldmine => {
            ((base as f64) * GOLDMINE_REWARD_MULTIPLIER).round() as u32
        }
        WorktreeUnitKind::Bug => base,
    };
    let name = match kind {
        WorktreeUnitKind::Gems => GEMS_UNIT_NAME.to_string(),
        WorktreeUnitKind::Goldmine => GOLDMINE_UNIT_NAME.to_string(),
        WorktreeUnitKind::Bug => pick_bug_name(),
    };
    // Loot is now rolled lazily by `loot_worktree` when the player triggers
    // the looting step — not at unit creation time. This keeps the bounty
    // (gold) and loot (items) decoupled.
    WorktreeUnit {
        kind,
        level,
        reward,
        name,
        rewarded: false,
        looted: false,
        loot: Vec::new(),
    }
}

// --- Loot rolling ----------------------------------------------------------
//
// Builds a per-roll candidate pool from the loot tables (see
// loot_tables.rs), weights candidates by rarity, and draws `n` items
// independently (duplicates allowed). Lives next to
// `roll_worktree_unit_with_level` so the unit and its loot are rolled
// in one shot and persist together on `WorktreeUnit.loot`.

const LOOT_BASE_WEIGHT_COMMON: u32 = 50;
const LOOT_BASE_WEIGHT_UNCOMMON: u32 = 25;
const LOOT_BASE_WEIGHT_RARE: u32 = 15;
const LOOT_BASE_WEIGHT_EPIC: u32 = 8;
const LOOT_BASE_WEIGHT_LEGENDARY: u32 = 2;

#[derive(Debug, Clone, Copy)]
struct LootRarityWeights {
    common: u32,
    uncommon: u32,
    rare: u32,
    epic: u32,
    legendary: u32,
}

impl LootRarityWeights {
    const fn base() -> Self {
        Self {
            common: LOOT_BASE_WEIGHT_COMMON,
            uncommon: LOOT_BASE_WEIGHT_UNCOMMON,
            rare: LOOT_BASE_WEIGHT_RARE,
            epic: LOOT_BASE_WEIGHT_EPIC,
            legendary: LOOT_BASE_WEIGHT_LEGENDARY,
        }
    }

    fn weight_for(&self, rarity: LootRarity) -> u32 {
        match rarity {
            LootRarity::Common => self.common,
            LootRarity::Uncommon => self.uncommon,
            LootRarity::Rare => self.rare,
            LootRarity::Epic => self.epic,
            LootRarity::Legendary => self.legendary,
        }
    }
}

fn loot_weights_for(kind: WorktreeUnitKind, level: u8) -> LootRarityWeights {
    let level = level.clamp(1, 5) as u32;
    // Higher level → small bump to rare/epic/legendary so level-5 fights
    // are the meaningful place to hunt iconics.
    let level_factor = level.saturating_sub(1); // 0..=4
    let mut w = LootRarityWeights::base();
    w.rare = w.rare.saturating_add(level_factor * 2);
    w.epic = w.epic.saturating_add(level_factor);
    w.legendary = w.legendary.saturating_add(level_factor / 2);

    match kind {
        WorktreeUnitKind::Bug => w,
        WorktreeUnitKind::Goldmine => LootRarityWeights {
            common: w.common,
            uncommon: w.uncommon,
            rare: w.rare,
            epic: ((w.epic as f64) * 1.5).round() as u32,
            legendary: w.legendary,
        },
        WorktreeUnitKind::Gems => LootRarityWeights {
            common: w.common,
            uncommon: w.uncommon,
            rare: w.rare.saturating_mul(2),
            epic: w.epic.saturating_mul(3),
            legendary: w.legendary.saturating_mul(4),
        },
    }
}

/// Per-roll loot count: uniform random in `0..=3`, ignoring kind and level.
/// "Sometimes a unit drops nothing" is intentional — the player only learns
/// the count when they open the looting modal.
fn loot_count_for<R: rand::Rng + ?Sized>(rng: &mut R) -> usize {
    rng.gen_range(0..=3)
}

fn build_loot_pool(kind: WorktreeUnitKind, bug_name: &str) -> Vec<LootEntry> {
    let mut pool: Vec<LootEntry> = Vec::new();
    pool.extend_from_slice(UNIVERSAL_ITEMS);

    match kind {
        WorktreeUnitKind::Bug => {
            if let Some(kingdom) = kingdom_for_bug_name(bug_name) {
                pool.extend_from_slice(kingdom.pool());
            }
            if let Some((iconic_id, iconic_rarity)) = iconic_for_bug_name(bug_name) {
                pool.push((iconic_id, iconic_rarity));
            }
        }
        WorktreeUnitKind::Goldmine | WorktreeUnitKind::Gems => {
            pool.extend_from_slice(VEILWOOD_ITEMS);
            pool.extend_from_slice(EMBERFORGE_ITEMS);
            pool.extend_from_slice(TIDEHOLLOW_ITEMS);
            pool.extend_from_slice(VOIDSPIRE_ITEMS);
        }
    }

    pool
}

fn pick_loot_entry(
    pool: &[LootEntry],
    weights: &LootRarityWeights,
    rng: &mut impl rand::Rng,
) -> Option<LootEntry> {
    let total: u64 = pool
        .iter()
        .map(|(_, rarity)| weights.weight_for(*rarity) as u64)
        .sum();
    if total == 0 {
        return None;
    }
    let mut roll: u64 = rng.gen_range(0..total);
    for entry in pool {
        let w = weights.weight_for(entry.1) as u64;
        if roll < w {
            return Some(*entry);
        }
        roll -= w;
    }
    pool.last().copied()
}

fn roll_loot(kind: WorktreeUnitKind, level: u8, bug_name: &str) -> Vec<WorktreeLootEntry> {
    let mut rng = rand::thread_rng();
    let pool = build_loot_pool(kind, bug_name);
    if pool.is_empty() {
        return Vec::new();
    }
    let weights = loot_weights_for(kind, level);
    let count = loot_count_for(&mut rng);
    let mut out = Vec::with_capacity(count);
    for _ in 0..count {
        if let Some((id, rarity)) = pick_loot_entry(&pool, &weights, &mut rng) {
            out.push(WorktreeLootEntry {
                item_id: id.to_string(),
                rarity: rarity.as_serde_str().to_string(),
            });
        }
    }
    out
}

/// Parses a Claude difficulty response into a level in `1..=5`.
///
/// Strategy: trim whitespace, find the first ASCII digit, clamp the resulting
/// value to `1..=5` (digit `0` → 1, digits `6..=9` → 5). When the response
/// contains no digit at all, fall back to **5** so a garbled response gives the
/// user the benefit of the doubt rather than a level-1 bounty.
fn parse_claude_difficulty(raw: &str) -> u8 {
    for ch in raw.trim().chars() {
        if let Some(digit) = ch.to_digit(10) {
            return (digit as u8).clamp(1, 5);
        }
    }
    5
}

/// Returns `(worktree_id, is_existing)` — `is_existing` is `true` when the
/// record already existed before this call.
fn register_worktree_record(
    workspace_root: &Path,
    worktree: &str,
) -> Result<(String, bool), String> {
    let (mut workspace_meta, _) = ensure_workspace_meta(workspace_root)?;
    if let Some(existing) = workspace_meta.worktree_records.get(worktree) {
        return Ok((existing.id.clone(), existing.claude_session_started));
    }

    let id = Uuid::new_v4().to_string();
    workspace_meta.worktree_records.insert(
        worktree.to_string(),
        WorktreeRecord {
            id: id.clone(),
            created_at: now_iso(),
            claude_session_started: false,
            state: default_worktree_state(),
            // Units are no longer rolled automatically on worktree creation;
            // they're assigned later by an explicit user action (e.g. the
            // "Discover" affordance in the bounty UI).
            unit: None,
            summaries: Vec::new(),
            comments: Vec::new(),
        },
    );
    workspace_meta.updated_at = now_iso();

    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    write_workspace_meta_file(&workspace_json, &workspace_meta)?;
    Ok((id, false))
}

fn mark_claude_session_started(workspace_root: &Path, worktree: &str) {
    let Ok((mut workspace_meta, _)) = ensure_workspace_meta(workspace_root) else {
        return;
    };
    if let Some(record) = workspace_meta.worktree_records.get_mut(worktree) {
        if record.claude_session_started {
            return;
        }
        record.claude_session_started = true;
        workspace_meta.updated_at = now_iso();
        let workspace_json = workspace_root.join(".groove").join("workspace.json");
        let _ = write_workspace_meta_file(&workspace_json, &workspace_meta);
    }
}

fn set_worktree_state(
    workspace_root: &Path,
    worktree: &str,
    state: WorktreeState,
) -> Result<WorktreeRecord, String> {
    let (mut workspace_meta, _) = ensure_workspace_meta(workspace_root)?;
    let record = workspace_meta
        .worktree_records
        .entry(worktree.to_string())
        .or_insert_with(|| WorktreeRecord {
            id: Uuid::new_v4().to_string(),
            created_at: now_iso(),
            claude_session_started: false,
            state: default_worktree_state(),
            // Don't auto-roll a unit when a record is created via state
            // mutation; it stays `None` until something explicitly assigns it.
            unit: None,
            summaries: Vec::new(),
            comments: Vec::new(),
        });
    record.state = state;
    let updated = record.clone();
    workspace_meta.updated_at = now_iso();
    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    write_workspace_meta_file(&workspace_json, &workspace_meta)?;
    Ok(updated)
}

/// Claims the gold bounty for a defeated worktree: bumps `meta.gold` by the
/// unit's reward and marks `unit.rewarded = true`. **Loot is not touched
/// here** — the player must run `loot_worktree` separately to roll and
/// collect items.
///
/// Returns `(updated_record, total_gold)`.
fn claim_worktree_reward(
    workspace_root: &Path,
    worktree: &str,
) -> Result<(WorktreeRecord, u64), String> {
    let (mut workspace_meta, _) = ensure_workspace_meta(workspace_root)?;
    let record = workspace_meta
        .worktree_records
        .get_mut(worktree)
        .ok_or_else(|| format!("Worktree {worktree} has no record."))?;
    if record.state != WorktreeState::Defeated {
        return Err(format!(
            "Worktree {worktree} must be defeated before claiming a reward."
        ));
    }
    let unit = record
        .unit
        .as_mut()
        .ok_or_else(|| format!("Worktree {worktree} has no unit to reward."))?;
    if unit.rewarded {
        return Err(format!("Worktree {worktree} reward has already been claimed."));
    }
    unit.rewarded = true;
    let reward = unit.reward;
    let updated_record = record.clone();

    workspace_meta.gold = workspace_meta.gold.saturating_add(reward as u64);
    let total_gold = workspace_meta.gold;
    workspace_meta.updated_at = now_iso();

    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    write_workspace_meta_file(&workspace_json, &workspace_meta)?;
    Ok((updated_record, total_gold))
}

/// Loots a defeated worktree: rolls `unit.loot` lazily (0..=3 items),
/// deposits each into `meta.inventory`, and marks `unit.looted = true`.
/// Idempotent in the sense that a second call once `looted = true` is
/// rejected with an error — this prevents double-deposits.
///
/// Returns `(updated_record, rolled_loot, inventory_snapshot)`.
fn loot_worktree(
    workspace_root: &Path,
    worktree: &str,
) -> Result<(WorktreeRecord, Vec<WorktreeLootEntry>, HashMap<String, u32>), String> {
    let (mut workspace_meta, _) = ensure_workspace_meta(workspace_root)?;
    let record = workspace_meta
        .worktree_records
        .get_mut(worktree)
        .ok_or_else(|| format!("Worktree {worktree} has no record."))?;
    if record.state != WorktreeState::Defeated {
        return Err(format!(
            "Worktree {worktree} must be defeated before looting."
        ));
    }
    let unit = record
        .unit
        .as_mut()
        .ok_or_else(|| format!("Worktree {worktree} has no unit to loot."))?;
    if unit.looted {
        return Err(format!("Worktree {worktree} loot has already been collected."));
    }

    // Roll lazily on first looting. If a legacy unit already had loot
    // pre-rolled (old save files from before the split), respect it
    // instead of re-rolling.
    if unit.loot.is_empty() {
        unit.loot = roll_loot(unit.kind, unit.level, &unit.name);
    }
    unit.looted = true;
    let rolled_loot = unit.loot.clone();
    let updated_record = record.clone();

    for entry in &rolled_loot {
        let counter = workspace_meta
            .inventory
            .entry(entry.item_id.clone())
            .or_insert(0);
        *counter = counter.saturating_add(1);
    }
    let inventory_snapshot = workspace_meta.inventory.clone();
    workspace_meta.updated_at = now_iso();

    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    write_workspace_meta_file(&workspace_json, &workspace_meta)?;
    Ok((updated_record, rolled_loot, inventory_snapshot))
}

/// Walks every directory under `<scan_root>/.worktrees/` and seeds a default
/// `WorktreeRecord` in `workspace.json` for any worktree that lacks one.
/// Existing records are left untouched. Persists once at the end (or skips the
/// write entirely when nothing changed). Returns the number of records added.
///
/// Why: `register_worktree_record` only seeds the worktree being created, so a
/// workspace that contains pre-existing on-disk worktrees (created outside
/// Groove or before this codepath existed) ends up with rows the UI shows but
/// no persisted memory. Running this after every `groove new` makes
/// `worktree_records` an authoritative ledger of all directories under
/// `.worktrees/`, so per-worktree state/units/summaries survive even an
/// external `rm -rf .worktrees/`.
fn sync_worktree_records_with_disk(
    workspace_root: &Path,
    scan_root: &Path,
) -> Result<usize, String> {
    let worktrees_dir = scan_root.join(".worktrees");
    if !path_is_directory(&worktrees_dir) {
        return Ok(0);
    }

    let (mut workspace_meta, _) = ensure_workspace_meta(workspace_root)?;
    let entries = fs::read_dir(&worktrees_dir)
        .map_err(|error| format!("Failed to read {}: {error}", worktrees_dir.display()))?;

    let mut added = 0usize;
    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "Failed to enumerate {} entries: {error}",
                worktrees_dir.display()
            )
        })?;
        let path = entry.path();
        if !path_is_directory(&path) {
            continue;
        }
        let Some(worktree_os_name) = path.file_name() else {
            continue;
        };
        let worktree = worktree_os_name.to_string_lossy().to_string();
        if workspace_meta.worktree_records.contains_key(&worktree) {
            continue;
        }
        workspace_meta.worktree_records.insert(
            worktree,
            WorktreeRecord {
                id: Uuid::new_v4().to_string(),
                created_at: now_iso(),
                claude_session_started: false,
                state: default_worktree_state(),
                unit: None,
                summaries: Vec::new(),
                comments: Vec::new(),
            },
        );
        added += 1;
    }

    if added == 0 {
        return Ok(0);
    }

    workspace_meta.updated_at = now_iso();
    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    write_workspace_meta_file(&workspace_json, &workspace_meta)?;
    Ok(added)
}

fn normalize_browse_relative_path(value: Option<&str>) -> Result<String, String> {
    workspace::normalize_browse_relative_path(value)
}

fn path_is_directory(path: &Path) -> bool {
    path.is_dir()
}

fn path_is_file(path: &Path) -> bool {
    path.is_file()
}

fn build_likely_search_bases() -> Vec<PathBuf> {
    let mut bases = Vec::new();
    let mut seen = HashSet::new();

    let mut push_unique = |path: PathBuf| {
        if seen.insert(path.clone()) {
            bases.push(path);
        }
    };

    // In an AppImage, current_dir() may point inside the FUSE mount
    // (/tmp/.mount_GrooveXXX/) which is useless for workspace discovery.
    // Use $OWD (Original Working Directory saved by AppImage) instead.
    let real_cwd = std::env::var_os("OWD")
        .map(PathBuf::from)
        .or_else(|| std::env::current_dir().ok())
        .filter(|p| {
            // Reject paths inside AppImage FUSE mount or /tmp/.mount_*
            let s = p.to_string_lossy();
            !s.starts_with("/tmp/.mount_") && std::env::var_os("APPDIR")
                .map(|appdir| !s.starts_with(&*appdir.to_string_lossy()))
                .unwrap_or(true)
        });

    if let Some(mut cursor) = real_cwd {
        for _ in 0..=3 {
            push_unique(cursor.clone());

            let Some(parent) = cursor.parent() else {
                break;
            };

            if parent == cursor {
                break;
            }

            cursor = parent.to_path_buf();
        }
    }

    // Home directory — reliable in both dev and production
    if let Some(home) = dirs_home() {
        push_unique(home.clone());

        // Common development directories under $HOME
        for subdir in &["Documents", "Projects", "repos", "src", "dev", "code", "workspace", "workspaces", "git"] {
            let candidate = home.join(subdir);
            if candidate.is_dir() {
                push_unique(candidate);
            }
        }
    }

    // XDG user directories (e.g. ~/Desktop, ~/Downloads — less likely but cheap)
    if let Ok(dirs) = std::env::var("XDG_DATA_HOME") {
        let xdg_base = PathBuf::from(dirs);
        if xdg_base.is_dir() {
            push_unique(xdg_base);
        }
    }

    bases
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
}

fn now_iso() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn workspace_root_storage_key(workspace_root: &Path) -> String {
    workspace_root
        .canonicalize()
        .unwrap_or_else(|_| workspace_root.to_path_buf())
        .display()
        .to_string()
}

fn branch_guess_from_worktree_name(worktree: &str) -> String {
    worktree.replace('_', "/")
}

fn workspace_state_file(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;
    Ok(app_data_dir.join("active-workspace.json"))
}

fn default_global_settings() -> GlobalSettings {
    GlobalSettings {
        telemetry_enabled: true,
        disable_groove_business: false,
        hide_mascot: false,
        hide_labels: false,
        show_fps: false,
        always_show_diagnostics_sidebar: false,
        periodic_rerender_enabled: false,
        theme_mode: default_theme_mode(),
        keyboard_shortcut_leader: default_keyboard_shortcut_leader(),
        keyboard_leader_bindings: default_keyboard_leader_bindings(),
        opencode_settings: default_opencode_settings(),
        sound_library: Vec::new(),
        claude_code_sound_settings: ClaudeCodeSoundSettings::default(),
        groove_sound_settings: GrooveSoundSettings::default(),
    }
}

fn normalize_shortcut_key(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.eq_ignore_ascii_case("space") {
        return "Space".to_string();
    }

    if trimmed.len() == 1 {
        let normalized = trimmed.to_ascii_lowercase();
        if normalized
            .chars()
            .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit())
        {
            return normalized;
        }
    }

    fallback.to_string()
}

fn normalize_keyboard_leader_bindings(value: &HashMap<String, String>) -> HashMap<String, String> {
    let mut normalized = default_keyboard_leader_bindings();
    for (command_id, default_value) in default_keyboard_leader_bindings() {
        if let Some(candidate_value) = value.get(&command_id) {
            normalized.insert(
                command_id,
                normalize_shortcut_key(candidate_value, &default_value),
            );
        }
    }
    normalized
}

fn play_groove_command_for_workspace(workspace_root: &Path) -> String {
    ensure_workspace_meta(workspace_root)
        .map(|(workspace_meta, _)| {
            normalize_play_groove_command(&workspace_meta.play_groove_command)
                .unwrap_or_else(|_| default_play_groove_command())
        })
        .unwrap_or_else(|_| default_play_groove_command())
}

fn worktree_symlink_paths_for_workspace(workspace_root: &Path) -> Vec<String> {
    ensure_workspace_meta(workspace_root)
        .map(|(workspace_meta, _)| {
            normalize_worktree_symlink_paths(&workspace_meta.worktree_symlink_paths)
        })
        .unwrap_or_else(|_| default_worktree_symlink_paths())
}

fn create_symlink(source: &Path, destination: &Path) -> Result<(), std::io::Error> {
    crate::backend::common::platform_env::create_symlink(source, destination)
}

fn make_groove_hook(action: &str, worktree_name: &str, message: &str) -> serde_json::Value {
    let command = format!(
        "$HOME/.local/bin/groove notify {} {} -m \"{}\"",
        action, worktree_name, message
    );
    serde_json::json!([
        {
            "matcher": "",
            "hooks": [
                {
                    "type": "command",
                    "command": command
                }
            ]
        }
    ])
}

fn ensure_claude_hooks(worktree_path: &Path, worktree_name: &str) {
    let claude_dir = worktree_path.join(".claude");
    if fs::create_dir_all(&claude_dir).is_err() {
        return;
    }

    let settings_path = claude_dir.join("settings.local.json");
    let mut settings: serde_json::Value = if settings_path.exists() {
        fs::read_to_string(&settings_path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    if let Some(obj) = settings.as_object_mut() {
        // Auto-approve this project's .mcp.json servers so a freshly-played
        // Claude Code session boots straight to its prompt instead of stopping
        // on the "New MCP server found" trust modal — which would otherwise
        // steal focus and swallow an injected first prompt.
        obj.insert(
            "enableAllProjectMcpServers".to_string(),
            serde_json::Value::Bool(true),
        );
        let hooks = obj.entry("hooks").or_insert(serde_json::json!({}));
        if let Some(hooks_obj) = hooks.as_object_mut() {
            hooks_obj.insert(
                "Notification".to_string(),
                make_groove_hook("notification", worktree_name, "Claude Code needs your attention"),
            );
            hooks_obj.insert(
                "Stop".to_string(),
                make_groove_hook("stop", worktree_name, "Claude Code finished"),
            );
        }
    }

    if let Ok(body) = serde_json::to_string_pretty(&settings) {
        let _ = fs::write(&settings_path, body);
    }
}

fn apply_configured_worktree_symlinks(workspace_root: &Path, worktree_path: &Path) -> Vec<String> {
    let mut warnings = Vec::new();
    let configured_paths = worktree_symlink_paths_for_workspace(workspace_root);

    for relative_path in configured_paths {
        if is_restricted_worktree_symlink_path(&relative_path) {
            warnings.push(format!(
                "Skipped restricted symlink path \"{}\".",
                relative_path
            ));
            continue;
        }

        let source_path = workspace_root.join(&relative_path);
        if !source_path.exists() {
            continue;
        }

        let destination_path = worktree_path.join(&relative_path);
        if destination_path == source_path || destination_path.starts_with(&source_path) {
            warnings.push(format!(
                "Skipped symlink \"{}\" because it would create a recursive or self-referential link.",
                relative_path
            ));
            continue;
        }

        if destination_path.exists() || fs::symlink_metadata(&destination_path).is_ok() {
            continue;
        }

        if let Some(parent) = destination_path.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                warnings.push(format!(
                    "Could not prepare destination for symlink \"{}\": {error}",
                    relative_path
                ));
                continue;
            }
        }

        if let Err(error) = create_symlink(&source_path, &destination_path) {
            warnings.push(format!(
                "Could not symlink \"{}\" into worktree: {error}",
                relative_path
            ));
        }
    }

    warnings
}

fn global_settings_file(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;
    Ok(app_data_dir.join("global-settings.json"))
}

fn write_global_settings_file(path: &Path, global_settings: &GlobalSettings) -> Result<(), String> {
    let body = serde_json::to_string_pretty(global_settings)
        .map_err(|error| format!("Failed to serialize global settings: {error}"))?;
    fs::write(path, format!("{body}\n"))
        .map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

fn seed_global_settings_from_active_workspace(app: &AppHandle, settings: &mut GlobalSettings) {
    let Some(persisted_root) = read_persisted_active_workspace_root(app).ok().flatten() else {
        return;
    };
    let Ok(workspace_root) = validate_workspace_root_path(&persisted_root) else {
        return;
    };
    let workspace_json = workspace_root.join(".groove").join("workspace.json");
    if !path_is_file(&workspace_json) {
        return;
    }

    if let Ok(workspace_meta) = read_workspace_meta_file(&workspace_json) {
        settings.telemetry_enabled = workspace_meta.telemetry_enabled;
        settings.disable_groove_business = workspace_meta.disable_groove_business;
        settings.hide_mascot = workspace_meta.hide_mascot;
        settings.hide_labels = workspace_meta.hide_labels;
        settings.show_fps = workspace_meta.show_fps;
    }
}

fn ensure_global_settings(app: &AppHandle) -> Result<GlobalSettings, String> {
    let settings_file = global_settings_file(app)?;
    if !path_is_file(&settings_file) {
        let mut settings = default_global_settings();
        seed_global_settings_from_active_workspace(app, &mut settings);
        write_global_settings_file(&settings_file, &settings)?;
        return Ok(settings);
    }

    let raw = fs::read_to_string(&settings_file)
        .map_err(|error| format!("Failed to read {}: {error}", settings_file.display()))?;
    let parsed = serde_json::from_str::<serde_json::Value>(&raw).map_err(|_| {
        let settings = default_global_settings();
        let _ = write_global_settings_file(&settings_file, &settings);
        format!(
            "Failed to parse {}. Recovered with defaults.",
            settings_file.display()
        )
    });

    let parsed = match parsed {
        Ok(value) => value,
        Err(_) => {
            return Ok(default_global_settings());
        }
    };

    let mut settings = match serde_json::from_value::<GlobalSettings>(parsed.clone()) {
        Ok(value) => value,
        Err(_) => {
            let settings = default_global_settings();
            let _ = write_global_settings_file(&settings_file, &settings);
            return Ok(settings);
        }
    };

    let mut should_write_back = parsed
        .as_object()
        .map(|obj| {
            !obj.contains_key("telemetryEnabled")
                || !(obj.contains_key("disableGrooveBusiness")
                    || obj.contains_key("disableGrooveLoadingSection"))
                || !obj.contains_key("showFps")
                || !obj.contains_key("alwaysShowDiagnosticsSidebar")
                || !obj.contains_key("periodicRerenderEnabled")
                || !obj.contains_key("themeMode")
                || !obj.contains_key("keyboardShortcutLeader")
                || !obj.contains_key("keyboardLeaderBindings")
                || !obj.contains_key("opencodeSettings")
                || !obj.contains_key("soundLibrary")
                || !obj.contains_key("claudeCodeSoundSettings")
        })
        .unwrap_or(true);

    let normalized_leader = normalize_shortcut_key(
        &settings.keyboard_shortcut_leader,
        &default_keyboard_shortcut_leader(),
    );
    if normalized_leader != settings.keyboard_shortcut_leader {
        settings.keyboard_shortcut_leader = normalized_leader;
        should_write_back = true;
    }

    let normalized_bindings =
        normalize_keyboard_leader_bindings(&settings.keyboard_leader_bindings);
    if normalized_bindings != settings.keyboard_leader_bindings {
        settings.keyboard_leader_bindings = normalized_bindings;
        should_write_back = true;
    }

    if let Ok(normalized_theme_mode) = normalize_theme_mode(&settings.theme_mode) {
        if normalized_theme_mode != settings.theme_mode {
            settings.theme_mode = normalized_theme_mode;
            should_write_back = true;
        }
    } else {
        settings.theme_mode = default_theme_mode();
        should_write_back = true;
    }

    let normalized_opencode_settings = normalize_opencode_settings(&settings.opencode_settings);
    if normalized_opencode_settings.enabled != settings.opencode_settings.enabled
        || normalized_opencode_settings.default_model != settings.opencode_settings.default_model
        || normalized_opencode_settings.settings_directory
            != settings.opencode_settings.settings_directory
    {
        settings.opencode_settings = normalized_opencode_settings;
        should_write_back = true;
    }

    if should_write_back {
        write_global_settings_file(&settings_file, &settings)?;
    }

    Ok(settings)
}

fn read_persisted_active_workspace_root(app: &AppHandle) -> Result<Option<String>, String> {
    let state_file = workspace_state_file(app)?;
    if !path_is_file(&state_file) {
        return Ok(None);
    }

    let raw = fs::read_to_string(&state_file)
        .map_err(|error| format!("Failed to read workspace state file: {error}"))?;
    let parsed = serde_json::from_str::<serde_json::Value>(&raw)
        .map_err(|error| format!("Failed to parse workspace state file: {error}"))?;

    let workspace_root = parsed
        .as_object()
        .and_then(|obj| obj.get("workspaceRoot"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    Ok(workspace_root)
}

fn persist_active_workspace_root(app: &AppHandle, workspace_root: &Path) -> Result<(), String> {
    let state_file = workspace_state_file(app)?;
    let payload = serde_json::json!({
        "workspaceRoot": workspace_root.display().to_string(),
        "updatedAt": now_iso(),
    });

    let body = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Failed to serialize workspace state file: {error}"))?;
    fs::write(&state_file, format!("{body}\n"))
        .map_err(|error| format!("Failed to write workspace state file: {error}"))
}

fn clear_persisted_active_workspace_root(app: &AppHandle) -> Result<(), String> {
    let state_file = workspace_state_file(app)?;
    if state_file.exists() {
        fs::remove_file(&state_file)
            .map_err(|error| format!("Failed to clear workspace state file: {error}"))?;
    }

    Ok(())
}

fn worktree_execution_state_file(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;
    Ok(app_data_dir.join("worktree-executions.json"))
}

fn read_persisted_worktree_execution_state(
    app: &AppHandle,
) -> Result<PersistedWorktreeExecutionState, String> {
    let state_file = worktree_execution_state_file(app)?;
    if !path_is_file(&state_file) {
        return Ok(PersistedWorktreeExecutionState::default());
    }

    let raw = fs::read_to_string(&state_file)
        .map_err(|error| format!("Failed to read worktree execution state file: {error}"))?;
    serde_json::from_str::<PersistedWorktreeExecutionState>(&raw)
        .map_err(|error| format!("Failed to parse worktree execution state file: {error}"))
}

fn write_persisted_worktree_execution_state(
    app: &AppHandle,
    state: &PersistedWorktreeExecutionState,
) -> Result<(), String> {
    let state_file = worktree_execution_state_file(app)?;
    let body = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Failed to serialize worktree execution state file: {error}"))?;
    fs::write(&state_file, format!("{body}\n"))
        .map_err(|error| format!("Failed to write worktree execution state file: {error}"))
}

fn record_worktree_last_executed_at(
    app: &AppHandle,
    workspace_root: &Path,
    worktree: &str,
) -> Result<(), String> {
    let mut state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    state
        .last_executed_at_by_workspace
        .entry(workspace_key)
        .or_default()
        .insert(worktree.to_string(), now_iso());
    write_persisted_worktree_execution_state(app, &state)
}

fn record_worktree_tombstone(
    app: &AppHandle,
    workspace_root: &Path,
    worktree: &str,
    worktree_path: &Path,
    branch_name: Option<String>,
) -> Result<(), String> {
    let mut state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    state
        .tombstones_by_workspace
        .entry(workspace_key)
        .or_default()
        .insert(
            worktree.to_string(),
            WorktreeTombstone {
                workspace_root: workspace_root.display().to_string(),
                worktree: worktree.to_string(),
                worktree_path: worktree_path.display().to_string(),
                branch_name,
                deleted_at: now_iso(),
            },
        );
    write_persisted_worktree_execution_state(app, &state)
}

fn clear_worktree_tombstone(
    app: &AppHandle,
    workspace_root: &Path,
    worktree: &str,
) -> Result<(), String> {
    let mut state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    let mut changed = false;
    let mut workspace_tombstones_empty = false;

    if let Some(workspace_tombstones) = state.tombstones_by_workspace.get_mut(&workspace_key) {
        if workspace_tombstones.remove(worktree).is_some() {
            changed = true;
        }
        workspace_tombstones_empty = workspace_tombstones.is_empty();
    }

    if workspace_tombstones_empty {
        state.tombstones_by_workspace.remove(&workspace_key);
        changed = true;
    }

    if changed {
        write_persisted_worktree_execution_state(app, &state)?;
    }

    Ok(())
}

fn clear_worktree_last_executed_at(
    app: &AppHandle,
    workspace_root: &Path,
    worktree: &str,
) -> Result<(), String> {
    let mut state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    let mut changed = false;
    let mut workspace_entries_empty = false;

    if let Some(workspace_entries) = state.last_executed_at_by_workspace.get_mut(&workspace_key) {
        if workspace_entries.remove(worktree).is_some() {
            changed = true;
        }
        workspace_entries_empty = workspace_entries.is_empty();
    }

    if workspace_entries_empty {
        state.last_executed_at_by_workspace.remove(&workspace_key);
        changed = true;
    }

    if changed {
        write_persisted_worktree_execution_state(app, &state)?;
    }

    Ok(())
}

fn read_worktree_tombstone(
    app: &AppHandle,
    workspace_root: &Path,
    worktree: &str,
) -> Result<Option<WorktreeTombstone>, String> {
    let state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    Ok(state
        .tombstones_by_workspace
        .get(&workspace_key)
        .and_then(|workspace_tombstones| workspace_tombstones.get(worktree))
        .cloned())
}

fn record_running_groove(app: &AppHandle, record: &RunningGrooveRecord) -> Result<(), String> {
    let mut state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(Path::new(&record.workspace_root));
    state
        .running_by_workspace
        .entry(workspace_key)
        .or_default()
        .insert(record.worktree.clone(), record.clone());
    write_persisted_worktree_execution_state(app, &state)
}

fn clear_running_groove(
    app: &AppHandle,
    workspace_root: &Path,
    worktree: &str,
) -> Result<(), String> {
    let mut state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    let mut changed = false;
    let mut workspace_running_empty = false;

    if let Some(workspace_running) = state.running_by_workspace.get_mut(&workspace_key) {
        if workspace_running.remove(worktree).is_some() {
            changed = true;
        }
        workspace_running_empty = workspace_running.is_empty();
    }

    if workspace_running_empty {
        state.running_by_workspace.remove(&workspace_key);
        changed = true;
    }

    if changed {
        write_persisted_worktree_execution_state(app, &state)?;
    }

    Ok(())
}

/// Clears the running record for a worktree only if it was created by the given
/// session. This keeps a still-open manual terminal (a different session) from
/// clearing a play record, and is a safe no-op when nothing is recorded.
fn clear_running_groove_if_session_matches(
    app: &AppHandle,
    workspace_root: &Path,
    worktree: &str,
    session_id: &str,
) -> Result<(), String> {
    let mut state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    let mut changed = false;
    let mut workspace_running_empty = false;

    if let Some(workspace_running) = state.running_by_workspace.get_mut(&workspace_key) {
        let matches = workspace_running
            .get(worktree)
            .map(|record| record.session_id == session_id)
            .unwrap_or(false);
        if matches {
            workspace_running.remove(worktree);
            changed = true;
        }
        workspace_running_empty = workspace_running.is_empty();
    }

    if changed && workspace_running_empty {
        state.running_by_workspace.remove(&workspace_key);
    }

    if changed {
        write_persisted_worktree_execution_state(app, &state)?;
    }

    Ok(())
}

fn read_running_grooves(
    app: &AppHandle,
    workspace_root: &Path,
) -> Result<Vec<RunningGrooveRecord>, String> {
    let state = read_persisted_worktree_execution_state(app)?;
    let workspace_key = workspace_root_storage_key(workspace_root);
    Ok(state
        .running_by_workspace
        .get(&workspace_key)
        .map(|workspace_running| workspace_running.values().cloned().collect())
        .unwrap_or_default())
}

fn effective_workspace_root(workspace_root: &Path, workspace_meta: &WorkspaceMeta) -> PathBuf {
    let Some(root_directory) = workspace_meta
        .root_directory
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    else {
        return workspace_root.to_path_buf();
    };

    let candidate = workspace_root.join(root_directory);
    if path_is_directory(&candidate) {
        candidate
    } else {
        workspace_root.to_path_buf()
    }
}

fn validate_root_directory_value(value: &str) -> Result<Option<String>, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let candidate = Path::new(trimmed);
    if candidate.is_absolute() {
        return Err("rootDirectory must be a path relative to the workspace root.".to_string());
    }

    let mut normalized = PathBuf::new();
    for component in candidate.components() {
        match component {
            std::path::Component::Normal(part) => normalized.push(part),
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir
            | std::path::Component::RootDir
            | std::path::Component::Prefix(_) => {
                return Err("rootDirectory must not traverse outside the workspace root.".to_string());
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        return Ok(None);
    }

    Ok(Some(normalized.to_string_lossy().replace('\\', "/")))
}

fn default_workspace_meta(workspace_root: &Path) -> WorkspaceMeta {
    let now = now_iso();
    WorkspaceMeta {
        version: 1,
        root_name: workspace_root
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| workspace_root.display().to_string()),
        created_at: now.clone(),
        updated_at: now,
        default_terminal: default_terminal_auto(),
        terminal_custom_command: None,
        telemetry_enabled: true,
        disable_groove_business: false,
        hide_mascot: false,
        hide_labels: false,
        show_fps: false,
        play_groove_command: default_play_groove_command(),
        open_terminal_at_worktree_command: None,
        worktree_symlink_paths: default_worktree_symlink_paths(),
        opencode_settings: default_opencode_settings(),
        worktree_records: HashMap::new(),
        summaries: Vec::new(),
        onboarding_symlinks_configured: false,
        onboarding_commands_configured: false,
        root_directory: None,
        gold: 0,
        defeated_count: 0,
        known_bugs: Vec::new(),
        inventory: HashMap::new(),
    }
}

fn telemetry_enabled_for_app(app: &AppHandle) -> bool {
    ensure_global_settings(app)
        .map(|settings| settings.telemetry_enabled)
        .unwrap_or(true)
}

fn read_workspace_meta_file(path: &Path) -> Result<WorkspaceMeta, String> {
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    serde_json::from_str::<WorkspaceMeta>(&raw)
        .map_err(|error| format!("Failed to parse {}: {error}", path.display()))
}

fn write_workspace_meta_file(path: &Path, workspace_meta: &WorkspaceMeta) -> Result<(), String> {
    let body = serde_json::to_string_pretty(workspace_meta)
        .map_err(|error| format!("Failed to serialize workspace metadata: {error}"))?;
    let payload = format!("{body}\n");

    // Atomic write: write to a sibling temp file and rename into place. POSIX
    // and Windows both guarantee that an existing file is replaced atomically
    // by `rename`. Without this, an interrupted `fs::write` (crash, signal,
    // OOM) leaves a truncated workspace.json that the next read can't parse —
    // the recovery path then clobbers it with defaults and the user's
    // settings vanish.
    let parent = path
        .parent()
        .ok_or_else(|| format!("Cannot resolve parent of {}", path.display()))?;
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "workspace.json".to_string());
    let tmp_path = parent.join(format!(".{file_name}.tmp.{}", Uuid::new_v4()));

    fs::write(&tmp_path, &payload)
        .map_err(|error| format!("Failed to write {}: {error}", tmp_path.display()))?;

    if let Err(error) = fs::rename(&tmp_path, path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!(
            "Failed to atomically replace {}: {error}",
            path.display()
        ));
    }

    Ok(())
}

fn ensure_workspace_meta(workspace_root: &Path) -> Result<(WorkspaceMeta, String), String> {
    let groove_dir = workspace_root.join(".groove");
    fs::create_dir_all(&groove_dir)
        .map_err(|error| format!("Failed to create {}: {error}", groove_dir.display()))?;

    let workspace_json = groove_dir.join("workspace.json");
    if !path_is_file(&workspace_json) {
        let workspace_meta = default_workspace_meta(workspace_root);
        write_workspace_meta_file(&workspace_json, &workspace_meta)?;
        return Ok((
            workspace_meta,
            "Created .groove/workspace.json.".to_string(),
        ));
    }

    match read_workspace_meta_file(&workspace_json) {
        Ok(mut workspace_meta) => {
            let expected_root_name = default_workspace_meta(workspace_root).root_name;
            let mut did_update = false;
            let parsed_workspace_json = fs::read_to_string(&workspace_json)
                .ok()
                .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok());
            let has_telemetry_enabled = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("telemetryEnabled"))
                .unwrap_or(true);
            let has_disable_groove_business = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| {
                    obj.contains_key("disableGrooveBusiness")
                        || obj.contains_key("disableGrooveLoadingSection")
                })
                .unwrap_or(true);
            let has_show_fps = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("showFps"))
                .unwrap_or(true);
            let has_play_groove_command = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("playGrooveCommand"))
                .unwrap_or(true);
            let has_worktree_symlink_paths = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("worktreeSymlinkPaths"))
                .unwrap_or(true);
            let has_opencode_settings = parsed_workspace_json
                .as_ref()
                .and_then(|parsed| parsed.as_object())
                .map(|obj| obj.contains_key("opencodeSettings"))
                .unwrap_or(true);
            if workspace_meta.root_name != expected_root_name {
                workspace_meta.root_name = expected_root_name;
                did_update = true;
            }

            if let Ok(normalized) = normalize_default_terminal(&workspace_meta.default_terminal) {
                if normalized != workspace_meta.default_terminal {
                    workspace_meta.default_terminal = normalized;
                    did_update = true;
                }
            } else {
                workspace_meta.default_terminal = default_terminal_auto();
                did_update = true;
            }

            let normalized_custom_command = workspace_meta
                .terminal_custom_command
                .as_ref()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());
            if workspace_meta.terminal_custom_command != normalized_custom_command {
                workspace_meta.terminal_custom_command = normalized_custom_command;
                did_update = true;
            }

            if !has_telemetry_enabled {
                workspace_meta.telemetry_enabled = true;
                did_update = true;
            }

            if !has_disable_groove_business {
                workspace_meta.disable_groove_business = false;
                did_update = true;
            }

            if !has_show_fps {
                workspace_meta.show_fps = false;
                did_update = true;
            }

            match normalize_play_groove_command(&workspace_meta.play_groove_command) {
                Ok(normalized_play_groove_command) => {
                    if normalized_play_groove_command != workspace_meta.play_groove_command {
                        workspace_meta.play_groove_command = normalized_play_groove_command;
                        did_update = true;
                    }
                }
                Err(_) => {
                    workspace_meta.play_groove_command = default_play_groove_command();
                    did_update = true;
                }
            }

            let normalized_open_terminal_at_worktree_command =
                normalize_open_terminal_at_worktree_command(
                    workspace_meta.open_terminal_at_worktree_command.as_deref(),
                )
                .unwrap_or(None);
            if workspace_meta.open_terminal_at_worktree_command
                != normalized_open_terminal_at_worktree_command
            {
                workspace_meta.open_terminal_at_worktree_command =
                    normalized_open_terminal_at_worktree_command;
                did_update = true;
            }

            let normalized_worktree_symlink_paths =
                normalize_worktree_symlink_paths(&workspace_meta.worktree_symlink_paths);
            if workspace_meta.worktree_symlink_paths != normalized_worktree_symlink_paths {
                workspace_meta.worktree_symlink_paths = normalized_worktree_symlink_paths;
                did_update = true;
            }

            let normalized_opencode_settings =
                normalize_opencode_settings(&workspace_meta.opencode_settings);
            if workspace_meta.opencode_settings.enabled != normalized_opencode_settings.enabled
                || workspace_meta.opencode_settings.default_model
                    != normalized_opencode_settings.default_model
                || workspace_meta.opencode_settings.settings_directory
                    != normalized_opencode_settings.settings_directory
            {
                workspace_meta.opencode_settings = normalized_opencode_settings;
                did_update = true;
            }

            if !has_play_groove_command {
                workspace_meta.play_groove_command = default_play_groove_command();
                did_update = true;
            }

            if !has_worktree_symlink_paths {
                workspace_meta.worktree_symlink_paths = default_worktree_symlink_paths();
                did_update = true;
            }

            if !has_opencode_settings {
                workspace_meta.opencode_settings = default_opencode_settings();
                did_update = true;
            }

            // Units are no longer auto-rolled on load — they stay `None`
            // until an explicit user action (e.g. "Discover") assigns one.
            // For records that already have a unit but are missing the
            // `name` field (legacy data from before names existed), fill the
            // name in place rather than re-rolling the whole unit.
            for record in workspace_meta.worktree_records.values_mut() {
                if let Some(unit) = record.unit.as_mut() {
                    if unit.name.is_empty() {
                        unit.name = match unit.kind {
                            WorktreeUnitKind::Gems => GEMS_UNIT_NAME.to_string(),
                            WorktreeUnitKind::Goldmine => GOLDMINE_UNIT_NAME.to_string(),
                            WorktreeUnitKind::Bug => pick_bug_name(),
                        };
                        did_update = true;
                    }
                }
            }

            // Backfill `known_bugs` from any bug units already on disk so
            // existing workspaces don't lose their history when the register
            // ships.
            for record in workspace_meta.worktree_records.values() {
                if let Some(unit) = &record.unit {
                    if unit.kind == WorktreeUnitKind::Bug
                        && !unit.name.is_empty()
                        && !workspace_meta.known_bugs.contains(&unit.name)
                    {
                        workspace_meta.known_bugs.push(unit.name.clone());
                        did_update = true;
                    }
                }
            }

            if did_update {
                workspace_meta.updated_at = now_iso();
                write_workspace_meta_file(&workspace_json, &workspace_meta)?;
            }

            Ok((
                workspace_meta,
                "Loaded existing .groove/workspace.json.".to_string(),
            ))
        }
        Err(error) => {
            // Preserve the unparseable file so the user (or a future migration)
            // can recover their settings instead of silently losing them.
            let backup_name = format!(
                "workspace.corrupted.{}.json",
                OffsetDateTime::now_utc()
                    .format(&Rfc3339)
                    .unwrap_or_else(|_| "unknown".to_string())
                    .replace(':', "-"),
            );
            let backup_path = groove_dir.join(backup_name);
            let _ = fs::copy(&workspace_json, &backup_path);

            let workspace_meta = default_workspace_meta(workspace_root);
            write_workspace_meta_file(&workspace_json, &workspace_meta)?;
            Ok((
                workspace_meta,
                format!(
                    "Failed to parse .groove/workspace.json ({error}); backed it up to {} and recreated defaults.",
                    backup_path.display()
                ),
            ))
        }
    }
}

#[cfg(test)]
mod settings_runtime_tests {
    use super::*;

    #[test]
    fn resolves_play_command_with_shell_escaped_worktree_placeholder() {
        let command = "x-terminal-emulator -e bash -lc \"cd {worktree_escaped} && opencode\"";
        let worktree_path = Path::new("/tmp/worktrees/my\"quoted\"worktree");

        let (program, args) = resolve_play_groove_command(command, "feature/test", worktree_path)
            .expect("play command should resolve");

        assert_eq!(program, "x-terminal-emulator");
        assert_eq!(
            args,
            vec![
                "-e",
                "bash",
                "-lc",
                "cd '/tmp/worktrees/my\"quoted\"worktree' && opencode"
            ]
        );
    }

    #[test]
    fn shell_single_quote_escape_handles_single_quotes() {
        assert_eq!(
            shell_single_quote_escape("/tmp/o'connor"),
            "'/tmp/o'\"'\"'connor'"
        );
    }

    #[test]
    fn worktree_record_defaults_state_to_pending_when_missing() {
        let raw = r#"{ "id": "abc", "createdAt": "2026-01-01T00:00:00Z" }"#;
        let record: WorktreeRecord = serde_json::from_str(raw).expect("legacy parse");
        assert_eq!(record.state, WorktreeState::Pending);
        assert!(!record.claude_session_started);
    }

    #[test]
    fn set_worktree_state_round_trips_through_workspace_json() {
        let workspace_root =
            std::env::temp_dir().join(format!("groove-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&workspace_root).expect("mkdir workspace");

        let record =
            set_worktree_state(&workspace_root, "feature/x", WorktreeState::Fighting)
                .expect("first set");
        assert_eq!(record.state, WorktreeState::Fighting);

        let record =
            set_worktree_state(&workspace_root, "feature/x", WorktreeState::Defeated)
                .expect("second set");
        assert_eq!(record.state, WorktreeState::Defeated);

        let raw = std::fs::read_to_string(
            workspace_root.join(".groove").join("workspace.json"),
        )
        .expect("read");
        assert!(
            raw.contains("\"state\": \"defeated\"")
                || raw.contains("\"state\":\"defeated\"")
        );

        let _ = std::fs::remove_dir_all(&workspace_root);
    }

    #[test]
    fn roll_worktree_unit_produces_valid_levels_and_rewards() {
        let library: Vec<String> = BUG_NAME_LIBRARY
            .iter()
            .map(|name| (*name).to_string())
            .collect();
        let mut bug_count = 0u32;
        let mut goldmine_count = 0u32;
        let mut gems_count = 0u32;
        let total = 4000u32;
        for _ in 0..total {
            let unit = roll_worktree_unit();
            // Names: gems / goldmines fixed; bugs are drawn from the static
            // 100-name library.
            match unit.kind {
                WorktreeUnitKind::Gems => assert_eq!(unit.name, "Gems"),
                WorktreeUnitKind::Goldmine => assert_eq!(unit.name, "Goldmine"),
                WorktreeUnitKind::Bug => assert!(
                    library.iter().any(|name| name == &unit.name),
                    "bug name {:?} not in library",
                    unit.name,
                ),
            }
            assert!((1..=5).contains(&unit.level), "level {} out of range", unit.level);
            let (min, max): (u32, u32) = match unit.level {
                1 => (0, 50),
                2 => (50, 120),
                3 => (100, 230),
                4 => (200, 400),
                5 => (500, 960),
                _ => unreachable!(),
            };
            let (lo, hi) = match unit.kind {
                WorktreeUnitKind::Gems => (
                    ((min as f64) * 3.0).round() as u32,
                    ((max as f64) * 3.0).round() as u32,
                ),
                WorktreeUnitKind::Goldmine => (
                    ((min as f64) * 1.5).round() as u32,
                    ((max as f64) * 1.5).round() as u32,
                ),
                WorktreeUnitKind::Bug => (min, max),
            };
            assert!(
                unit.reward >= lo && unit.reward <= hi,
                "reward {} out of range [{lo}, {hi}] for level {} kind {:?}",
                unit.reward,
                unit.level,
                unit.kind,
            );
            match unit.kind {
                WorktreeUnitKind::Gems => gems_count += 1,
                WorktreeUnitKind::Goldmine => goldmine_count += 1,
                WorktreeUnitKind::Bug => bug_count += 1,
            }
        }
        assert_eq!(gems_count + goldmine_count + bug_count, total);
        let gems_ratio = (gems_count as f64) / (total as f64);
        let goldmine_ratio = (goldmine_count as f64) / (total as f64);
        assert!(
            (0.02..=0.10).contains(&gems_ratio),
            "gems ratio {gems_ratio} outside [0.02, 0.10] (target 0.05)",
        );
        assert!(
            (0.13..=0.27).contains(&goldmine_ratio),
            "goldmine ratio {goldmine_ratio} outside [0.13, 0.27] (target 0.20)",
        );
    }

    #[test]
    fn ensure_workspace_meta_does_not_auto_roll_units() {
        let workspace_root =
            std::env::temp_dir().join(format!("groove-test-{}", Uuid::new_v4()));
        let groove_dir = workspace_root.join(".groove");
        std::fs::create_dir_all(&groove_dir).expect("mkdir .groove");

        // Hand-write a workspace.json with one worktree record that lacks `unit`.
        let raw = r#"{
  "version": 1,
  "rootName": "groove-test",
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-01T00:00:00Z",
  "defaultTerminal": "auto",
  "telemetryEnabled": true,
  "playGrooveCommand": "echo",
  "worktreeSymlinkPaths": [],
  "opencodeSettings": { "enabled": false, "settingsDirectory": "~/.config/opencode" },
  "worktreeRecords": {
    "feature/x": {
      "id": "abc",
      "createdAt": "2026-01-01T00:00:00Z",
      "claudeSessionStarted": false,
      "state": "pending"
    }
  }
}"#;
        std::fs::write(groove_dir.join("workspace.json"), raw).expect("seed file");

        let (meta, _msg) =
            ensure_workspace_meta(&workspace_root).expect("ensure ok");
        let record = meta
            .worktree_records
            .get("feature/x")
            .expect("record present");
        assert!(record.unit.is_none(), "unit must NOT be auto-rolled on load");
        assert!(
            meta.known_bugs.is_empty(),
            "no bug units have been rolled yet, known_bugs should be empty",
        );

        let _ = std::fs::remove_dir_all(&workspace_root);
    }

    #[test]
    fn ensure_workspace_meta_backfills_known_bugs_from_existing_units() {
        let workspace_root =
            std::env::temp_dir().join(format!("groove-test-{}", Uuid::new_v4()));
        let groove_dir = workspace_root.join(".groove");
        std::fs::create_dir_all(&groove_dir).expect("mkdir .groove");

        // Seed a workspace with two bug units already on disk and an empty
        // known_bugs array.
        let raw = r#"{
  "version": 1,
  "rootName": "groove-test",
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-01T00:00:00Z",
  "defaultTerminal": "auto",
  "telemetryEnabled": true,
  "playGrooveCommand": "echo",
  "worktreeSymlinkPaths": [],
  "opencodeSettings": { "enabled": false, "settingsDirectory": "~/.config/opencode" },
  "worktreeRecords": {
    "feature/a": {
      "id": "a",
      "createdAt": "2026-01-01T00:00:00Z",
      "claudeSessionStarted": false,
      "state": "pending",
      "unit": { "kind": "bug", "level": 2, "reward": 80, "name": "Omen" }
    },
    "feature/b": {
      "id": "b",
      "createdAt": "2026-01-01T00:00:00Z",
      "claudeSessionStarted": false,
      "state": "pending",
      "unit": { "kind": "goldmine", "level": 4, "reward": 450, "name": "Goldmine" }
    }
  }
}"#;
        std::fs::write(groove_dir.join("workspace.json"), raw).expect("seed file");

        let (meta, _msg) =
            ensure_workspace_meta(&workspace_root).expect("ensure ok");
        assert!(
            meta.known_bugs.iter().any(|name| name == "Omen"),
            "Omen should be in known_bugs",
        );
        assert!(
            !meta.known_bugs.iter().any(|name| name == "Goldmine"),
            "Goldmine is not a bug; should NOT be in known_bugs",
        );

        let _ = std::fs::remove_dir_all(&workspace_root);
    }

    #[test]
    fn parse_claude_difficulty_clamps_and_handles_garbage() {
        assert_eq!(parse_claude_difficulty("3"), 3);
        assert_eq!(parse_claude_difficulty("  4\n"), 4);
        assert_eq!(parse_claude_difficulty("the answer is 2"), 2);
        assert_eq!(parse_claude_difficulty("0"), 1);
        assert_eq!(parse_claude_difficulty("6"), 5);
        assert_eq!(parse_claude_difficulty("99"), 5);
        assert_eq!(parse_claude_difficulty(""), 5);
        assert_eq!(parse_claude_difficulty("none"), 5);
    }

    #[test]
    fn roll_worktree_unit_with_level_respects_level() {
        let library: Vec<String> = BUG_NAME_LIBRARY
            .iter()
            .map(|name| (*name).to_string())
            .collect();
        for _ in 0..400 {
            let unit = roll_worktree_unit_with_level(3);
            assert_eq!(unit.level, 3);
            let (min, max): (u32, u32) = (100, 230);
            let (lo, hi) = match unit.kind {
                WorktreeUnitKind::Gems => (
                    ((min as f64) * 3.0).round() as u32,
                    ((max as f64) * 3.0).round() as u32,
                ),
                WorktreeUnitKind::Goldmine => (
                    ((min as f64) * 1.5).round() as u32,
                    ((max as f64) * 1.5).round() as u32,
                ),
                WorktreeUnitKind::Bug => (min, max),
            };
            assert!(
                unit.reward >= lo && unit.reward <= hi,
                "reward {} out of range [{lo}, {hi}] for level 3 kind {:?}",
                unit.reward,
                unit.kind,
            );
            match unit.kind {
                WorktreeUnitKind::Gems => assert_eq!(unit.name, "Gems"),
                WorktreeUnitKind::Goldmine => assert_eq!(unit.name, "Goldmine"),
                WorktreeUnitKind::Bug => assert!(
                    library.iter().any(|name| name == &unit.name),
                    "bug name {:?} not in library",
                    unit.name,
                ),
            }
        }
    }

    #[test]
    fn roll_worktree_unit_with_level_clamps_out_of_range() {
        assert_eq!(roll_worktree_unit_with_level(0).level, 1);
        assert_eq!(roll_worktree_unit_with_level(99).level, 5);
    }

    #[test]
    fn claim_worktree_reward_bumps_gold_and_marks_rewarded() {
        let workspace_root =
            std::env::temp_dir().join(format!("groove-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&workspace_root).expect("mkdir workspace");

        // Seed: defeated worktree with a level-3 unit (reward 0..=230 for bug,
        // 0..=345 for goldmine) and gold = 0.
        let (mut meta, _) = ensure_workspace_meta(&workspace_root).expect("ensure");
        let unit = roll_worktree_unit_with_level(3);
        let reward = unit.reward;
        meta.worktree_records.insert(
            "feature/x".to_string(),
            WorktreeRecord {
                id: "abc".to_string(),
                created_at: now_iso(),
                claude_session_started: false,
                state: WorktreeState::Defeated,
                unit: Some(unit),
                summaries: Vec::new(),
                comments: Vec::new(),
            },
        );
        let workspace_json = workspace_root.join(".groove").join("workspace.json");
        write_workspace_meta_file(&workspace_json, &meta).expect("seed");

        let (record, gold) =
            claim_worktree_reward(&workspace_root, "feature/x").expect("claim");
        assert_eq!(gold, reward as u64, "gold should match reward");
        let claimed_unit = record.unit.expect("unit present after claim");
        assert!(claimed_unit.rewarded, "unit must be marked rewarded");
        assert!(
            !claimed_unit.looted,
            "claim should NOT mark looted; that's a separate step",
        );
        assert_eq!(claimed_unit.reward, reward);
        assert!(
            claimed_unit.loot.is_empty(),
            "claim must not roll or expose loot — that happens in loot_worktree",
        );

        // Inventory must NOT be touched by the gold claim.
        let (after_meta, _) = ensure_workspace_meta(&workspace_root).expect("re-read");
        assert!(
            after_meta.inventory.is_empty(),
            "inventory must remain empty after a gold-only claim",
        );

        // Second claim is rejected.
        let err = claim_worktree_reward(&workspace_root, "feature/x").err();
        assert!(err.is_some(), "second claim should fail");
        assert!(
            err.unwrap().contains("already been claimed"),
            "error should mention already claimed",
        );

        // Looting deposits items and marks looted=true.
        let (looted_record, rolled_loot, inventory_snapshot) =
            loot_worktree(&workspace_root, "feature/x").expect("loot");
        let looted_unit = looted_record.unit.expect("unit present after loot");
        assert!(looted_unit.looted, "unit must be marked looted");
        assert_eq!(
            rolled_loot.len(),
            looted_unit.loot.len(),
            "returned loot must mirror the unit's persisted loot",
        );
        assert!(rolled_loot.len() <= 3, "loot count must be in 0..=3");
        let total_count: u32 = inventory_snapshot.values().sum();
        assert_eq!(
            total_count as usize,
            rolled_loot.len(),
            "inventory total must equal items just deposited",
        );

        // Second loot is rejected.
        let err = loot_worktree(&workspace_root, "feature/x").err();
        assert!(err.is_some(), "second loot should fail");
        assert!(
            err.unwrap().contains("already been collected"),
            "error should mention already collected",
        );

        let _ = std::fs::remove_dir_all(&workspace_root);
    }

    #[test]
    fn sync_worktree_records_with_disk_backfills_orphans_and_preserves_existing() {
        let workspace_root =
            std::env::temp_dir().join(format!("groove-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&workspace_root).expect("mkdir workspace");

        // Seed: an existing record for "alpha" with a known id, and two
        // on-disk worktrees ("alpha" already tracked, "beta" orphaned).
        let (mut meta, _) = ensure_workspace_meta(&workspace_root).expect("ensure");
        meta.worktree_records.insert(
            "alpha".to_string(),
            WorktreeRecord {
                id: "alpha-id".to_string(),
                created_at: "2026-01-01T00:00:00Z".to_string(),
                claude_session_started: true,
                state: WorktreeState::Fighting,
                unit: None,
                summaries: Vec::new(),
                comments: Vec::new(),
            },
        );
        let workspace_json = workspace_root.join(".groove").join("workspace.json");
        write_workspace_meta_file(&workspace_json, &meta).expect("seed");

        let worktrees_dir = workspace_root.join(".worktrees");
        std::fs::create_dir_all(worktrees_dir.join("alpha")).expect("mkdir alpha");
        std::fs::create_dir_all(worktrees_dir.join("beta")).expect("mkdir beta");
        // Non-directory entry must be ignored.
        std::fs::write(worktrees_dir.join("README"), b"ignore me").expect("write file");

        let added =
            sync_worktree_records_with_disk(&workspace_root, &workspace_root).expect("sync");
        assert_eq!(added, 1, "only the orphan beta should be added");

        let (after, _) = ensure_workspace_meta(&workspace_root).expect("re-read");
        let alpha = after.worktree_records.get("alpha").expect("alpha kept");
        assert_eq!(alpha.id, "alpha-id", "existing id preserved");
        assert_eq!(alpha.state, WorktreeState::Fighting, "existing state preserved");
        assert!(alpha.claude_session_started, "existing session flag preserved");

        let beta = after.worktree_records.get("beta").expect("beta seeded");
        assert!(!beta.id.is_empty(), "beta gets a fresh id");
        assert_eq!(beta.state, WorktreeState::Pending, "beta defaults to pending");
        assert!(beta.unit.is_none(), "beta has no auto-rolled unit");

        // Idempotent: a second sync writes nothing.
        let added_again =
            sync_worktree_records_with_disk(&workspace_root, &workspace_root).expect("sync 2");
        assert_eq!(added_again, 0, "second sync is a no-op");

        let _ = std::fs::remove_dir_all(&workspace_root);
    }

    #[test]
    fn sync_worktree_records_with_disk_handles_missing_worktrees_dir() {
        let workspace_root =
            std::env::temp_dir().join(format!("groove-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&workspace_root).expect("mkdir workspace");
        let (_, _) = ensure_workspace_meta(&workspace_root).expect("ensure");

        let added =
            sync_worktree_records_with_disk(&workspace_root, &workspace_root).expect("sync");
        assert_eq!(added, 0, "no .worktrees/ dir means nothing to sync");

        let _ = std::fs::remove_dir_all(&workspace_root);
    }

    #[test]
    fn claim_worktree_reward_requires_defeated_state() {
        let workspace_root =
            std::env::temp_dir().join(format!("groove-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&workspace_root).expect("mkdir workspace");

        let (mut meta, _) = ensure_workspace_meta(&workspace_root).expect("ensure");
        let unit = roll_worktree_unit_with_level(2);
        meta.worktree_records.insert(
            "feature/y".to_string(),
            WorktreeRecord {
                id: "id".to_string(),
                created_at: now_iso(),
                claude_session_started: false,
                state: WorktreeState::Wounded,
                unit: Some(unit),
                summaries: Vec::new(),
                comments: Vec::new(),
            },
        );
        let workspace_json = workspace_root.join(".groove").join("workspace.json");
        write_workspace_meta_file(&workspace_json, &meta).expect("seed");

        let err = claim_worktree_reward(&workspace_root, "feature/y").err();
        assert!(err.is_some(), "claim must fail when not defeated");
        assert!(
            err.unwrap().contains("defeated"),
            "error should mention defeated requirement",
        );

        let _ = std::fs::remove_dir_all(&workspace_root);
    }

    #[test]
    fn roll_loot_for_bug_only_includes_universal_kingdom_and_that_bugs_iconic() {
        // Ymir is a Veilwood bug with an iconic of `ymir-witnesss-red-ink`.
        // Over many rolls, every produced item must come from one of:
        //   - the universal pool
        //   - the Veilwood kingdom pool
        //   - the Ymir iconic itself
        // and never from another kingdom or another bug's iconic.
        let allowed: HashSet<String> = UNIVERSAL_ITEMS
            .iter()
            .map(|(id, _)| (*id).to_string())
            .chain(VEILWOOD_ITEMS.iter().map(|(id, _)| (*id).to_string()))
            .chain(std::iter::once("ymir-witnesss-red-ink".to_string()))
            .collect();

        let forbidden_ids: HashSet<String> = EMBERFORGE_ITEMS
            .iter()
            .map(|(id, _)| (*id).to_string())
            .chain(TIDEHOLLOW_ITEMS.iter().map(|(id, _)| (*id).to_string()))
            .chain(VOIDSPIRE_ITEMS.iter().map(|(id, _)| (*id).to_string()))
            .collect();

        for _ in 0..2_000 {
            let loot = roll_loot(WorktreeUnitKind::Bug, 5, "Ymir");
            // Loot count is 0..=3 now, so an empty roll is normal — the
            // pool-membership assertions below still hold vacuously.
            for entry in &loot {
                assert!(
                    allowed.contains(&entry.item_id),
                    "loot {} not in allowed pool for Ymir",
                    entry.item_id,
                );
                assert!(
                    !forbidden_ids.contains(&entry.item_id),
                    "loot {} is from another kingdom — must not appear",
                    entry.item_id,
                );
            }
        }
    }

    #[test]
    fn roll_loot_count_is_uniform_zero_to_three() {
        // Every roll must land in 0..=3 regardless of kind or level. We also
        // verify the distribution can produce both a zero and a three across
        // a reasonable sample — flake odds are vanishing (1 - (3/4)^200 ≈ 1
        // for "saw a zero", same for "saw a three").
        let mut saw_zero = false;
        let mut saw_three = false;
        for _ in 0..400 {
            for (kind, name) in [
                (WorktreeUnitKind::Bug, "Omen"),
                (WorktreeUnitKind::Goldmine, "Goldmine"),
                (WorktreeUnitKind::Gems, "Gems"),
            ] {
                let len = roll_loot(kind, 3, name).len();
                assert!(len <= 3, "loot count {len} must be ≤ 3 (kind {kind:?})");
                if len == 0 {
                    saw_zero = true;
                }
                if len == 3 {
                    saw_three = true;
                }
            }
        }
        assert!(saw_zero, "expected at least one empty roll over 400 samples");
        assert!(saw_three, "expected at least one max roll over 400 samples");
    }

    #[test]
    fn roll_loot_for_unknown_bug_falls_back_to_universal_only() {
        // If the bug name doesn't map to any kingdom, only universal items
        // can drop. (Defensive: shouldn't happen in production since names
        // come from BUG_NAME_LIBRARY.)
        let allowed: HashSet<String> = UNIVERSAL_ITEMS
            .iter()
            .map(|(id, _)| (*id).to_string())
            .collect();

        for _ in 0..200 {
            let loot = roll_loot(WorktreeUnitKind::Bug, 3, "NotARealBug");
            for entry in &loot {
                assert!(
                    allowed.contains(&entry.item_id),
                    "unknown-bug loot {} must come from universal pool",
                    entry.item_id,
                );
            }
        }
    }

    #[test]
    fn iconic_table_covers_every_bug_in_the_library() {
        for name in BUG_NAME_LIBRARY {
            assert!(
                iconic_for_bug_name(name).is_some(),
                "missing iconic entry for bug {name}",
            );
            assert!(
                kingdom_for_bug_name(name).is_some(),
                "missing kingdom mapping for bug {name}",
            );
        }
        assert_eq!(ICONIC_ITEMS.len(), BUG_NAME_LIBRARY.len());
    }

    #[test]
    fn loot_table_ids_are_unique() {
        let mut all_ids: Vec<&str> = Vec::new();
        all_ids.extend(UNIVERSAL_ITEMS.iter().map(|(id, _)| *id));
        all_ids.extend(VEILWOOD_ITEMS.iter().map(|(id, _)| *id));
        all_ids.extend(EMBERFORGE_ITEMS.iter().map(|(id, _)| *id));
        all_ids.extend(TIDEHOLLOW_ITEMS.iter().map(|(id, _)| *id));
        all_ids.extend(VOIDSPIRE_ITEMS.iter().map(|(id, _)| *id));
        all_ids.extend(ICONIC_ITEMS.iter().map(|(_, id, _)| *id));
        let unique: HashSet<&str> = all_ids.iter().copied().collect();
        assert_eq!(
            all_ids.len(),
            unique.len(),
            "loot table item IDs must be unique across all pools",
        );
        assert_eq!(
            all_ids.len(),
            12 + 12 * 4 + 100,
            "expected 160 total IDs across loot tables",
        );
    }
}
