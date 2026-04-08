fn configured_groove_bin_path() -> Option<String> {
    if let Ok(from_env) = std::env::var("GROOVE_BIN") {
        if !from_env.trim().is_empty() {
            return Some(from_env);
        }
    }

    None
}

fn is_attempt_ready_executable(path: &Path) -> bool {
    if !path.exists() || !path.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        if let Ok(metadata) = fs::metadata(path) {
            return metadata.permissions().mode() & 0o111 != 0;
        }

        false
    }

    #[cfg(not(unix))]
    {
        true
    }
}

fn resolve_groove_binary(app: &AppHandle) -> GrooveBinaryResolution {
    if let Some(from_env) = configured_groove_bin_path() {
        return GrooveBinaryResolution {
            path: PathBuf::from(from_env),
            source: "env".to_string(),
        };
    }

    let names = crate::backend::common::platform_env::groove_sidecar_binary_names();

    let mut roots = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push(resource_dir);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            roots.push(parent.to_path_buf());
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd);
    }

    for root in roots {
        for name in &names {
            for candidate in [root.join(name), root.join("binaries").join(name)] {
                if candidate.exists() && candidate.is_file() {
                    return GrooveBinaryResolution {
                        path: candidate,
                        source: "bundled".to_string(),
                    };
                }
            }
        }
    }

    GrooveBinaryResolution {
        path: PathBuf::from("groove"),
        source: "path".to_string(),
    }
}

fn groove_binary_path(app: &AppHandle) -> PathBuf {
    resolve_groove_binary(app).path
}

fn evaluate_groove_bin_check_status(app: &AppHandle) -> GrooveBinCheckStatus {
    let configured_path = configured_groove_bin_path();
    let configured_path_valid = configured_path
        .as_ref()
        .map(|path| is_attempt_ready_executable(Path::new(path)));
    let has_issue = matches!(configured_path_valid, Some(false));

    let issue = if has_issue {
        Some(
            "GROOVE_BIN is set but does not point to an executable file. Repair to clear GROOVE_BIN and use bundled/PATH resolution."
                .to_string(),
        )
    } else {
        None
    };

    let resolved = resolve_groove_binary(app);

    GrooveBinCheckStatus {
        configured_path,
        configured_path_valid,
        has_issue,
        issue,
        effective_binary_path: resolved.path.display().to_string(),
        effective_binary_source: resolved.source,
    }
}

