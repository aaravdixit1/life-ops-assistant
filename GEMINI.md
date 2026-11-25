# Project Rules & Architectural Invariants

## Core Constraints
- **Zero Cost ($0/mo):** Never introduce paid APIs or cloud hosting dependencies. Use Docker locally (`pgvector/pgvector:pg16`), local OpenAI-compatible endpoints (MLX/Ollama on Apple Silicon), and the Google AI Studio Free Tier (`GEMINI_API_KEY`).
- **Standalone Runtime:** Keep runtime execution completely independent of Antigravity. All background polling and scheduling must run via Python `APScheduler` inside `backend/`.
- **Canvas Token Workaround:** Student Personal Access Tokens are blocked. Never rely on a static Canvas API token. Always use the two-layer ingestion design:
  1. Unattended private `.ics` feed polling (`canvas_ics.py`) for due-date shifts and new/deleted assignments.
  2. Playwright persistent browser context (`canvas_pw.py` with `storageState.json`) for deep assignment descriptions, announcements, and course files—failing gracefully to `.ics`-only mode when SSO cookies expire.

## Autonomy & Safety Guardrails ("No Unnecessary Changes")
- **Passive Sync by Default:** Background jobs update Postgres state silently. Never modify live Google Calendar events or Google Tasks during routine ingestion.
- **Scoped Auto-Edits:** The assistant may ONLY auto-modify calendar events/tasks tagged with `source="life_ops_study_block"` when a Canvas due date shifts. Every automated write MUST insert a record into `autopilot_logs` with a complete `rollback_payload` JSON for 1-click Undo.
- **Confirmation Required:** Any change affecting fixed class schedules, work shifts, family calendars, or external appointments (e.g., orthodontist) must generate a proposed diff preview in the UI and wait for explicit user approval.

## Frontend Design, Coolors.co & Impeccable UI Standards
- **Design Standards:** Follow Impeccable UI and typography standards when planning, building, colorizing, or auditing `frontend/` UI components.
- **Coolors.co Palette Engine + OKLCH Derivation:**
  - Support importing any **Coolors.co URL** (`https://coolors.co/<hex1>-<hex2>-...`) or dash/comma-separated hex string directly in the dashboard's Theme Settings drawer and persisting it to `localStorage`.
  - Parse the imported hex swatches into OKLCH CSS custom properties (`--bg-base`, `--bg-elevated`, `--border-hairline`, `--accent-primary`, `--accent-secondary`, `--semantic-success`, `--semantic-warning`, `--semantic-danger`), deriving low-chroma tinted neutral surfaces and WCAG AA+ foreground contrast so any Coolors palette renders cleanly in both Light and Dark modes.
  - Ship with 3 built-in Coolors-compatible starter presets (`https://coolors.co/1c1917-d97706-65a30d-dc2626-0284c7`, `https://coolors.co/0f172a-14b8a6-eab308-f97316-6366f1`, `https://coolors.co/18181b-eab308-10b981-ef4444-3b82f6`).
- **Typography & Layout Anti-Patterns:**
  - Do NOT use `Inter`, `Roboto`, or `Arial`. Pair a distinctive geometric/humanist UI font (e.g., `Plus Jakarta Sans` or `DM Sans`) with `JetBrains Mono` strictly for tabular numbers, timestamps, and schedule diffs.
  - Avoid generic nested cards and symmetrical icon grids. Use clean hairline dividers, left-aligned asymmetric layouts, subtle 1px borders, and semantic badges so schedule shifts, conflicts, and Undo actions stand out immediately.

## Git & GitHub Version Control Rules
- **Secret & Harness Protection (Strict):** Never commit `.env`, `credentials.json`, `token.json`, `storageState.json`, `postgres_data/`, `.agents/`, `skills-lock.json`, or ephemeral `.impeccable/` cache files. Maintain a comprehensive `.gitignore` preventing sensitive credentials or agent traces from leaking to git.
- **Milestone Commits:** After passing verification (`pytest` / `npm run build`) for each milestone, stage and create a local commit using **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`) with a concise bulleted summary.
- **Human-Readable Change Log:** Maintain a root `CHANGELOG.md` and append a dated entry under `[Unreleased]` after every completed milestone.
- **Push Policy:** Create local commits automatically at milestone checkpoints, but pause and ask before running `git push` so the user can review diffs in the VCS Review panel first.

## Verification Loop
- After implementing each module, run backend `pytest` / syntax checks and frontend `npm run build` before marking a task complete.
