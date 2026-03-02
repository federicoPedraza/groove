#![allow(dead_code)]

pub(crate) fn normalize_dimension(value: Option<u16>, default: u16, min: u16, max: u16) -> u16 {
    let resolved = value.unwrap_or(default);
    resolved.clamp(min, max)
}

pub(crate) fn render_terminal_command(program: &str, args: &[String]) -> String {
    std::iter::once(program)
        .chain(args.iter().map(|value| value.as_str()))
        .collect::<Vec<_>>()
        .join(" ")
}
