# Worktree Lifecycle

## Purpose
Use the Worktrees page to create isolated development directories from branches so you can ship parallel changes safely.

## Create a worktree
Open Worktrees, choose create, and provide a branch target. You can start from the current branch, an existing branch, or a new branch name. Groove registers the worktree and shows status once the directory is prepared.

## Run and test
From each worktree row you can open terminal, run local, and play Groove commands using workspace command settings. Testing ports come from workspace settings so each worktree can run without collisions.

## Status and health
Worktree rows reflect lifecycle states such as ready, preparing, running, stale, or corrupted. If status looks wrong, refresh the dashboard first, then inspect diagnostics and recovery actions.

## Remove and clean up
When a branch is done, remove the worktree from the row action. Confirm that uncommitted changes are handled before deleting. Groove updates metadata and keeps the workspace list consistent.
