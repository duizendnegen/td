---
name: agent-workspace
description: "An isolated git-worktree workspace in which an agent may commit on its own branch — creating the worktree in the sibling td.worktrees/ folder, bootstrapping it (npm ci), the `git -C` mutation convention that path-scoped permission rules require, handing the branch back for merge, and tearing the workspace down afterwards. Use when the user asks for a separate workspace/worktree for a task, when a task needs commits (checkpoints, multi-commit plans) that must not touch the main checkout, or when asked to remove/clean up a finished workspace."
---

# Agent workspace

The one sanctioned exception to "never touch git state": inside a workspace
created by this skill, you may create and rewrite commits — on the
workspace's own branch only. Everything else stays the user's: pushing,
pulling, merging, tags, other branches, and the main checkout.

## The contract

- A workspace is a git worktree at `td.worktrees/<task-slug>` — a sibling
  of the main checkout (GitKraken's convention), i.e.
  `/home/<user>/src/github.com/duizendnegen/td.worktrees/<task-slug>` — on a
  dedicated branch `agent/<task-slug>`.
- The location is load-bearing twice over:
  - Beside the repo, never inside it: a worktree nested in the main checkout
    would appear there as untracked files and get caught by file watchers,
    search, and `git clean`.
  - `td.worktrees/` is a distinct literal path prefix from the checkout's
    `td/`, so path-scoped permission rules can tell workspace git mutations
    (allowed) from main-checkout ones (denied). Rules match the literal
    command text, not the shell cwd, which forces two conventions:
    - Every git mutation uses `git -C <workspace path> ...`. A bare
      `git commit` is denied regardless of where it runs.
    - Write the expanded absolute path (`/home/<user>/src/...`) — a literal
      `~` or `$HOME` in the command text matches no path pattern.
- The worktree shares its object database and refs with the main checkout.
  Stay on the `agent/<task-slug>` branch: no push, no pull, no tags, no
  touching other branches' refs.
- Without the user's path-scoped permission rules the same commands still
  work; they prompt instead of auto-approving.

## Create the workspace

From the main checkout — expect a permission prompt on `worktree add`; that
prompt is the design, not an obstacle:

    git fetch origin
    git worktree add --no-track -b agent/<task-slug> /home/<user>/src/github.com/duizendnegen/td.worktrees/<task-slug> <base>

`<base>` is whatever the task names: typically `origin/main`, or the
current feature branch when the work builds on it.

`--no-track` is load-bearing: a branch created from a remote-tracking ref
inherits it as upstream, and IDE sync/push buttons then target that upstream —
so one "pull, then push" from the editor merges the workspace branch straight
into main.

**Pitfall:** git refuses if the branch exists or the directory is non-empty —
pick a fresh slug rather than forcing with `-B`.

## Bootstrap

`npm ci` with cwd in the workspace — `node_modules/` is gitignored, so a
fresh worktree has none. Node and npm come from the user's mise-managed
global toolchain; nothing per-project to trust or install beyond that.

## Working in the workspace

- Builds and tests run normally with cwd inside the workspace
  (`npm run typecheck`, `npm test`, `npm run build` — same as the main
  checkout).
- `npm run dev` from a workspace works, but Vite's default port may collide
  with a dev server running in the main checkout — Vite picks the next free
  port; check the URL it prints.
- Git reads (`status`, `diff`, `log`) work bare from the workspace cwd; only
  mutations need the `git -C <ws>` form.
- Commit in reviewable units; the branch is handed over as-is.

## Handing back

1. `npm run typecheck` and `npm test` pass in the workspace.
2. `git -C <ws> status` — clean tree, everything committed.
3. Report branch name and workspace path; pushing, merging, and branch
   deletion are the user's. The workspace stays in place until the user says
   the branch is merged or abandoned — then tear it down.

## Tear down

On the user's word that the branch is merged (or the work abandoned), from
the main checkout:

    git worktree remove /home/<user>/src/github.com/duizendnegen/td.worktrees/<task-slug>

- Expect the permission prompt, same as creation.
- git refuses to remove a tree with uncommitted changes or untracked files
  (a bootstrapped `node_modules/` alone is ignored, so it doesn't block
  removal). Once everything worth keeping is committed, `--force` is safe:
  commits live in the shared object database, so removal can only lose
  uncommitted files — never the branch or its commits.
- The `agent/<task-slug>` branch survives removal; deleting it stays with the
  user.
- If the directory was already deleted by hand, `git worktree prune` clears
  the stale registration (prompts).

Verify: `git worktree list` no longer shows the path, and the directory is
gone.

## Verify your work (setup)

- `git worktree list` in the main checkout shows the new path and branch.
- `git -C <ws> status` is clean and on `agent/<task-slug>`.
