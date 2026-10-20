#!/usr/bin/env bash
# Fails when a workflow or composite action uses a third-party action by a
# mutable ref (a tag or branch can be moved to run someone else's code with our
# deploy secrets). Every `uses:` must be a local ./ action or owner/repo@<40-hex SHA>,
# with the version as a trailing comment. Dependabot (github-actions) bumps them.
set -euo pipefail
cd "$(dirname "$0")/../.."

bad=$(grep -rnE '^[[:space:]]*(-[[:space:]]*)?uses:' .github/workflows .github/actions \
  | grep -vE 'uses:[[:space:]]*["'"'"']?\./' \
  | grep -vE 'uses:[[:space:]]*["'"'"']?[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+@[0-9a-f]{40}["'"'"']?([[:space:]]|$)' \
  || true)

if [ -n "$bad" ]; then
  echo "Actions not pinned to a full commit SHA:"
  echo "$bad"
  echo "Pin with: git ls-remote https://github.com/<owner>/<repo> refs/tags/<tag> (use the ^{} SHA for annotated tags)."
  exit 1
fi
echo "All actions are pinned to commit SHAs."
