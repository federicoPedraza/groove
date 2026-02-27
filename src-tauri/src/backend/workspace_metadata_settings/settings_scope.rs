#![allow(dead_code)]

pub(crate) fn normalize_optional_command(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
        .map(ToOwned::to_owned)
}

pub(crate) fn normalize_terminal_name(value: &str) -> String {
    let candidate = value.trim();
    if candidate.is_empty() {
        "auto".to_string()
    } else {
        candidate.to_lowercase()
    }
}
