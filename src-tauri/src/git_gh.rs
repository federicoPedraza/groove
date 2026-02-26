use std::collections::HashSet;

#[derive(Debug, Default, Clone)]
pub(crate) struct GitPorcelainCounts {
    pub(crate) modified: u32,
    pub(crate) added: u32,
    pub(crate) deleted: u32,
    pub(crate) untracked: u32,
}

impl GitPorcelainCounts {
    pub(crate) fn dirty(&self) -> bool {
        self.modified > 0 || self.added > 0 || self.deleted > 0 || self.untracked > 0
    }
}

pub(crate) fn normalize_remote_repo_info(remote_url: &str) -> Option<(String, String, String)> {
    let trimmed = remote_url.trim();
    if trimmed.is_empty() {
        return None;
    }

    let sanitized = trimmed
        .split_once('#')
        .map(|(value, _)| value)
        .unwrap_or(trimmed)
        .split_once('?')
        .map(|(value, _)| value)
        .unwrap_or(trimmed)
        .trim_end_matches('/');

    if let Some((left, path)) = sanitized
        .strip_prefix("git@")
        .and_then(|value| value.split_once(':'))
    {
        return normalize_remote_host_and_path(left, path);
    }

    if !sanitized.contains("://") {
        if let Some((left, path)) = sanitized.split_once(':') {
            if !left.contains('/') && path.contains('/') {
                return normalize_remote_host_and_path(left, path);
            }
        }
    }

    if let Some((_, rest)) = sanitized.split_once("://") {
        let (authority, path) = rest.split_once('/').unwrap_or((rest, ""));
        let host_port = authority
            .rsplit_once('@')
            .map(|(_, value)| value)
            .unwrap_or(authority);
        return normalize_remote_host_and_path(host_port, path);
    }

    if let Some((host, path)) = sanitized.split_once('/') {
        if host.contains('.') || host == "localhost" {
            return normalize_remote_host_and_path(host, path);
        }
    }

    None
}

pub(crate) fn normalize_gh_hostname(hostname: Option<&str>) -> Option<String> {
    let raw = hostname
        .map(str::trim)
        .filter(|value| !value.is_empty())?
        .to_lowercase();

    if raw.contains('/') || raw.contains('\\') {
        return None;
    }

    if let Some((host, _, _)) = normalize_remote_repo_info(&raw) {
        return Some(host);
    }

    Some(
        raw.split(':')
            .next()
            .map(str::trim)
            .filter(|value| !value.is_empty())?
            .to_string(),
    )
}

pub(crate) fn parse_gh_auth_identity(
    output: &str,
    preferred_host: Option<&str>,
) -> (Option<String>, Option<String>) {
    let preferred_host = preferred_host
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_lowercase());
    let mut entries = Vec::<(String, Option<String>, Option<bool>)>::new();
    let mut current_index: Option<usize> = None;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let lower = trimmed.to_lowercase();

        if let Some(start) = lower.find("logged in to") {
            let candidate = trimmed[start + "logged in to".len()..].trim();
            let cut = [" account", " as "]
                .iter()
                .filter_map(|needle| candidate.find(needle))
                .min()
                .unwrap_or(candidate.len());
            let host = candidate[..cut].trim().trim_matches(':').to_lowercase();
            if host.is_empty() {
                current_index = None;
                continue;
            }

            let username = if let Some((_, right)) = trimmed.split_once(" account ") {
                right
                    .split_whitespace()
                    .next()
                    .map(|value| value.trim_matches(|ch| ch == '(' || ch == ')' || ch == ','))
                    .filter(|value| !value.is_empty())
                    .map(|value| value.to_string())
            } else if let Some((_, right)) = trimmed.split_once(" as ") {
                right
                    .split_whitespace()
                    .next()
                    .map(|value| value.trim_matches(|ch| ch == '(' || ch == ')' || ch == ','))
                    .filter(|value| !value.is_empty())
                    .map(|value| value.to_string())
            } else {
                None
            };

            entries.push((host, username, None));
            current_index = Some(entries.len() - 1);
            continue;
        }

        if let Some(index) = current_index {
            if let Some((_, right)) = trimmed.split_once("Active account:") {
                let value = right.trim().to_lowercase();
                if value.starts_with("true") {
                    entries[index].2 = Some(true);
                } else if value.starts_with("false") {
                    entries[index].2 = Some(false);
                }
            }
        }
    }

    let find_entry = |require_active: bool| {
        entries.iter().find(|(host, _, active)| {
            if preferred_host
                .as_ref()
                .is_some_and(|preferred| preferred != host)
            {
                return false;
            }

            if require_active {
                matches!(active, Some(true))
            } else {
                true
            }
        })
    };

    if let Some((host, username, _)) = find_entry(true) {
        return (Some(host.clone()), username.clone());
    }
    if let Some((host, username, _)) = find_entry(false) {
        return (Some(host.clone()), username.clone());
    }

    (preferred_host, None)
}

pub(crate) fn parse_first_url(value: &str) -> Option<String> {
    value
        .split_whitespace()
        .find(|segment| segment.starts_with("https://") || segment.starts_with("http://"))
        .map(|segment| {
            segment
                .trim_matches(|ch: char| ch == '\'' || ch == '"' || ch == '(' || ch == ')')
                .to_string()
        })
}

pub(crate) fn normalize_gh_repository(
    owner: &str,
    repo: &str,
    hostname: Option<&str>,
) -> Result<String, String> {
    let owner = owner.trim();
    let repo = repo.trim();
    if owner.is_empty() || repo.is_empty() {
        return Err("owner and repo must be non-empty strings.".to_string());
    }

    if let Some(hostname) = hostname.map(str::trim).filter(|value| !value.is_empty()) {
        Ok(format!("{hostname}/{owner}/{repo}"))
    } else {
        Ok(format!("{owner}/{repo}"))
    }
}

pub(crate) fn parse_git_porcelain_counts(output: &str) -> GitPorcelainCounts {
    let mut counts = GitPorcelainCounts::default();

    for line in output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        if line.starts_with("??") {
            counts.untracked += 1;
            continue;
        }

        let bytes = line.as_bytes();
        if bytes.len() < 2 {
            continue;
        }

        let x = bytes[0] as char;
        let y = bytes[1] as char;

        if x == 'A' || y == 'A' {
            counts.added += 1;
        }
        if x == 'D' || y == 'D' {
            counts.deleted += 1;
        }
        if matches!(x, 'M' | 'R' | 'C' | 'T') || matches!(y, 'M' | 'R' | 'C' | 'T') {
            counts.modified += 1;
        }
    }

    counts
}

pub(crate) fn parse_git_ahead_behind(status_sb_output: &str) -> (u32, u32) {
    let Some(first_line) = status_sb_output
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
    else {
        return (0, 0);
    };

    let Some(bracket_start) = first_line.find('[') else {
        return (0, 0);
    };
    let Some(bracket_end_rel) = first_line[bracket_start + 1..].find(']') else {
        return (0, 0);
    };

    let mut ahead = 0u32;
    let mut behind = 0u32;
    let details = &first_line[bracket_start + 1..bracket_start + 1 + bracket_end_rel];
    for part in details.split(',') {
        let token = part.trim();
        if let Some(value) = token.strip_prefix("ahead ") {
            ahead = value.trim().parse::<u32>().unwrap_or(0);
            continue;
        }
        if let Some(value) = token.strip_prefix("behind ") {
            behind = value.trim().parse::<u32>().unwrap_or(0);
        }
    }

    (ahead, behind)
}

pub(crate) fn parse_git_file_states(output: &str) -> (Vec<String>, Vec<String>, Vec<String>) {
    let mut staged = HashSet::new();
    let mut unstaged = HashSet::new();
    let mut untracked = HashSet::new();

    for line in output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        if line.starts_with("??") {
            if let Some(path) = normalize_git_status_path(line.get(2..).unwrap_or_default()) {
                untracked.insert(path);
            }
            continue;
        }

        if line.len() < 3 {
            continue;
        }

        let Some(path) = normalize_git_status_path(line.get(3..).unwrap_or_default()) else {
            continue;
        };
        let bytes = line.as_bytes();
        let index_state = bytes[0] as char;
        let worktree_state = bytes[1] as char;

        if index_state != ' ' && index_state != '?' {
            staged.insert(path.clone());
        }
        if worktree_state != ' ' && worktree_state != '?' {
            unstaged.insert(path);
        }
    }

    let mut staged = staged.into_iter().collect::<Vec<_>>();
    let mut unstaged = unstaged.into_iter().collect::<Vec<_>>();
    let mut untracked = untracked.into_iter().collect::<Vec<_>>();
    staged.sort();
    unstaged.sort();
    untracked.sort();

    (staged, unstaged, untracked)
}

pub(crate) fn normalize_git_file_list(files: &[String]) -> Result<Vec<String>, String> {
    let mut normalized = Vec::new();
    let mut seen = HashSet::new();

    for file in files {
        let trimmed = file.trim();
        if trimmed.is_empty() {
            return Err("files entries must be non-empty strings.".to_string());
        }
        if trimmed.contains('\0') {
            return Err("files entries cannot contain null bytes.".to_string());
        }
        if seen.insert(trimmed.to_string()) {
            normalized.push(trimmed.to_string());
        }
    }

    if normalized.is_empty() {
        return Err("files must include at least one path.".to_string());
    }

    Ok(normalized)
}

fn normalize_remote_host_and_path(
    host_value: &str,
    path: &str,
) -> Option<(String, String, String)> {
    if host_value.contains('/') || host_value.contains('\\') {
        return None;
    }

    let host = host_value
        .split(':')
        .next()
        .map(str::trim)
        .map(|value| value.trim_matches('[').trim_matches(']'))
        .filter(|value| !value.is_empty())?
        .to_lowercase();

    let normalized_path = path.trim().trim_matches('/').trim_end_matches(".git");
    let segments = normalized_path
        .split('/')
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    if segments.len() < 2 {
        return None;
    }

    let owner = segments[segments.len() - 2].to_string();
    let repo = segments[segments.len() - 1].to_string();
    Some((host, owner, repo))
}

fn normalize_git_status_path(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some((_, right)) = trimmed.rsplit_once(" -> ") {
        return Some(right.trim().to_string());
    }

    Some(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ssh_remote_url() {
        let parsed = normalize_remote_repo_info("git@github.com:owner/repo.git");
        assert_eq!(
            parsed,
            Some((
                "github.com".to_string(),
                "owner".to_string(),
                "repo".to_string()
            ))
        );
    }

    #[test]
    fn parses_ahead_behind_tokens() {
        let (ahead, behind) = parse_git_ahead_behind("## main...origin/main [ahead 2, behind 1]");
        assert_eq!((ahead, behind), (2, 1));
    }

    #[test]
    fn parses_file_states() {
        let output = "M  src/a.ts\n M src/b.ts\n?? src/c.ts\n";
        let (staged, unstaged, untracked) = parse_git_file_states(output);
        assert_eq!(staged, vec!["src/a.ts".to_string()]);
        assert_eq!(unstaged, vec!["src/b.ts".to_string()]);
        assert_eq!(untracked, vec!["src/c.ts".to_string()]);
    }
}
