# Settings and Workspace Commands

## Purpose
Settings controls command templates and workspace behavior used by dashboard, worktree detail, and quick actions.

## Workspace command fields
Play Groove command, open terminal at worktree command, and run local command are stored in workspace metadata. Commands must be valid shell command templates.

## Testing ports
Testing ports are normalized and deduplicated. Choose ports that are free on your machine so parallel worktrees can run local services safely.

## Consellour settings
Consellour settings include OpenAI API key, model, and reasoning level. These values are scoped to workspace metadata and used by chat flows.

## Safe updates
After changing command settings, test from one worktree row before applying broad workflow changes to all active branches.
