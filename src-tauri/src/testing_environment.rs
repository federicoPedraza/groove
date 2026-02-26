use std::collections::HashSet;

pub(crate) fn normalize_testing_ports_from_u16(
    ports: &[u16],
    min_port: u16,
    max_port: u16,
    default_ports: &[u16],
) -> Vec<u16> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    for port in ports {
        if *port < min_port || *port > max_port {
            continue;
        }
        if seen.insert(*port) {
            normalized.push(*port);
        }
    }

    if normalized.is_empty() {
        return default_ports.to_vec();
    }

    normalized
}

pub(crate) fn normalize_testing_ports_from_u32(
    ports: &[u32],
    min_port: u16,
    max_port: u16,
    default_ports: &[u16],
) -> Vec<u16> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    for port in ports {
        if *port < min_port as u32 || *port > max_port as u32 {
            continue;
        }
        let Ok(port) = u16::try_from(*port) else {
            continue;
        };
        if seen.insert(port) {
            normalized.push(port);
        }
    }

    if normalized.is_empty() {
        return default_ports.to_vec();
    }

    normalized
}

pub(crate) fn should_treat_as_already_stopped(stderr: &str) -> bool {
    let lower = stderr.to_lowercase();
    lower.contains("no such process")
        || lower.contains("not found")
        || lower.contains("cannot find")
        || lower.contains("not running")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_testing_ports_and_removes_duplicates() {
        let defaults = [3000u16, 3001, 3002];
        let normalized =
            normalize_testing_ports_from_u16(&[3000, 0, 3000, 4000], 1, 65535, &defaults);
        assert_eq!(normalized, vec![3000, 4000]);
    }

    #[test]
    fn falls_back_to_defaults_for_invalid_u32_ports() {
        let defaults = [3000u16, 3001, 3002];
        let normalized = normalize_testing_ports_from_u32(&[0, 70000], 1, 65535, &defaults);
        assert_eq!(normalized, defaults.to_vec());
    }
}
