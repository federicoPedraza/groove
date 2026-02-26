use std::time::{Duration, Instant};

pub(crate) fn is_fresh(created_at: Instant, ttl: Duration) -> bool {
    created_at.elapsed() <= ttl
}

pub(crate) fn is_within_stale_window(created_at: Instant, stale_ttl: Duration) -> bool {
    created_at.elapsed() <= stale_ttl
}
