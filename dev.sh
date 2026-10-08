#!/usr/bin/env bash
# Runs a command inside a throwaway Node container with this folder mounted (the VPS has no global Node toolchain for this project).
#   ./dev.sh "npx tsc --noEmit"      ./dev.sh "npx jest"
cd "$(dirname "$0")"
exec docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e CI=1 -v "$PWD":/w -w /w node:24 sh -c "$1"
