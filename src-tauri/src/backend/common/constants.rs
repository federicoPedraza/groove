const MAX_DISCOVERY_DEPTH: usize = 4;
const MAX_DISCOVERY_DIRECTORIES: usize = 2500;
const SEPARATE_TERMINAL_COMMAND_TIMEOUT: Duration = Duration::from_secs(15);
const COMMAND_TIMEOUT_POLL_INTERVAL: Duration = Duration::from_millis(50);
const WORKSPACE_EVENTS_POLL_INTERVAL: Duration = Duration::from_millis(1800);
const WORKSPACE_EVENTS_MIN_EMIT_INTERVAL: Duration = Duration::from_millis(1200);
const WORKSPACE_EVENTS_STOP_POLL_INTERVAL: Duration = Duration::from_millis(100);
const GROOVE_LIST_CACHE_TTL: Duration = Duration::from_secs(45);
const GROOVE_LIST_CACHE_STALE_TTL: Duration = Duration::from_secs(50);
const DEFAULT_TESTING_ENVIRONMENT_PORTS: [u16; 3] = [3000, 3001, 3002];
const DEFAULT_WORKTREE_SYMLINK_PATHS: [&str; 4] = [".env", ".env.local", ".convex", "node_modules"];
const MIN_TESTING_PORT: u16 = 1;
const MAX_TESTING_PORT: u16 = 65535;
const DEFAULT_PLAY_GROOVE_COMMAND_TEMPLATE: &str =
    "ghostty --working-directory={worktree} -e opencode";
const DEFAULT_RUN_LOCAL_COMMAND: &str = "pnpm run dev";
const SUPPORTED_DEFAULT_TERMINALS: [&str; 8] = [
    "auto", "ghostty", "warp", "kitty", "gnome", "xterm", "none", "custom",
];
const SUPPORTED_THEME_MODES: [&str; 8] = [
    "light",
    "groove",
    "ice",
    "lava",
    "earth",
    "wind",
    "dark-groove",
    "dark",
];
const GITIGNORE_GROOVE_COMMENT: &str = "# Groove";
const GITIGNORE_REQUIRED_ENTRIES: [&str; 2] = [".groove/", ".workspace/"];
const GROOVE_PLAY_COMMAND_SENTINEL: &str = "__groove_terminal__";
const GROOVE_OPEN_TERMINAL_COMMAND_SENTINEL: &str = "__groove_terminal_open__";
const GROOVE_TERMINAL_OUTPUT_EVENT: &str = "groove-terminal-output";
const GROOVE_TERMINAL_LIFECYCLE_EVENT: &str = "groove-terminal-lifecycle";
const DEFAULT_GROOVE_TERMINAL_COLS: u16 = 120;
const DEFAULT_GROOVE_TERMINAL_ROWS: u16 = 34;
const MIN_GROOVE_TERMINAL_DIMENSION: u16 = 10;
const MAX_GROOVE_TERMINAL_DIMENSION: u16 = 500;
const MAX_GROOVE_TERMINAL_SNAPSHOT_BYTES: usize = 256 * 1024;
const DEFAULT_CONSELLOUR_MODEL: &str = "gpt-5.3-codex";
const SUPPORTED_CONSELLOUR_MODELS: [&str; 4] =
    ["gpt-5.3-codex", "gpt-5.1", "gpt-4.1", "gpt-4o-mini"];
const DEFAULT_CONSELLOUR_REASONING_LEVEL: &str = "medium";
const SUPPORTED_CONSELLOUR_REASONING_LEVELS: [&str; 3] = ["low", "medium", "high"];
