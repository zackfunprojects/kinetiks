#!/usr/bin/env bash
# Apply main-branch protection requiring Vercel deploy checks.
#
# Run once, after a Vercel project is set up. Requires gh CLI auth with
# admin scope on the repository (zackfunprojects/kinetiks). The harness
# blocks Claude from making this change automatically; run it manually
# when you're ready.
#
# What it does:
#   - Require status checks before merging into main
#   - Require BOTH Vercel deploys (kinetiks-id + harvest) to be green
#   - Require branches to be up-to-date with main before merging
#   - Block force-pushes and deletions on main
#
# Idempotent. Re-runnable.

set -euo pipefail

REPO="zackfunprojects/kinetiks"
BRANCH="main"

PAYLOAD="$(cat <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Vercel – kinetiks-id",
      "Vercel – harvest"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
)"

echo "Applying branch protection on ${REPO}:${BRANCH}..."
echo "$PAYLOAD" | gh api -X PUT "repos/${REPO}/branches/${BRANCH}/protection" --input -

echo ""
echo "Done. Verify in the GitHub UI: https://github.com/${REPO}/settings/branches"
