#!/usr/bin/env bash
# Create-or-update the single marked PR-preview comment (design D7/D10):
# one comment per PR, updated in place, found by its HTML marker.
# Usage: sticky-comment.sh <pr-number> <body>   (needs GH_TOKEN)
set -euo pipefail

PR="$1"
BODY="$2"
MARKER='<!-- pr-wave-preview -->'

EXISTING=$(gh api "repos/${GITHUB_REPOSITORY}/issues/${PR}/comments" --paginate \
  --jq ".[] | select(.body | startswith(\"${MARKER}\")) | .id" | head -1)

if [ -n "$EXISTING" ]; then
  gh api -X PATCH "repos/${GITHUB_REPOSITORY}/issues/comments/${EXISTING}" \
    -f body="$BODY" --jq '.id'
  echo "updated comment ${EXISTING} on PR #${PR}"
else
  gh api "repos/${GITHUB_REPOSITORY}/issues/${PR}/comments" \
    -f body="$BODY" --jq '.id'
  echo "created comment on PR #${PR}"
fi
