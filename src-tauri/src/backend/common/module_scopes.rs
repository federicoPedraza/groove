#![allow(dead_code)]

pub(crate) const BACKEND_MODULE_COUNT: usize = 15;

pub(crate) const BACKEND_MODULE_NAMES: [&str; BACKEND_MODULE_COUNT] = [
    "tauri_backend_entry",
    "frontend_command_registry",
    "app_state_management",
    "workspace_discovery_context",
    "workspace_metadata_settings",
    "groove_worktree_lifecycle",
    "pty_terminal_sessions",
    "testing_environment_orchestration",
    "git_github_bridge",
    "jira_integration",
    "diagnostics_process_control",
    "runtime_cache_dedupe",
    "event_polling_emission_pipeline",
    "startup_health_checks_binary_validation",
    "common",
];

pub(crate) fn backend_module_inventory() -> String {
    BACKEND_MODULE_NAMES.join(",")
}
