#![allow(dead_code)]

use std::collections::HashSet;

pub(crate) fn normalize_ports(ports: &[u16], fallback: &[u16]) -> Vec<u16> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for port in ports {
        if *port == 0 {
            continue;
        }
        if seen.insert(*port) {
            normalized.push(*port);
        }
    }
    if normalized.is_empty() {
        return fallback.to_vec();
    }
    normalized
}

pub(crate) fn child_key(workspace_root: &str, worktree: &str) -> String {
    format!("{workspace_root}::{worktree}")
}
