use std::path::{Path, PathBuf};

pub(crate) fn worktree_dir(workspace_root: &Path) -> PathBuf {
    workspace_root.join(".worktrees")
}

pub(crate) fn branch_guess_from_name(worktree: &str) -> String {
    worktree.replace('_', "/")
}
