#!/bin/bash
# Removes build artifacts, runtime data, and dev-only files before zipping/shipping source.
# Safe to run — does NOT delete .env, certs, or source code.

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Cleaning build artifacts..."
rm -rf node_modules dist server/dist

echo "Cleaning runtime data..."
rm -rf data logs
find uploads -mindepth 2 -type f -delete 2>/dev/null || true

echo "Cleaning dev-only files..."
rm -rf temp .claude
rm -f eng.traineddata
rm -f documentation/Slimbooks-Code-Review-*.docx

echo "Cleaning secrets and credentials..."
rm -f .env
rm -rf certs

echo "Done. Safe to zip."
