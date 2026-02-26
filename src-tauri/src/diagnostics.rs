use std::collections::{HashMap, HashSet};

pub(crate) fn collect_descendant_pids(
    snapshot_rows: &[(i32, Option<i32>)],
    root_pid: i32,
) -> Vec<i32> {
    if root_pid <= 0 {
        return Vec::new();
    }

    let mut children_by_parent: HashMap<i32, Vec<i32>> = HashMap::new();
    for (pid, ppid) in snapshot_rows {
        let Some(parent_pid) = *ppid else {
            continue;
        };
        children_by_parent.entry(parent_pid).or_default().push(*pid);
    }

    let mut stack = vec![root_pid];
    let mut descendants = Vec::new();
    let mut seen = HashSet::new();

    while let Some(parent_pid) = stack.pop() {
        let Some(children) = children_by_parent.get(&parent_pid) else {
            continue;
        };

        for child_pid in children {
            if *child_pid <= 0 || !seen.insert(*child_pid) {
                continue;
            }

            descendants.push(*child_pid);
            stack.push(*child_pid);
        }
    }

    descendants
}

#[cfg(target_os = "windows")]
pub(crate) fn parse_basic_csv_line(raw: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let chars = raw.chars().collect::<Vec<_>>();
    let mut index = 0usize;

    while index < chars.len() {
        let ch = chars[index];
        if ch == '"' {
            if in_quotes && index + 1 < chars.len() && chars[index + 1] == '"' {
                current.push('"');
                index += 2;
                continue;
            }
            in_quotes = !in_quotes;
            index += 1;
            continue;
        }

        if ch == ',' && !in_quotes {
            values.push(current.trim().to_string());
            current.clear();
            index += 1;
            continue;
        }

        current.push(ch);
        index += 1;
    }

    values.push(current.trim().to_string());
    values
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_descendants_for_nested_tree() {
        let rows = vec![(10, None), (11, Some(10)), (12, Some(11)), (13, Some(10))];
        let mut descendants = collect_descendant_pids(&rows, 10);
        descendants.sort();
        assert_eq!(descendants, vec![11, 12, 13]);
    }
}
