pub(crate) fn summarize_stop_results(
    stopped: usize,
    already_stopped: usize,
    failed: usize,
) -> String {
    format!("stopped={stopped} already_stopped={already_stopped} failed={failed}")
}

pub(crate) fn clamp_percent(value: f64) -> f64 {
    if value.is_finite() {
        value.clamp(0.0, 100.0)
    } else {
        0.0
    }
}
