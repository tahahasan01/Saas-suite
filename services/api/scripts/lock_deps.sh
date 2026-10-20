#!/bin/sh
# Regenerate services/api/requirements.lock: every runtime dependency at an
# exact version with its sha256 hashes, resolved for the API image's platform
# (CPython 3.12, linux x86_64 — not the dev machine). The Dockerfile installs
# it with `pip --require-hashes`, so a tampered or swapped wheel fails the
# build. Run after any edit to requirements.txt; tests/core/test_dependency_lock.py
# fails until you do.
#
#   sh services/api/scripts/lock_deps.sh
set -eu
cd "$(dirname "$0")/.."
# Git Bash on Windows: hand docker a Windows path and stop MSYS rewriting /w.
SRC=$(pwd -W 2>/dev/null || pwd)
MSYS_NO_PATHCONV=1 docker run --rm -v "$SRC:/w" -w /w python:3.12-slim-bookworm sh -c '
  pip install -q --root-user-action=ignore uv==0.9.5 &&
  uv pip compile requirements.txt --generate-hashes --no-header \
     --python-version 3.12 --python-platform x86_64-manylinux_2_28 \
     -o requirements.lock'
echo "requirements.lock updated"
