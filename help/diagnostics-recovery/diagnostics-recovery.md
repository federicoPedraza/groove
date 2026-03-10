# Diagnostics and Recovery

## Purpose
Diagnostics helps investigate broken workspace, worktree, and runtime states. Use it when actions fail, status is inconsistent, or a worktree looks corrupted.

## First checks
Refresh workspace data and verify the active workspace path. Confirm branch and directory still exist. Many stale states are resolved by refresh plus command retry.

## Recovery actions
Use built-in recovery flows to repair metadata mismatches and command failures. Prefer guided recovery before manual filesystem edits.

## Corrupted worktree handling
If a worktree is corrupted, save any important local changes, inspect diagnostics output, and recreate the worktree if repair cannot restore a clean state.

## Escalation
If recovery still fails, capture logs, exact error text, and reproduction steps, then open an issue so root causes can be fixed in runtime code.
