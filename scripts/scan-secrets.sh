#!/usr/bin/env bash
# Scan the working tree and git history for secrets before pushing.
# Runs gitleaks in Docker, so nothing is installed globally.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest git /repo --redact --verbose
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest dir /repo --redact --verbose
