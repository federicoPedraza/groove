use std::collections::HashSet;
use std::path::{Component, Path};

pub(crate) fn normalize_default_terminal(
    value: &str,
    supported_default_terminals: &[&str],
) -> Result<String, String> {
    let normalized = value.trim().to_lowercase();
    if supported_default_terminals.contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(format!(
            "defaultTerminal must be one of: {}.",
            supported_default_terminals.join(", ")
        ))
    }
}

pub(crate) fn normalize_theme_mode(
    value: &str,
    supported_theme_modes: &[&str],
) -> Result<String, String> {
    let normalized = value.trim().to_lowercase();
    if supported_theme_modes.contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(format!(
            "themeMode must be one of: {}.",
            supported_theme_modes.join(", ")
        ))
    }
}

pub(crate) fn is_restricted_worktree_symlink_path(path: &str) -> bool {
    path.split('/')
        .next()
        .map(|part| part.eq_ignore_ascii_case(".worktrees"))
        .unwrap_or(false)
}

pub(crate) fn is_safe_path_token(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }

    for segment in value.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return false;
        }

        if !segment
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
        {
            return false;
        }
    }

    true
}

pub(crate) fn validate_known_worktrees(known_worktrees: &[String]) -> Result<Vec<String>, String> {
    if known_worktrees.len() > 128 {
        return Err("knownWorktrees is too large (max 128 entries).".to_string());
    }

    let mut set = HashSet::new();
    for entry in known_worktrees {
        let trimmed = entry.trim();
        if trimmed.is_empty() {
            return Err("knownWorktrees entries must be non-empty strings.".to_string());
        }

        if !is_safe_path_token(trimmed) {
            return Err("knownWorktrees contains unsafe characters or path segments.".to_string());
        }

        set.insert(trimmed.to_string());
    }

    let mut values = set.into_iter().collect::<Vec<_>>();
    values.sort();
    Ok(values)
}

pub(crate) fn normalize_worktree_symlink_paths(paths: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    for path in paths {
        let trimmed = path.trim();
        if trimmed.is_empty() || trimmed.contains('\\') {
            continue;
        }

        let candidate = Path::new(trimmed);
        if candidate.is_absolute() {
            continue;
        }

        let mut parts = Vec::new();
        let mut valid = true;
        for component in candidate.components() {
            match component {
                Component::Normal(value) => {
                    let part = value.to_string_lossy().trim().to_string();
                    if part.is_empty() {
                        valid = false;
                        break;
                    }
                    parts.push(part);
                }
                Component::ParentDir
                | Component::CurDir
                | Component::RootDir
                | Component::Prefix(_) => {
                    valid = false;
                    break;
                }
            }
        }

        if !valid || parts.is_empty() {
            continue;
        }

        let rendered = parts.join("/");
        if is_restricted_worktree_symlink_path(&rendered) {
            continue;
        }
        if seen.insert(rendered.clone()) {
            normalized.push(rendered);
        }
    }

    normalized
}

pub(crate) fn validate_worktree_symlink_paths(paths: &[String]) -> Result<Vec<String>, String> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    for path in paths {
        let candidate = normalize_worktree_symlink_paths(std::slice::from_ref(path));
        let Some(value) = candidate.into_iter().next() else {
            return Err(format!(
                "worktreeSymlinkPaths contains an invalid or restricted path: \"{}\".",
                path.trim()
            ));
        };

        if seen.insert(value.clone()) {
            normalized.push(value);
        }
    }

    Ok(normalized)
}

pub(crate) fn normalize_browse_relative_path(value: Option<&str>) -> Result<String, String> {
    let Some(trimmed) = value.map(str::trim).filter(|entry| !entry.is_empty()) else {
        return Ok(String::new());
    };

    if trimmed.contains('\\') {
        return Err("relativePath must use forward slashes only.".to_string());
    }

    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err("relativePath must be a relative path.".to_string());
    }

    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => {
                let part = value.to_string_lossy().trim().to_string();
                if part.is_empty() {
                    return Err("relativePath contains invalid path segments.".to_string());
                }
                parts.push(part);
            }
            Component::ParentDir
            | Component::CurDir
            | Component::RootDir
            | Component::Prefix(_) => {
                return Err("relativePath contains unsafe path segments.".to_string());
            }
        }
    }

    if parts.is_empty() {
        return Ok(String::new());
    }

    let normalized = parts.join("/");
    if is_restricted_worktree_symlink_path(&normalized) {
        return Err("relativePath cannot browse restricted workspace directories.".to_string());
    }

    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_default_terminal_case_and_spacing() {
        let terminals = ["auto", "ghostty", "none"];
        let result = normalize_default_terminal("  GhostTy  ", &terminals);
        assert_eq!(result, Ok("ghostty".to_string()));
    }

    #[test]
    fn rejects_invalid_known_worktree_entries() {
        let values = vec!["good".to_string(), "../bad".to_string()];
        assert!(validate_known_worktrees(&values).is_err());
    }

    #[test]
    fn normalizes_and_filters_symlink_paths() {
        let values = vec![
            " node_modules ".to_string(),
            "./bad".to_string(),
            ".worktrees/state".to_string(),
            "node_modules".to_string(),
        ];
        let normalized = normalize_worktree_symlink_paths(&values);
        assert_eq!(normalized, vec!["node_modules".to_string()]);
    }

    #[test]
    fn rejects_restricted_browse_path() {
        let result = normalize_browse_relative_path(Some(".worktrees/state"));
        assert!(result.is_err());
    }
}
