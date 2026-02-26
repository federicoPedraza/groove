pub(crate) fn normalize_hostname(hostname: Option<&str>) -> Option<String> {
    hostname
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_lowercase())
}

pub(crate) fn remote_hint(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        "origin".to_string()
    } else {
        format!("origin@{trimmed}")
    }
}
