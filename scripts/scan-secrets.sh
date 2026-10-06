#!/usr/bin/env bash
# Scan what can be pushed for secrets: the git history and any staged changes.
# Runs gitleaks in Docker, so nothing is installed globally. Build output and other
# gitignored files are never scanned: they can't be pushed.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest git /repo --redact --verbose
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest git /repo --staged --redact --verbose
