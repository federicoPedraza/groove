#![allow(dead_code)]

pub(crate) fn invalid_bin_warning(configured_path: Option<&str>) -> String {
    format!(
        "[startup-warning] GROOVE_BIN is invalid and may break groove command execution: {}",
        configured_path.unwrap_or("<unset>")
    )
}

pub(crate) fn validate_bin_path_hint(path: Option<&str>) -> bool {
    path.map(str::trim)
        .map(|value| !value.is_empty())
        .unwrap_or(false)
}
