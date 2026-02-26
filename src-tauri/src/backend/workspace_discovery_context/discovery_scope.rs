use std::collections::HashSet;

pub(crate) fn normalize_root_name_hint(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
        .map(ToOwned::to_owned)
}

pub(crate) fn dedupe_known_worktrees(input: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut ordered = Vec::new();
    for candidate in input {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            continue;
        }
        let normalized = trimmed.to_string();
        if seen.insert(normalized.clone()) {
            ordered.push(normalized);
        }
    }
    ordered
}
