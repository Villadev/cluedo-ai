---
name: project-start
description: Start any task in cluedo-ai by loading project context and following the mandatory branch, validation, and pull request workflow.
---

# Project start

## Project context

Cluedo AI is a multiplayer narrative investigation game inspired by Cluedo.
The backend owns the deterministic game state; the AI acts as Game Master and
generates narrative from that state without deciding or changing game facts.

The pnpm monorepo contains:

- `apps/backend`: Node.js, Express, TypeScript, Prisma/SQLite, and Socket.IO.
- `apps/player-ui`: Angular interface for players.
- `apps/master-ui`: Angular dashboard for controlling the game.

All user-facing content, including narratives, game messages, and Swagger
descriptions, must be in Catalan. Code and identifiers are in English.
Read `AGENTS.md` for architecture, API documentation, and frontend requirements.
Read `README.md` and `PROJECT_CONTEXT.md` for setup and game constraints. Verify
paths, scripts, and dependencies against the actual checkout before using them;
documentation can describe components that are not yet present.

## Start a task

1. Read the root `AGENTS.md`, this skill, and any nested instructions or relevant
   skills covering the affected files. Inspect the existing implementation.
2. Inspect `git status`, the current branch, and remotes. Preserve unrelated or
   uncommitted user changes; do not reset, discard, or include them in the task.
3. For every task that changes files, determine the remote's default branch and
   create a dedicated branch before editing, such as `feat/<short-topic>`,
   `fix/<short-topic>`, or `chore/<short-topic>`. Start from the updated default
   branch when available. If local work prevents switching safely, use an
   isolated worktree. If the remote is unavailable, record the base limitation.
4. A follow-up to the same task continues on its existing branch and PR. An
   unrelated task gets a new branch. Read-only tasks need no empty branch or PR.

## Implement and validate

- Complete the requested work using existing project patterns and focused changes.
- Keep game rules in the backend, AI calls in its AI module, and frontend logic
  focused on presentation and API communication.
- Update Swagger whenever API endpoints change, as required by `AGENTS.md`.
- Run checks appropriate to the changed files. Inspect package scripts before
  selecting commands; root scripts include `build`, `lint`, and `typecheck`.
- For documentation-only changes, review the diff, links, and Markdown, and run
  `git diff --check`; application builds are unnecessary.
- Report failed or unavailable checks accurately. Never claim unrun checks passed.

## Deliver through a pull request

1. Review the final diff and commit only files belonging to the task.
2. Push the dedicated branch with upstream tracking. Never push task commits
   directly to the default branch or force-push over unrelated work.
3. Open a PR against the default branch, or update the task's existing PR. Write
   its title and description in Catalan, explaining the problem, resulting
   behavior, validation, and any remaining limitations. Use a draft if incomplete.
4. Provide the PR link and a concise summary to the user. If push or PR creation
   is blocked, preserve local changes and commits and explain what is missing.
5. Leave the PR open for human review. Do not merge, enable auto-merge, or bypass
   review. Merge requires human review and an explicit user instruction to merge.

This workflow is required for code, documentation, configuration, and small fixes.
The root `AGENTS.md` also records it so it applies even without skill discovery.
