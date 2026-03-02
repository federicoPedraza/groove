#![allow(dead_code)]

use std::time::{Duration, Instant};

pub(crate) fn should_emit(last_emitted_at: Option<Instant>, min_interval: Duration) -> bool {
    match last_emitted_at {
        Some(previous) => previous.elapsed() >= min_interval,
        None => true,
    }
}

pub(crate) fn poll_sleep_interval() -> Duration {
    Duration::from_millis(1800)
}
