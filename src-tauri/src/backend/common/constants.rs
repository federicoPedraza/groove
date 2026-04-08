const MAX_DISCOVERY_DEPTH: usize = 4;
const MAX_DISCOVERY_DIRECTORIES: usize = 2500;
const COMMAND_TIMEOUT_POLL_INTERVAL: Duration = Duration::from_millis(50);
const WORKSPACE_EVENTS_POLL_INTERVAL: Duration = Duration::from_millis(1800);
const WORKSPACE_EVENTS_MIN_EMIT_INTERVAL: Duration = Duration::from_millis(1200);
const WORKSPACE_EVENTS_STOP_POLL_INTERVAL: Duration = Duration::from_millis(100);
const GROOVE_LIST_CACHE_TTL: Duration = Duration::from_secs(45);
const GROOVE_LIST_CACHE_STALE_TTL: Duration = Duration::from_secs(50);
const DEFAULT_WORKTREE_SYMLINK_PATHS: [&str; 4] = [".env", ".env.local", ".convex", "node_modules"];
const DEFAULT_RUN_LOCAL_COMMAND: &str = "pnpm run dev";
const SUPPORTED_DEFAULT_TERMINALS: [&str; 8] = [
    "auto", "ghostty", "warp", "kitty", "gnome", "xterm", "none", "custom",
];
const SUPPORTED_THEME_MODES: [&str; 9] = [
    "light",
    "groove",
    "ice",
    "gum",
    "lava",
    "earth",
    "wind",
    "dark-groove",
    "dark",
];
const GITIGNORE_GROOVE_COMMENT: &str = "# Groove";
const GITIGNORE_REQUIRED_ENTRIES: [&str; 2] = [".groove/", ".worktrees/"];
const GROOVE_PLAY_COMMAND_SENTINEL: &str = "__groove_terminal__";
const GROOVE_PLAY_CLAUDE_CODE_COMMAND_SENTINEL: &str = "__groove_terminal_claude__";
const GROOVE_OPEN_TERMINAL_COMMAND_SENTINEL: &str = "__groove_terminal_open__";
const GROOVE_TERMINAL_OUTPUT_EVENT: &str = "groove-terminal-output";
const GROOVE_TERMINAL_LIFECYCLE_EVENT: &str = "groove-terminal-lifecycle";
const DEFAULT_GROOVE_TERMINAL_COLS: u16 = 120;
const DEFAULT_GROOVE_TERMINAL_ROWS: u16 = 34;
const MIN_GROOVE_TERMINAL_DIMENSION: u16 = 10;
const MAX_GROOVE_TERMINAL_DIMENSION: u16 = 500;
const MAX_GROOVE_TERMINAL_SNAPSHOT_BYTES: usize = 256 * 1024;
