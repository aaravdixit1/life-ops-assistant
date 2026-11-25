#!/usr/bin/env bash

# Life-Ops Assistant Runner
# Usage:
#   ./run.sh setup         # One-time setup: .env, Postgres Docker, Python .venv, DB schema, npm deps
#   ./run.sh               # Starts Postgres, FastAPI (:8000), and Next.js (:3000)
#   ./run.sh backend       # Starts only the FastAPI backend (:8000)
#   ./run.sh frontend      # Starts only the Next.js frontend (:3000)
#   ./run.sh canvas-login  # Opens Canvas SSO login helper to cache Playwright cookies
#   ./run.sh test          # Runs backend pytest + frontend unit tests
#   ./run.sh build         # Builds the Next.js frontend production bundle
#   ./run.sh stop          # Frees ports 8000, 3000, 3001 from background processes

MODE="${1:-all}"
exec node scripts/dev.mjs "$MODE"
