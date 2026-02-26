use std::path::Path;

pub(crate) const WORKSPACE_EVENT_STATE_KEY: &str = "workspace_events";
pub(crate) const TESTING_ENVIRONMENT_STATE_KEY: &str = "testing_environment";

pub(crate) fn workspace_root_key(workspace_root: &Path) -> String {
    workspace_root
        .canonicalize()
        .unwrap_or_else(|_| workspace_root.to_path_buf())
        .display()
        .to_string()
}

pub(crate) fn session_state_key(workspace_root: &Path, worktree: &str) -> String {
    format!("{}::{worktree}", workspace_root_key(workspace_root))
}
