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
