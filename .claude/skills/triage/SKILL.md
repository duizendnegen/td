---
name: triage
description: PR review comment and CI-failure triage — validity verdict first (judged against main, with realism), fixing what's valid or a no-brainer and reporting notable leftovers, then optionally replying to and resolving the threads on GitHub. Use when the user pastes one or more PR/review comments, gives a PR number and asks to triage/address its comments or failing checks, or invokes /triage. Not for reviewing your own working diff (the /code-review command).
---

# PR review comment triage

The user pastes one or more review comments, or names a PR to fetch them from — often from an automated reviewer (e.g. GitHub Copilot). The deliverable is a verdict per comment — and, when the PR is known, per failing CI check — then a fix for the valid ones. "Not valid" is a perfectly good and expected answer — say it plainly with the reasoning.

## Fetching from a PR

When given a PR number/URL instead of pasted comments:

1. `gh pr view <n> --json title,headRefName,state,url` — then verify `git branch --show-current` matches `headRefName`. If not, stop and tell the user; never check out branches.
2. Inline threads: `gh api repos/{owner}/{repo}/pulls/<n>/comments --paginate`. Triage only thread roots (`in_reply_to_id == null`); keep the comment `id` per thread for the reply phase.
3. Thread state: fetch `reviewThreads` via GraphQL (see below) and skip threads already `isResolved`.
4. Also read PR-level reviews (`.../pulls/<n>/reviews`) for reviewer summary bodies — context only, not separate findings.
5. Dedupe: automated reviewers often raise the same concern on the same lines more than once. Triage each unique concern once, but track *every* thread it appears in — count threads, not concerns, so none is missed in the reply phase.
6. Checks: the PR's failing CI checks are triage items too — fetch and judge them per "CI failures" below.

## Protocol

1. **Read the code, not just the comment.** For each comment, open the referenced file(s) and establish what the code on this branch actually does today. Review comments can be outdated (the code may have changed since the comment was written) — check that first.

2. **Judge against main, with realism.** The baseline is `main`: a finding is the branch's problem only if the branch introduced or worsened it. Calibrate to how the code is actually used — a single-player browser game does not need hardening against hypothetical operators. Triage-specific additions: reviewers (especially automated ones) sometimes read intermediate commits, so a finding about something that only ever existed inside the branch's history is invalid.

3. **Verdict per comment**: `valid` / `invalid` / `outdated`, each with a short paragraph of reasoning grounded in the code you read. A comment can be invalid-as-stated yet point at a real adjacent gap (e.g. an undocumented invariant that let the reviewer hallucinate a mismatch) — say so and close the gap if it's cheap.

4. **Fix the valid ones.** Keep each fix minimal and scoped so the user can review and commit it separately. Do not add comments explaining the fix. Do not touch git. Pre-existing on main is no bar when the fix is a no-brainer — include it. Anything notable left unfixed, inside or outside the branch's changes, gets listed plainly in the wrap-up so the user can decide what to do with it (this repo has no debt register).

5. **Recognize bug classes.** If a valid finding is an instance of a pattern that likely recurs (e.g. float math or `Math.*` calls leaking into `sim/` in violation of the determinism contract — ARCHITECTURE.md §4 — or render-layer state being read by sim code), say so and offer a codebase-wide sweep as a follow-up.

## CI failures

The only workflow is `deploy.yml` (Deploy to GitHub Pages), which runs `npm ci`, `npm test`, and `npm run build` — and it triggers only on push to `main`, so PRs usually have no checks. When checks do exist (or the user points at a failed deploy run), the same verdict-first flow applies:

1. `gh pr checks <n> --json name,state,bucket,link` — each `"bucket": "fail"` entry is a triage item. For a failed run on `main`, use `gh run list --workflow deploy.yml` and `gh run view <id>` instead. The results describe the pushed head: if the local branch has moved past it, judge against what was pushed and say so. Don't wait on `pending` checks — report them as still running.
2. Get the failure detail: `gh run view --job <job-id> --log-failed` (noisy — grep for the failing step's output), or `gh api repos/{owner}/{repo}/check-runs/<job-id>/annotations` for just the annotations.
3. Verdict per failing check: **actionable** (the branch broke it — fix it, minimal and scoped, like a valid comment), **not actionable** (infra flake or pre-existing on main — say why; a rerun is the user's call, and the no-brainer-fix rule from the protocol still applies), or **stale** (already fixed by unpushed local work — say it turns green on push).
4. Reproduce locally with the same commands CI runs: `npm test` (vitest) and `npm run build` (which runs `tsc --noEmit` first).

## Batch mode

When there are multiple items to triage — comments, failing checks — investigate them concurrently with one subagent per item (each returns: item, code evidence, proposed verdict), then present all verdicts together before fixing. Wait for the user's go-ahead if any verdict is debatable; apply clearly-valid fixes directly.

## Reply & resolve (opt-in)

Only on explicit user request — replies post under **the user's GitHub account**, so this is never done as part of plain triage.

1. Write one concise reply per unique concern to a scratchpad file (avoids shell-quoting issues): the verdict ("Fixed: …" / "Not valid: …") plus the one-paragraph reasoning. Duplicated concerns get the same text in each of their threads. End every reply with the attribution line:

   `— written by Claude Code, reviewed and approved by @<login>` (login from `gh api user --jq .login`)

2. Post a reply to **every unresolved thread**, including duplicates:
   `gh api repos/{owner}/{repo}/pulls/<n>/comments/<thread-root-id>/replies -F body=@<file>`

3. Resolve the threads (GraphQL only; REST has no thread resolution):
   - Map threads: `gh api graphql -f query='query { repository(owner: "...", name: "...") { pullRequest(number: <n>) { reviewThreads(first: 50) { pageInfo { hasNextPage endCursor } nodes { id isResolved comments(first: 1) { nodes { databaseId } } } } } } }'` and match each node's first `databaseId` to the thread roots. Resolved threads count toward the 50 — if `hasNextPage` is true, fetch the rest with `after: "<endCursor>"`.
   - Cross-check counts: threads found here must equal threads replied to — a mismatch means a missed duplicate or an unpaginated thread list.
   - Per thread: `gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<id>"}) { thread { isResolved } } }'`

4. Wrap up by reminding the user: fixes are still uncommitted ("Fixed" replies become true once they commit and push), and automated reviewers may re-evaluate findings that get pushback replies — follow-ups are worth a look if the bot argues rather than concedes.
