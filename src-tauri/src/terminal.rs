#[derive(Debug, Clone, Copy)]
pub(crate) enum GrooveTerminalOpenMode {
    Opencode,
    RunLocal,
    Plain,
}

pub(crate) fn normalize_terminal_dimension(
    value: Option<u16>,
    default: u16,
    min: u16,
    max: u16,
) -> u16 {
    value
        .map(|candidate| candidate.max(min).min(max))
        .unwrap_or(default)
}

pub(crate) fn validate_groove_terminal_target(
    value: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(target) = value
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
    else {
        return Ok(None);
    };
    if !crate::workspace::is_safe_path_token(target) {
        return Err("target contains unsafe characters or path segments.".to_string());
    }
    Ok(Some(target.to_string()))
}

pub(crate) fn validate_groove_terminal_open_mode(
    value: Option<&str>,
) -> Result<GrooveTerminalOpenMode, String> {
    let Some(mode) = value
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
    else {
        return Ok(GrooveTerminalOpenMode::Plain);
    };

    match mode {
        "opencode" => Ok(GrooveTerminalOpenMode::Opencode),
        "runLocal" => Ok(GrooveTerminalOpenMode::RunLocal),
        "plain" => Ok(GrooveTerminalOpenMode::Plain),
        _ => Err("openMode must be either \"opencode\", \"runLocal\", or \"plain\".".to_string()),
    }
}

pub(crate) fn parse_terminal_command_tokens(command: &str) -> Result<Vec<String>, String> {
    parse_command_tokens(command, "terminalCustomCommand")
}

pub(crate) fn parse_play_groove_command_tokens(command: &str) -> Result<Vec<String>, String> {
    parse_command_tokens(command, "playGrooveCommand")
}

fn parse_command_tokens(command: &str, field_name: &str) -> Result<Vec<String>, String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err(format!("{field_name} must be a non-empty command string."));
    }

    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut escaping = false;

    for ch in trimmed.chars() {
        if escaping {
            current.push(ch);
            escaping = false;
            continue;
        }

        if ch == '\\' && !in_single_quote {
            escaping = true;
            continue;
        }

        if ch == '\'' && !in_double_quote {
            in_single_quote = !in_single_quote;
            continue;
        }

        if ch == '"' && !in_single_quote {
            in_double_quote = !in_double_quote;
            continue;
        }

        if ch.is_whitespace() && !in_single_quote && !in_double_quote {
            if !current.is_empty() {
                tokens.push(std::mem::take(&mut current));
            }
            continue;
        }

        current.push(ch);
    }

    if escaping {
        return Err(format!("{field_name} ends with an unfinished escape (\\)."));
    }
    if in_single_quote || in_double_quote {
        return Err(format!("{field_name} has an unmatched quote."));
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    if tokens.is_empty() {
        return Err(format!("{field_name} must include an executable command."));
    }

    Ok(tokens)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_terminal_command_tokens_with_quotes() {
        let tokens = parse_terminal_command_tokens("ghostty -e \"npm run dev\"").unwrap();
        assert_eq!(tokens, vec!["ghostty", "-e", "npm run dev"]);
    }

    #[test]
    fn rejects_invalid_open_mode() {
        let result = validate_groove_terminal_open_mode(Some("bad"));
        assert!(result.is_err());
    }

    #[test]
    fn defaults_open_mode_to_plain_shell() {
        assert!(matches!(
            validate_groove_terminal_open_mode(None),
            Ok(GrooveTerminalOpenMode::Plain)
        ));
        assert!(matches!(
            validate_groove_terminal_open_mode(Some("   ")),
            Ok(GrooveTerminalOpenMode::Plain)
        ));
    }

    #[test]
    fn normalizes_dimension_in_range() {
        assert_eq!(normalize_terminal_dimension(Some(2), 40, 10, 80), 10);
        assert_eq!(normalize_terminal_dimension(Some(100), 40, 10, 80), 80);
    }
}
