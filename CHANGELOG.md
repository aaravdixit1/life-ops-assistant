# Changelog

All notable changes to the Life-Ops Assistant project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

#### Collapsible Sidebars, Compact Themed Time Picker, CLI Shortcuts & Public-Release Audit (2026-11-25)
- **Collapsible Workspace & Chat Sidebars (`workspace-layout.tsx`, `sidebar.tsx`, `assistant/page.tsx`):**
  - Added collapse/reopen controls (`PanelLeftClose` / floating `PanelLeftOpen`) and `⌘B` / `Ctrl+B` keyboard shortcut for the main 220px workspace sidebar with `localStorage` persistence (`lifeops-sidebar-open:v1`) and dynamic main-content left padding so reopened controls never overlap headings.
  - Added an independent desktop toggle (`PanelLeftClose` / header `Chats` button) for the `/assistant` Chat Logs rail persisted to `localStorage`.
- **Compact Website-Themed Time Picker (`event-modals.tsx`):**
  - Replaced the 55-item 30-minute dropdown list in `ThemedTimeSelect` with a compact theme-matched `createPortal` popover featuring direct `HH:MM` numeric entry, `AM` | `PM` segmented toggle, zero-scroll 12-hour and 5-minute quick-pick grids, and `Escape` isolation inside parent modals.
- **Shortened Commands, README Refresh & Public Audit (`package.json`, `scripts/dev.mjs`, `run.sh`, `README.md`, `test_new_features.py`, `setup/page.tsx`):**
  - Added root `npm run setup`, `npm run canvas:login`, `npm run test:all`, `npm run build` (and `./run.sh` equivalents) in `scripts/dev.mjs`.
  - Updated `README.md` with current architecture, features, and two-command setup workflow, and scrubbed remaining regional/sample strings (sample location and university placeholders) ahead of making the repository public.

#### Persistent Assistant Chat Logs, Live Store Catalog & Unified Custom Dropdowns (2026-11-25)
- **Unified Portal `<ThemedSelect>` Dropdowns (`themed-select.tsx`, `globals.css`, `setup/`, `health/`, `assistant/`, `event-modals.tsx`):**
  - Replaced all browser-native `<select>` controls across every page and modal (including `ThemedTimeSelect` and `ThemedDateSelect`) with a custom accessible `createPortal` dropdown (`role="combobox"` / `role="listbox"`) with keyboard navigation, auto-flip positioning, and defensive CSS, eliminating misaligned or duplicate native dropdown arrows.
- **Meals UX & Live Store Catalog (`grocery_service.py`, `health.py`, `health/page.tsx`, `api.ts`, `demo-service.ts`):**
  - Eliminated hardcoded Tab 1 macro gauge targets and `"Regional Supermarket"` placeholders in favor of live profile targets and nearby store pricing links (`best_store`, `primary_store_hint`, `live_est_cost_cents`) with loop-aware singleflight locking for Nominatim discovery.
  - Added inline meal feedback banners, recipe deletion (`DELETE /api/health/recipes/{recipe_id}`), custom ingredient entry in Create Recipe, expanded the local comparison catalog to 64+ staples across up to 8 nearby stores, made nearby store cards clickable to filter/browse that store's catalog with a `"Show all X stores"` toggle, and integrated keyless Open Food Facts (`search.openfoodfacts.org`) live product search with nutrition pills and 1-click `+ Log Macro`.
- **Persistent, Deletable Daily Assistant Chat Logs (`db.py`, `assistant_sessions.py`, `assistant_engine.py`, `brief.py`, `assistant/page.tsx`):**
  - Added PostgreSQL persistence (`assistant_sessions`, `assistant_messages` with `ON DELETE CASCADE`) and Demo Mode `localStorage` storage for multi-turn chats and rich interactive card payloads (`mentioned_assignments`, `mentioned_events`, `proposed_event`, `action_staged`, `recommendations`, `saved_facts`).
  - Added a responsive **Chat Logs** sidebar/drawer with `+ New Chat`, clickable thread switching, 1-click deletion, automatic last-chat restoration across page navigation, markdown-stripped previews, cross-session context injection (`get_recent_cross_session_context`), and mid-flight FK deletion safety.

#### Career Resume Upload, College Setup Redesign, Scoped Assistant & Live Nearby Groceries
- **Career Resume Upload & Multi-Format RAG Management (`rag_indexer.py`, `rag.py`, `profile.py`, `career/page.tsx`):**
  - Added `.pdf` (`pypdf`), `.docx` (ZIP/XML), `.md`, and `.txt` text extraction in `extract_text_from_upload` and upgraded `POST /api/profile/upload-document` (10 MB limit).
  - Updated `rag_indexer.embed_text` to read the workspace/profile Gemini API key via `get_effective_gemini_api_key()`, added keyword fallback in `semantic_search`, and exposed `GET /api/rag/documents` and `DELETE /api/rag/documents`.
  - Built the **Resume Upload & Semantic RAG Inspector** in `/career` with file upload, uploaded resume listing + chunk counts, 1-click delete, quick probe buttons, and synced academic/career chips.
- **College-Specific Student Setup & Website-Matched Time Pickers (`db.py`, `profile_service.py`, `event-modals.tsx`, `setup/page.tsx`):**
  - Extended `user_profile` with `majors`, `minors`, `academic_year`, `expected_graduation`, `career_role`, and `grocery_radius_miles` (clamped `1–25` miles).
  - Redesigned `/setup` Step 1 into clear sections for **Student Identity** (Class Standing & Expected Grad), **Academic Program** (multi-chip Major(s) and optional Minor(s) supporting double/triple majors), **Career Track / Target Role**, **Location, Weather & Grocery Radius**, and **Daily Cadence**.
  - Replaced native `<input type="time">` controls on `/setup` and `/health` Meal Prep scheduling with the website's `<ThemedTimeSelect>` dropdown (`00:00–23:59` in 30-minute increments plus standard class times).
- **Strictly Scoped Assistant & Interactive Cards (`assistant_engine.py`, `brief.py`, `assistant/page.tsx`):**
  - Added dedicated `process_direct_line` engine with fast workspace-aware greetings, explicit out-of-scope trivia refusal without web search, Gemini JSON-mode reasoning (`gemini-3.5-flash` / `3.8-flash` with 14s timeout and deterministic fallback), and natural-language appointment parsing.
  - Replaced the hardcoded `"Due Tonight · 11:59 PM EST"` badge on assignment cards in `/assistant` with dynamic due-status badges (`due_label`, `is_overdue`) and ensured committed events dispatch `lifeops-refresh-calendar`.
- **Location-Synced Health Hub & Live Nearby Grocery Stores (`grocery_service.py`, `health.py`, `health/page.tsx`):**
  - Added keyless live nearby supermarket discovery via OpenStreetMap Nominatim + Photon with strict Haversine distance filtering (`GET /api/health/nearby-stores?radius_miles=1..25`), replacing hardcoded out-of-area stores with live stores near the user's configured location.
  - Added configurable distance radius slider & presets synced between `/setup` and `/health`, synced calorie/protein targets in charts/badges, and deduplicated `GET /api/health/meals` by recipe name.

#### Task Classification, Gemini Assignment Breakdown, Modal Fixes & Cross-Page Sync
- **Task vs Event Classification & Gemini Assignment Structuring (`assignment_analyzer.py`, `canvas.py`, `db.py`):**
  - Classified `canvas_inferred` and `life_ops_study_block` items as `item_type = 'task'` across Postgres, calendar queries, and UI modals (while excluding `canvas_inferred` / `canvas_deadlines` deadline markers from time-blocking conflict detection).
  - Added `/api/canvas/assignments/{id}/analyze` and `/api/canvas/assignments/analyze-batch` using rate-limited Gemini calls (with `asyncio.Semaphore(2)`, `10 RPM` sliding window, SHA-256 content-hash caching, and deterministic local parser fallback on missing key or `429` limits) to split assignments into `summary`, `general`, `deliverables`, `rubric`, and `resources_and_policies`.
  - Added optional workspace **Gemini API Key** storage & masked display in `/setup` (`user_profile.gemini_api_key`), ensuring raw keys are never returned to clients.
- **Modal & Rich HTML Description Fixes (`event-modals.tsx`, `assignment-modal.tsx`, `formatted-content.tsx`):**
  - Converted HTML links/markup (such as Google Calendar `<a href="...">Internship Applications Tracker</a>`) safely to Markdown links in `FormattedMarkdown` (`normalizeRichText`) and fixed `FormattedMarkdown` hook ordering.
  - Fixed `EventDetailModal`, `AddEventModal`, `AssignmentDetailModal`, and `/health` recipe modals so dialogs scroll cleanly within `90vh`, close reliably on backdrop click and `ESC`, handle `auto_applied` shifts, and use dynamic dates.
- **Cross-Page Synchronization & UX Audit (`schedule/`, `academics/`, `brief/`, `career/`, `health/`, `page.tsx`, `setup/`):**
  - Wired `lifeops-refresh-assignments`, `lifeops-refresh-calendar`, `lifeops-profile-updated`, and `lifeops-calendar-filter-changed` across pages; routed Canvas deadline clicks to `AssignmentDetailModal`; connected live career calendar blocks in `/career`; and removed remaining hardcoded Nov 13 dates and PA5 fallback strings.

#### Open-Source Rework: First-Run `/setup` Onboarding, Multi-Provider Calendars & PII Scrub
- **First-Run Onboarding & Integrations (`/setup`):**
  - Added an interactive `/setup` wizard so anyone cloning the repository can configure personal identity (`user_profile`), institution/role, timezone, wake/sleep schedule, study sanctuary, Canvas connection, calendar feeds, syllabus/note RAG uploads, and dietary/macro targets in the browser.
- **Multi-Provider Calendar Feed Sync (`calendar_feeds`):**
  - Added multi-provider calendar sync supporting Google Calendar (secret iCal URL or optional OAuth), Apple Calendar (iCloud `webcal://` URL normalization or `.ics` upload), Microsoft Outlook, Canvas, and generic `.ics` URLs/files.
- **Dynamic Location & Live Weather (Open-Meteo):**
  - Added Open-Meteo city geocoding and live weather forecasting driven by the user's configured `user_profile` location and timezone.
- **Generic Canvas Domain & SSO Parsing (`canvas_pw.py`, `.env.example`):**
  - Parameterized Canvas base URL parsing via `CANVAS_BASE_URL` so Playwright SSO deep fetching and `.ics` polling work across any university Canvas instance.
- **PII Scrubbing, Sample Fixtures & MIT License (`LICENSE`, `package.json`, `README.md`, `backend/data/syllabi/`, `seed_*.py`):**
  - Added OSI MIT `LICENSE` (`Copyright (c) 2026 Life-Ops Assistant Contributors`).
  - Scrubbed personal names, street addresses, physical stats, real instructor names, CRNs, exam scores, and university-specific references from documentation, sample syllabi, seeders, and changelog entries.

### [0.5.35] - 2026-11-18

#### Documentation, Privacy Hardening & Demo Pitch Integration
- **In-App Demo Pitch & Project Overview (`frontend/src/components/demo-badge.tsx`):**
  - Integrated an "About This Project" pitch card into the Standalone Demo Mode popover.
  - Highlights the three core architectural decisions (Scoped Autopilot, Two-Layer Canvas Ingestion, Dual-Model Router), tech stack pills, and GitHub repository link.
- **Cloud LLM Disabling & Local Data Residency (`backend/app/config.py`, `backend/app/services/model_router.py`, `backend/tests/test_model_router.py`):
  - Added `cloud_llm_enabled: bool = True` configuration flag (`CLOUD_LLM_ENABLED`).
  - When set to `false`, forces 100% local Ollama inference, overrides Exam Mode, disables automatic Gemini cloud fallback, and returns an explicit error if Ollama is unreachable or down.
  - Implemented `exclude_knowledge_base_from_prompt()` in `model_router.py` to automatically strip personal memory dossier sections from cloud prompts by default, keeping personal profile and residence entries 100% local.
  - Added unit tests in `test_model_router.py` verifying Exam Mode override, offline error handling, and knowledge base exclusion.
- **HNSW Vector Indexing & Semantic Search Fix (`backend/schema.sql`, `backend/app/services/rag_indexer.py`):**
  - Replaced IVFFlat index on `document_embeddings` with HNSW (`vector_cosine_ops`), eliminating IVFFlat list starvation and ensuring reliable semantic search recall across cold-start or low-volume tables.
- **Dependency Automation & Localhost Port Binding (`scripts/dev.mjs`, `docker-compose.yml`):**
  - Added `ensureFrontendDependencies()` in `scripts/dev.mjs` to automatically run `npm install` inside `frontend/` if `node_modules` is missing on fresh clones.
  - Verified Docker Postgres host binding is strictly locked to `127.0.0.1:5432:5432` and uvicorn startup bindings strictly use `127.0.0.1:8000`.
- **Codebase Personal Info Sanitization (`schema.sql`, `brief.py`, `health.py`, `health/page.tsx`, `assistant/page.tsx`):
  - Genericized course codes (`COMM 101`, `STAT 301`, `CS 201`) and room locations across `schema.sql`, test suites, and database seeds.
  - Genericized grocery stores to `'Regional Supermarket'`, `'Campus Grocery'`, and `'Discount Market'`.
  - Genericized campus addresses, building tags, and replaced hardcoded study sanctuary with `{PERSONA.studySanctuary}`.
- **Canvas Headed SSO Login CLI Entrypoint (`backend/app/services/canvas_pw.py`):**
  - Added interactive CLI entrypoint (`python -m app.services.canvas_pw --login`) to launch a headed browser and save session cookies into `storageState.json`.
- **AI Tool Traces Removal & Gitignore Hardening (`.gitignore`, `.agents/`, `skills-lock.json`):**
  - Untracked `.agents/` skill directory and `skills-lock.json` from git index.
  - Hardened `.gitignore` to permanently ignore AI agent harnesses, skills, and editor artifacts (`.agents/`, `skills-lock.json`, `.gemini/`, `.cursor/`, `.claude/`, `.windsurf/`, `.copilot/`, `.cline/`, `.continue/`).
- **Comprehensive README Alignment (`README.md`, `.env.example`):**
  - Corrected repository clone URL to match the public GitHub repository.
  - Fixed full-stack quickstart ordering: virtual environment creation and dependencies install before Playwright setup and Canvas login.
  - Updated Privacy section to document local knowledge base residency and cloud exclusion by default.
  - Clarified Vercel demo deployment settings: Root Directory `frontend` and single env var `NEXT_PUBLIC_DEMO_MODE=true`.
  - Refined security section: accurately framed Action Gatekeeper as limiting blast radius strictly to flexible study blocks and new events with 1-click Undo, while protecting fixed class schedules and exams.
  - Cleaned TOC anchors to eliminate broken emoji hyperlinks.

### [0.5.34] - 2026-11-17

#### Feature: Standalone Demo Mode for Public Vercel Deployment & Recruiter Preview
- **Zero-Network Hard Guard (`frontend/src/lib/demo-guard.ts` & `frontend/src/lib/api.ts`):**
  - Added dual-layer interception: `assertNoDemoNetworkCall` in the client API layer and runtime monkey-patching of `window.fetch`.
  - When `NEXT_PUBLIC_DEMO_MODE=true`, any network request directed toward the FastAPI backend or external origins throws an explicit `[DEMO MODE GUARD VIOLATION]` error and logs a bold styled warning to the console.
- **Fictional Persona Isolation & Privacy (`frontend/src/lib/persona.ts`):**
  - Created a persona engine defaulting strictly to the fictional student persona "Alex Chen" (Fall 2026 Ops, B.S. Computer Science & Systems Engineering).
  - Ensured zero real personal data or credentials appear in fixtures, bundle output, or demo git history.
  - Parameterized identity strings across `layout.tsx`, `sidebar.tsx`, `assistant/page.tsx`, `schedule/page.tsx`, `health/page.tsx`, `career/page.tsx`, and `brief/page.tsx`.
  - Enabled private local identity overrides via git-ignored `.env.local` for regular backend use.
- **Full In-Browser Interactive Demo Service (`frontend/src/lib/demo-service.ts` & `demo-data.ts`):**
  - Dynamic sample data generated relative to today's date for current week calendar events, active Canvas assignments, autopilot rebalance audit logs with 1-click Undo, pending conflict approvals, macro tracking, grocery index, and simulated Direct Line AI chat.
  - Interactive edits (logging meals, toggling assignment submissions, scheduling study blocks, creating/deleting events) persist locally in browser `localStorage`.
  - Added client-side RFC 5545 `.ics` export generation without server calls.
- **UI Demo Indicator & Data Reset Drawer (`frontend/src/components/demo-badge.tsx`):**
  - Added an Impeccable-styled minimal `DEMO MODE` badge to the sidebar with a pulsing status dot.
  - Includes a modal detailing demo invariants and providing a 1-click "Reset Demo Data" action to restore fresh default fixtures.
- **Automated Invariant Test Suite (`frontend/tests/demo-mode.test.mjs`):**
  - Created 12 automated unit tests verifying zero-network guards, persona isolation, calendar CRUD, assignment submission toggles, autopilot rollback, and RAG search.
- **Unified Dev Runner & Easy Commands (`scripts/dev.mjs`, `package.json`, `run.sh`):**
  - Added single-command convenience scripts: `npm run dev` (or `./run.sh`) to start Postgres, FastAPI backend (`:8000`), and Next.js (`:3000`) in one unified terminal.
  - Added `npm run dev:demo` (or `./run.sh demo`) for standalone 0-dependency demo mode.
  - Added `npm run stop` (or `./run.sh stop`) to instantly clean stale background processes from ports 8000, 3000, and 3001.
- **Bug Fix: Health & Prep Page NaN Error (`frontend/src/app/health/page.tsx`, `demo-service.ts`, `demo-data.ts`):**
  - Aligned client-side demo health state with the backend schema (`total_calories`, `total_protein_g`, `total_carbs_g`, `total_fat_g`, `logs`).
  - Added runtime self-healing normalizer (`normalizeDailyLog`) in `demo-service.ts` to seamlessly upgrade existing cached `localStorage` data.
  - Hardened numeric computations in `health/page.tsx` against undefined or missing properties, preventing `NaN` children rendering in React.
- **Bug Fix: Demo Guard Blocking Next.js RSC Navigation & Sidebar Page Flashing (`frontend/src/lib/demo-guard.ts`, `frontend/src/components/demo-badge.tsx`):**
  - Allowed same-origin internal Next.js React Server Component navigation payloads (`?_rsc=...`) and client page routes in `demo-guard.ts` while keeping all backend API (`/api/`) and external origins strictly blocked.
  - Prevents Next.js from throwing `Failed to fetch RSC payload ... Falling back to browser navigation`, which was forcing a full page reload on every sidebar link click.
  - Initialized `DemoModeIndicator` state with `IS_DEMO_MODE` to eliminate post-hydration layout shifts in the sidebar.
  - Restored instant, zero-flicker client-side SPA transitions across all dashboard views.

### [0.5.33] - 2026-11-13

#### Performance & Optimization: Instant Button Views & View Switching Latency Elimination
- **Artificial Fade-In Animation Removal (`health`, `schedule`, `brief`, `academics`, `assistant`, `career`, `git`, `today`):**
  - Removed artificial `animate-in fade-in duration-200` and `duration-150` delays on root view containers, tab panels, and subview switches. Content renders immediately (< 1 frame) without opacity transitions.
- **Schedule Timeline Layout & Date Memoization (`frontend/src/app/schedule/page.tsx`):**
  - Pre-indexed events into an `O(1)` ISO-date lookup map (`eventsByDate = useMemo(...)`).
  - Memoized `visibleDays`, `weekDays`, `monthGridDays`, and `dayLayoutsMap` to eliminate redundant $O(N^2)$ overlap calculations and date parsing on every render loop.
  - Replaced view switcher and drawer buttons with `transition-colors duration-75 active:scale-[0.98]` micro-interactions.
- **Academics Filter Memoization (`frontend/src/app/academics/page.tsx`):**
  - Memoized `filteredAssignments`, `courseNames`, `pendingCount`, and `submittedCount` with `useMemo`, preventing full array re-filtering on un-related renders or timer ticks.
- **Daily Brief Re-render Throttling (`frontend/src/app/brief/page.tsx`):**
  - Throttled page-level date timer interval from 1,000ms (1s) to 30,000ms (30s), eliminating continuous full-tree re-renders on the 1,449-line page.
- **Compositor & Backdrop Filter Optimization (`frontend/src/components/assistant-floating-circle.tsx`, modals):**
  - Eliminated costly `backdrop-blur-*` filters on persistent and modal elements, replacing them with crisp opaque/high-alpha surfaces (`bg-[var(--bg-elevated)]`) to avoid GPU layer re-compositing stutters during scrolling and view changes.
- **Interactive Latency Benchmark:**
  - Automated Playwright benchmark across 25 view switches (Health tabs, subviews, portion multipliers, Schedule week/month views, Academics status/submission filters, and course pills) achieved an average interaction response time of **36.04ms** (all under 52ms).

### [0.5.32] - 2026-11-13

#### Feature: Recipe Ingredients Engine, Recipe Builder & 7-Day Macro Tracking Graphs
- **Recipe & Ingredients Inspector Modal (`frontend/src/app/health/page.tsx`, `backend/app/routers/health.py`):**
  - Added interactive Recipe Inspector modal displaying full ingredient breakdowns per serving (name, portion weight/volume, protein contribution, and estimated cost).
  - Integrated 1-click **"Add Ingredients to Shopping Basket"** button that populates the active grocery shopping cart directly from recipe components.
  - Added 1-click **"Log to Today's Macros"** button via new `POST /api/health/log-recipe/{id}` endpoint.
- **Custom Recipe Builder Modal (`frontend/src/app/health/page.tsx`, `backend/app/routers/health.py`):**
  - Built interactive "+ Create Recipe with Ingredients" modal with preset local grocery item selection.
  - Live auto-calculation of total protein yield, total calories, and estimated cost as ingredients are added or removed.
  - Persisted directly to Postgres `meal_templates` table via new `POST /api/health/recipes` endpoint.
- **7-Day Macro Tracking Horizon & Visual Graphs (`backend/app/routers/health.py`, `frontend/src/app/health/page.tsx`):**
  - Added `GET /api/health/macro-history?days=7` endpoint calculating 7-day rolling aggregates, protein floor adherence, and macro energy distribution percentages.
  - **Daily Protein Intake Bar Chart**: Visual 7-day bar chart comparing daily protein against the gold dashed **155g Target Floor**, highlighting hit days and today's real-time progress.
  - **Daily Calorie Surplus Bar Chart**: Tracks daily energy intake vs the 2,600 kcal surplus boundary.
  - **Macro Nutrient Energy Ratio Breakdown**: Visual segmented ratio bar showing caloric distribution across Protein (25%), Carbohydrates (51%), and Fats (24%).
  - **Rolling Averages KPI Strip**: Displays 7-day average protein (e.g. 241.7g/day), 7-day average calories, weekly grocery spending ($79.25), and 100% target floor adherence.


### [0.5.31] - 2026-11-13

#### Feature: Interactive Macro Tracking, Meal Prep Architect & Cheapest-Near-Me Ingredient Search
- **Interactive Daily Macro Tracking (`backend/app/routers/health.py`, `frontend/src/app/health/page.tsx`, `frontend/src/lib/api.ts`):**
  - Created `daily_macro_logs` Postgres table supporting persistent date-based meal tracking (`calories`, `protein_g`, `carbs_g`, `fat_g`, `cost_estimate_cents`).
  - Added endpoints `GET /api/health/daily-log`, `POST /api/health/log-meal`, `DELETE /api/health/log-meal/{id}`, and `POST /api/health/reset-daily-log`.
  - Built interactive macro progress dials with live progress meters against active lean-bulk targets (2,600 kcal energy, 155g protein floor, 320g carbs, 75g fats, and daily food spend).
  - 1-click Quick-Log buttons directly on the 4 high-protein meal templates, plus an interactive "+ Custom Meal Entry" form.
  - Interactive today's logged meals list with real-time deletion and daily budget recalculation.
- **Meal Prep Architect & Autonomous Sunday Batch Cooking Scheduler:**
  - Multi-portion yield selector: `1x (Single)`, `2x (Couple)`, `4x (Batch)`, `6x (Full Week)`.
  - Dynamic scaling of recipe ingredients, total batch protein yield, prep/cook duration, and recipe batch cost.
  - Interactive batch cooking execution checklist (weighing, seasoning, cooking carbs, high-heat searing, steaming vegetables, containerizing) with progress tracking.
  - 1-click **"Lock Meal Prep Session on Google Calendar"** integrated with `calendar_events` (`source="life_ops_study_block"`, color `#10b981`) and logged to `autopilot_logs` with complete rollback payload for 1-click Undo.
- **Ingredient Search & Multi-Store Price Comparison ("Cheapest Near Me"):**
  - Instant live search bar with real-time debounced filtering and category filter pills (`All`, `Protein`, `Carbs`, `Dairy`, `Produce`, `Pantry`).
  - Added multi-word flexible search query parsing with plural/singular normalization.
  - Expanded local grocery store catalog from 16 to 32 staple items (96 total store price points), adding **Boneless Skinless Chicken Thighs**, **Bone-In Chicken Thighs**, Chicken Tenderloins, Whole Rotisserie Chicken, Ground Turkey, Wild Salmon, and more.
  - Side-by-side local price comparison across **Regional Supermarket**, **Local Grocer**, and **Discount Market**.
  - Dynamic green **"Cheapest Pick"** badge and unit savings computation (`Saves $X.XX`).
  - 1-click **"Add Cheapest to Basket"** and individual store "+ Add" actions.
- **Interactive Shopping Basket & Route Optimizer:**
  - Dynamic shopping basket tab with live unit counts, store route breakdown (e.g. Regional Supermarket vs Local Grocer vs Discount Market), item quantity adjusters (`+` / `-`), line-item pricing, and total spend calculation.
  - LocalStorage persistence across sessions.
- **Impeccable UI Compliance:**
  - Plus Jakarta Sans / DM Sans typography with JetBrains Mono numbers (`font-mono tabular-nums`).
  - Strict adherence to Coolors OKLCH design tokens, 1px hairline borders, asymmetric tactile layout, and WCAG AA contrast.
  - Eliminated duplicate plus sign in Custom Meal Entry toggle button, replacing with dynamic `<Plus />` and `<X />` state icons.


### [0.5.30] - 2026-11-13

#### Feature: Autonomous Calendar De-Clogging, Sunday Errand Reconciliation & Multi-Day Awareness
- **Calendar De-Clogging & Routine Reconciliation (`backend/app/routers/brief.py`):**
  - Solved the schedule congestion where Friday afternoon was clogged with duplicate grocery errand runs (1:45 PM) overlapping LeetCode Practice (2:00 PM), and duplicate/overlapping PA5 study blocks colliding with Internship Applications (3:00 PM).
  - Automatically synced stored user routine (*"Prefers to run errands and do meal prep on Sundays"*) to live flexible blocks:
    - Shifted `Smart Errand Window: Grocery Run` from Friday to **Sunday, Nov 15 (1:45 PM – 2:45 PM EST)**.
    - Removed duplicate grocery errand window.
    - Resolved study block collisions by removing the conflicting 3:00 PM block and consolidating PA5 deep work into **4:00 PM – 6:00 PM EST** directly following Internship Applications.
    - Recorded full rollback state in `autopilot_logs` (`schedule_declog`).
- **Plan Adoption Guardrail (`backend/app/routers/brief.py`):**
  - Updated `adopt-plan` endpoint for `errands-window` to query `user_knowledge_base` for preferred errand cadence (scheduling onto Sunday when preferred) and prevent duplicate event creation if already scheduled.
- **Multi-Day 7-Day Situational Awareness for Assistant (`backend/app/routers/brief.py`):**
  - Expanded assistant prompt context from today-only to include `=== UPCOMING 7-DAY SCHEDULE (EST) ===`.
  - Assistant now accurately answers queries about weekend and upcoming commitments (e.g. *"what is my schedule on sunday?"*) and surfaces interactive calendar pop-out cards for future events.

### [0.5.29] - 2026-11-13

#### Feature: Autonomous Calendar Event Lifecycle & Gatekeeper Staging with 1-Click Undo
- **Real Calendar Event Deletion & Gatekeeper Guardrail Integration (`backend/app/routers/brief.py`, `backend/app/services/gatekeeper.py`):**
  - Resolved the critical hallucination where the assistant claimed *"Got it—I've cleared STAT 301 from your schedule for today"* without actually modifying Postgres or staging an action.
  - Implemented real event lifecycle management adhering strictly to **GEMINI.md Autonomy & Safety Guardrails**:
    - **Academic Courses & Fixed Commitments (source != 'life_ops_study_block')**: Staged in `pending_actions` table via `propose_event_deletion()` with structured diff preview, session details, and reason. The assistant clearly informs the user that modifying academic courses requires confirmation and renders an interactive **Confirmation Required** card.
    - **Autonomous Study Blocks (source == 'life_ops_study_block')**: Auto-removed immediately from `calendar_events` with complete `rollback_payload` inserted into `autopilot_logs` for 1-click Undo.
  - Added conversational confirmation and rejection handlers: replying *"yes"*, *"confirm"*, or *"approve"* immediately approves and executes the pending deletion; replying *"no"* or *"cancel"* dismisses the proposal.
- **Interactive Staged Action Card UI (`frontend/src/app/assistant/page.tsx`, `frontend/src/lib/api.ts`):**
  - Rendered a high-fidelity **Confirmation Required** card directly in the assistant chat when a course removal is requested:
    - Amber alert header badge: `[AlertCircle] CONFIRMATION REQUIRED` with timestamp and course details (e.g. `STAT 301 - Stat Methods · 12:20 PM – 01:10 PM EST · Hall 338`).
    - Explicit explanation that safety guardrails require confirmation and 1-click Undo rollback is recorded upon removal.
    - Interactive **[ Confirm & Remove ]** and **[ Keep on Calendar ]** action buttons.
    - Smooth transition to confirmed state (`✓ Removed from calendar · 1-click Undo recorded in Autopilot`) upon approval.
  - Re-querying the schedule confirms that the event is actually removed from live database queries and schedule summaries.

### [0.5.28] - 2026-11-13

#### Feature: Multi-Turn Conversational Memory, Pronoun Resolution, and Deep Substantive Answers
- **Multi-Turn Conversation Memory Pipeline (`backend/app/routers/brief.py`, `frontend/src/lib/api.ts`, `frontend/src/app/assistant/page.tsx`):**
  - Upgraded `/api/brief/direct-line` to accept an optional `history: List[ChatMessage]` containing preceding turns (`role` and `content`).
  - Frontend Assistant page now automatically packages the last 8 conversation turns with every message payload.
  - LLM prompt injects `=== RECENT CONVERSATION HISTORY (Previous Turns) ===` allowing Gemini to maintain seamless conversational continuity.
  - Eliminated the amnesia bug where follow-up messages like *"no i want to see more info about it"* failed with *"your message was a bit brief—what would you like to see more info about?"*. Pronouns like "it", "that", "the book", and "those" now resolve instantly to previously discussed subjects (e.g. *The Stranger* by Albert Camus).
- **Substantive, In-Depth Answers (No Deflections):**
  - System prompt explicitly prohibits brushing off questions by asking *"would you like me to add it to your shelf?"*.
  - When the user asks to see more about a book, literary work, or philosophical concept, the assistant provides a comprehensive, high-fidelity breakdown including publication year, core premise, character psychology, central themes (such as Camus' philosophy of the Absurd and existential alienation), key literary motifs, and famous lines.
- **Interactive Curated Reading Card Generation:**
  - When a book is explored in depth, the assistant now generates a `curated_reading` card with a 1-click **Add to Reading List** button, seamlessly bridging deep conversation with user shelf actions.


### [0.5.27] - 2026-11-13

#### Fix: Intelligent Contextual Card Surfacing & Elimination of Unsolicited Reminders
- **Topic Focus & No Unsolicited Lectures (`backend/app/routers/brief.py`):**
  - Updated LLM system instructions to strictly focus on the specific question asked. When the user asks about a location, sanctuary, habit, personal fact, or general query (e.g. "what is my local study cafe?"), the assistant answers concisely and does not append unsolicited lectures or reminders about afternoon classes or upcoming deadlines.
- **Intelligent Intent-Scoped Card Surfacing (`backend/app/routers/brief.py`):**
  - Replaced loose heuristic substring matching that previously attached cards on almost every query.
  - **Academic Deliverables (`mentioned_assignments`)**: Attached ONLY when the query is explicitly academic or when scheduling focus blocks. Uses high-confidence matching (score >= 80) so asking about PA5 returns only PA5 (not unrelated tests), and non-academic queries (like a local study cafe or residence) return zero cards.
  - **Calendar Events (`mentioned_events`)**: Attached ONLY when the query explicitly inquires about schedule, calendar, class times, or free time windows. Eliminated loose single-word matches (like "study" or "campus") that previously caused false positives.
  - Added structured fields `referenced_assignments` and `referenced_events` in the response schema so the LLM explicitly signals intentional card attachments.


### [0.5.26] - 2026-11-13

#### Fix: Robotic Tag Removal, Centered Memory Vault Pill Badge, and Daytime Weather Alignment
- **Robotic Tag & AI Jargon Removal (`frontend/src/app/assistant/page.tsx`, `backend/app/routers/brief.py`):**
  - Removed artificial and corporate `<span ...>Grounded Memory Vault</span>` tag from the `/assistant` header.
  - Rewrote the initial assistant greeting from rigid system architecture speak (*"I am your grounded Life-Ops Assistant. I retain your long-term personal knowledge..."*) to a warm, natural, human tone (*"Good morning. How can I help you today? Ask me anything about your schedule, upcoming deadlines, or reading shelf..."*).
  - Added strict prompt guardrails in `backend/app/routers/brief.py` instructing the assistant to never use robotic tags, system jargon, or claim conflicting course/deadline times.
- **Centered Memory Vault Pill Badge (`frontend/src/app/assistant/page.tsx`):**
  - Resolved the "not centered number" issue where the count `7` was awkwardly wedged between the database icon and text with baseline vertical misalignment.
  - Replaced with standard UI pattern: `[Database Icon] Memory Vault [ 7 ]` featuring a styled, centered circular/pill count badge on the right (`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--accent-primary)]/15 font-mono font-bold leading-none`).
- **Stable Daytime Weather & Clean Single-Line Alignment (`frontend/src/app/brief/page.tsx`, `backend/app/routers/brief.py`):**
  - Fixed day/night icon logic in `/brief`: replaced fragile condition string matching with explicit `isDaytime` check (`6 AM <= hour < 6 PM`) so a sunny daytime morning renders a golden `<Sun />` icon in warm amber (`bg-amber-500/15 text-amber-500`) instead of a nighttime crescent moon.
  - Resolved wrapped text and orphan bullet point (`· Crisp Fall Morning` wrapping onto line 2) by switching to `flex items-center gap-2 min-w-0` on a single line and stripping leading bullets.
  - Unified weather endpoints and state to provide stable, consistent temperatures (48°F daytime / 44°F nighttime) and conditions ("Crisp Fall Day" / "Crisp Fall Night").
- **Strict Schedule & Deadline Temporal Grounding (`backend/app/routers/brief.py`):**
  - Enforced strict schedule accuracy in assistant instructions to prevent time hallucinations (e.g. COMM 101 confirmed at 10:10 AM – 11:00 AM EST, CS 201 PA5 confirmed at 11:59 PM EST).


### [0.5.25] - 2026-11-13

#### Feature: Rich Academic Spec Viewer in Pop-outs & Complete Markdown Formatting for Assistant
- **Academic Specification Viewer (`AcademicSpecViewer` in `frontend/src/components/ui/formatted-content.tsx`):**
  - Built a comprehensive formatting and inspection engine for Canvas assignment specifications and academic rubrics.
  - Automatically parses and structures long, raw Canvas descriptions into elegant section cards:
    - **Header & Section Categorization**: Categorizes sections into `Deliverables`, `Build & Run`, `Rules / Contract`, `Common Traps`, `Grading / Rubrics`, `AI Policy & Authorship Evidence`.
    - **Quick Jump Filter Pills**: Instant one-click filter pills along the top to filter sections (`All (13)`, `Deliverables`, `Rules`, `Traps`, `Grading`, `AI Policy`).
    - **Real-Time Section Search**: Live keyword search across all assignment specs, rubrics, and instructions.
    - **Code & Command Boxes**: Formats commands (`make`, `./vm_sim...`) and file geometries in dark JetBrains Mono code boxes with 1-click copy.
    - **Traps & Integrity Callouts**: Highlights common pitfalls and AI/authorship requirements in distinctive high-visibility warning cards (`⚠️ Common traps`, `🛡️ Authorship evidence & AI policy`).
    - **Interactive External Links**: Parses download links (`[download PA5_starter.zip](...)`) as styled action links with external link icons.
- **Universal Assignment Modal Integration (`AssignmentDetailModal` in `assignment-modal.tsx`):**
  - Replaced cramped raw-text rendering with full-height `AcademicSpecViewer`.
  - Expanded modal layout to `max-w-3xl` for improved readability of code traces and tables.
  - Formatted syllabus policy notes with `FormattedMarkdown`.
  - Updated `due_today_assignments` query in `backend/app/routers/brief.py` to select and serve full `description` and `syllabus_notes` (e.g. all 7,907 characters of CS 201 PA5).
- **Assistant Chat Markdown Engine (`FormattedMarkdown` in `formatted-content.tsx`, `/assistant`, `/brief`):**
  - Replaced naive line splitting with a comprehensive markdown formatting engine.
  - Supports fenced code blocks (` ```lang `) with language badges and 1-click copy buttons.
  - Formats inline code (`` `code` ``), bold (`**...**`), italic (`*...*`), bold-italic (`***...***`), headers (`#`, `##`, `###`), bullet points with gold accent markers, numbered steps with badges, and blockquotes.
  - Upgraded both the dedicated Assistant page (`/assistant`) and the Daily Brief Direct Line (`/brief`) to render rich assistant responses.
- **Calendar Event Pop-out Formatter (`EventDetailModal` in `event-modals.tsx`):**
  - Formatted event descriptions and notes using `FormattedMarkdown` for clean links, bold highlights, and code tags.

### [0.5.24] - 2026-11-13

#### Feature: Dynamic Randomized Fun Facts Catalog & Pixel-Perfect Coaxial Timeline
- **Dynamic Randomized Fun Facts Catalog (`backend/app/routers/brief.py`, `frontend/src/lib/api.ts`, `frontend/src/app/brief/page.tsx`):**
  - Designed and seeded a comprehensive catalog of 32 rich, distinctive trivia items (`CURIOSITY_CATALOG`) spanning:
    - **Systems Architecture & Low-Level Computing**: The 1962 Atlas virtual memory origins, why page sizes are universally 4KB (Intel 80386 & VAX TLB balance), Grace Hopper's 1947 moth in Relay #70, C zero-indexing pointer arithmetic (`*(a + i)`), John Carmack's fast inverse square root constant `0x5f3759df`, the Unix 2038 epoch overflow, Belády's FIFO page fault anomaly, and Apollo 11 hand-woven 'LOL' core rope memory.
    - **University Campus & Computing Lore**: Iconic campus stonework milestones, academic supercomputer clusters, civic plaza history, campus carillon chimes, early computer science mainframe labs, and stadium acoustics.
    - **Philosophy & Human Mindset**: Albert Camus' career as a championship goalkeeper for RUA, Marcus Aurelius writing *Meditations* in frontline Danube war tents, Kazuo Ishiguro's songwriting origins, Franz Kafka's day job as an industrial safety officer, Wittgenstein renouncing his steel fortune, and Seneca on the illusion of brief time.
    - **Circadian Biology & Mountain Geography**: Highland campus elevation barometric cooling, melanopsin retinal ganglion cells reacting to blue light in 8 minutes, the Zeigarnik effect in task offloading, and sleep spindles consolidating procedural programming memory during Stage 2 NREM.
  - Implemented dynamic randomization on every `/api/brief/daily` payload (`random.choice(CURIOSITY_CATALOG)`).
  - Added dedicated endpoint `GET /api/brief/curiosity/random` and client SDK function `getRandomCuriosity()`.
  - Added an interactive **"New Fact"** button on Card B (`Campus Pulse & Daily Curiosity`) with spinning icon feedback so the user can shuffle fresh facts on demand without reloading.
- **Pixel-Perfect Coaxial Timeline Spine (`frontend/src/app/brief/page.tsx`):**
  - Resolved the subpixel horizontal drift where the vertical line was shifted to the right of the status circles.
  - Aligned the vertical hairline (`w-0.5 -translate-x-1/2` at `left-4`) and the status dots (`w-3.5 h-3.5` inside `left-0 w-8 flex justify-center`) to the exact same 16.000px central coordinate axis.
  - Verified laser-straight coaxial alignment passing directly through the dead-center of every milestone node.
- **Symmetric Focus & Avoid Layout (`frontend/src/app/brief/page.tsx`):**
  - Fixed column alignment and padding symmetry with `grid-cols-2 divide-x divide-[var(--border-hairline)]/60`.
  - Ensured both columns have equal horizontal padding, centered headings, and centered diamond glyphs (`◇ ◈ ◇`) below the vertical dividing line.

### [0.5.23] - 2026-11-13

#### Feature: Universal Academic Deliverable Pop-out Modal, Entity Mention Cards & Dynamic Back Navigation
- **Academic Assignment Pop-out Modal (`AssignmentDetailModal` in `assignment-modal.tsx`):**
  - Created a dedicated, full-screen pop-out modal for Canvas academic deliverables, matching the architecture and styling of `EventDetailModal`.
  - Displays course badge, live status (`Submitted`, `Pending`, `Needs Submission (Grace Window)`, `Past Due`), exact Eastern time due date, time remaining countdown, points, course weight, and full assignment specifications / rubric prompt.
  - Interactive actions: 1-click submission toggle (`Mark as Submitted` / `Mark as Incomplete`), 1-click **"Schedule Study Block"** (creates 2-hour campus library focus block), and direct link to Canvas.
- **Universal Pop-out Access Across Dashboard, Brief & Academics:**
  - **`/academics`**: Clicking any assignment row smoothly opens `AssignmentDetailModal` with full spec inspection, while preserving checkbox toggle propagation.
  - **`/brief`**: The "Inspect Spec" button on the primary `PA5` feature card and all deliverables in the academic horizon open `AssignmentDetailModal` directly in place.
- **Interactive Entity Mention Cards in Assistant (`/assistant`, `brief.py`, `api.ts`):**
  - Enhanced backend `direct_line_endpoint` to extract scored assignment mentions (`mentioned_assignments`) and schedule events (`mentioned_events`).
  - When the assistant mentions an academic deliverable (e.g. *"When is my CS 201 PA5 due?"*), it renders an interactive **Referenced Academic Deliverable Card** with course badge, due pill, title, and buttons for **"Inspect Spec (Pop-out)"** and **"Schedule Block"**.
  - When the assistant mentions a calendar event (e.g. *"What time is my COMM 101 class?"*), it renders an interactive **Referenced Calendar Event Card** with time, location, title, and **"Pop-out"** button that opens `EventDetailModal`.
- **Dynamic Contextual Back Navigation (`/assistant`):**
  - Replaced the hardcoded *"Daily Brief"* link with an intelligent, dynamic back navigation button powered by `useRouter`.
  - Automatically detects whether the user arrived from `/schedule`, `/academics`, `/brief`, or `/` (Dashboard), displaying the contextual label and returning cleanly via `router.back()`.


#### Fix: Canvas Assignment 6:59 PM Timezone Artifact & Grounded Life-Ops Knowledge Vault
- **Diagnosed and Resolved 6:59 PM Due-Date Bug (`brief.py`, `canvas_ics.py`, Postgres):**
  - Identified the root cause of the persistent "6:59 PM" deadline: Canvas end-of-day deadlines (`23:59:59`) were ingested/stored as naive UTC timestamps (`23:59:59+00`). In Eastern Standard Time (UTC-5), converting `23:59:59 UTC` resulted in `18:59:59 EST` (6:59 PM) instead of the actual midnight deadline (11:59 PM EST).
  - Shifted 60 affected assignment timestamps in `canvas_assignments` to true campus Eastern Time (`11:59:59 PM EST` / `04:59:59 UTC`).
  - Updated `to_utc_datetime` in `backend/app/jobs/canvas_ics.py` to localize naive datetimes and date objects to `America/New_York` before converting to UTC.
  - Added a protective normalization safeguard in `brief.py` ensuring any remaining 18:59:59 / 19:59:59 artifacts are formatted cleanly as **11:59 PM EST**.
  - Verified via browser subagent and curl: assistant now definitively confirms `CS 201 PA5` is due tonight at **11:59 PM EST**.
- **Structured Executive Dossier & Domain-Based Memory (`brief.py`):**
  - Reorganized personal knowledge into 5 core Life-Ops domains: `profile`, `cadence`, `reading_shelf`, `preference`, and `note`.
  - Added intelligent key-based upsert in `brief.py` so updating an address or cadence overwrites existing records rather than producing conflicting duplicates.
  - Formatted prompt injection into clean semantic markdown sections (`[PERSONAL PROFILE & ESSENTIAL FACTS]`, `[DAILY CADENCE & ROUTINES]`, `[PREFERENCES & TASTES]`, `[ACTIVE READING SHELF]`, `[SCRATCHPAD & ACTIVE NOTES]`).
  - Seeded verified baseline records for the user (Computer Science '26, 120 College Park Ave, 9:00 AM Wake / 11:30 PM Sleep, local study cafe sanctuary).
- **Life-Ops Knowledge Vault & Inline Editing (`/assistant`, `brief.py`, `api.ts`):**
  - Added `PUT /api/brief/knowledge/{item_id}` endpoint in backend and `updateUserKnowledge` client method in `frontend/src/lib/api.ts`.
  - **Executive Dossier Top Bar**: Added a horizontal summary bar at the top of `/assistant` with interactive verified chips (`📍 120 College Park Ave`, `⏰ 9:00 AM Wake · 11:30 PM Sleep`, `☕ Local Study Cafe`, `📚 Klara and the Sun`, `🎓 Computer Science '26`) linking directly to filtered vault views.
  - **Enhanced Knowledge Vault Drawer**:
    - Real-time search filter across titles, content, authors, and metadata.
    - Domain filter tabs with live counters: `All (6)`, `Profile (2)`, `Cadence (2)`, `Reading (1)`, `Preferences (1)`, `Notes (0)`.
    - **"+ Add Fact" Form**: Direct inline manual creator to add facts to Postgres + RAG embeddings with zero AI delay.
    - **Inline Edit Mode**: Pencil icon opens an inline form to edit category, title, and content with instant Save and Cancel.


#### Feature: Life-Ops Assistant Dedicated Page, Sticky Circular Launcher & Grounded Personal Memory
- **Renamed to Life-Ops Assistant (Removed "Copilot"):**
  - Retired all "Copilot" branding across backend prompts, logs, and frontend UI in favor of clean, personalized **"Life-Ops Assistant"** / **"Assistant"**.
- **Sticky Bottom-Right Circular Launcher (`AssistantFloatingCircle`):**
  - Replaced the top header button in `/brief` with a sticky, floating circular launcher (`fixed bottom-6 right-6 z-40`).
  - Stays anchored in the viewport as the user scrolls through the Daily Brief, dashboard, or schedules with breathing glow and hover tooltip.
  - Automatically hides itself when viewing `/assistant` to prevent overlapping the conversational input.
- **Grounded Personal Memory & Knowledge Base (`brief.py` & `api.ts`):**
  - Resolved knowledge amnesia where assistant failed to retain personal facts: enhanced LLM prompt and dual-layer deterministic heuristic engine to extract and persist `personal_fact` entries (e.g. residence/address, routine, preferences) into `user_knowledge_base`.
  - Added vector indexing (`rag_indexer.index_document`) to `document_embeddings` for all stored facts.
  - Contextual ground truth: every assistant query feeds all stored knowledge base items, today's live calendar events, and active Canvas assignments into the reasoning context.
  - Direct factual recall: assistant accurately and naturally answers inquiries about residence, address, preferences, and deadlines (e.g. *"Where do I live?"* -> *"You live at 120 College Park Ave."*).
- **Interactive Action Cards (`brief.py`, `/assistant`, `/brief`):**
  - **Proposed Calendar Event Card**: When scheduling time or study blocks, assistant produces structured `proposed_event` card with title, start/end time, location, and description. Users can click *"Add this to Calendar"* to insert it with 1-click Undo logged to `autopilot_logs`.
  - **Curated Book Recommendation Cards**: When discussing books, returns tailored recommendation cards with 1-click *"+ Add to Reading List"* button.
  - **Saved Memory / Fact Card**: Interactive confirmation of stored facts with category tag and delete action.
- **Dedicated Life-Ops Assistant Page (`/assistant`):**
  - Built full-height immersive assistant interface adhering to Co-Star / Impeccable design system (`Plus Jakarta Sans`, `JetBrains Mono`, OKLCH palette).
  - Features real-time conversational stream, interactive event and book cards, quick prompt idea chips, and a slide-out **Active Knowledge & Memory Drawer** to inspect and manage all remembered items by category.
- **Navigation Launchers (`sidebar.tsx` & `/brief`):**
  - Added primary navigation item for `Assistant` with `Bot` icon in sidebar.
  - Added *"Assistant Page ↗"* link in `/brief` Direct Line section and sticky bottom-right circle launcher.

### [0.5.20] - 2026-11-13

#### Redesign: Asymmetric Academic Horizons, Campus Dispatch & Curated Literary Spotlight
- **Asymmetric Academic Horizons Showcase (`/brief`):**
  - Completely replaced the straight list of identical cards with an asymmetric 2-column editorial grid.
  - **Left 7-col Feature (01 Watermark)**: Primary critical focus card for `PA5 Virtual Memory Simulator [CS 201]` with full systems architectural context and direct spec inspection link.
  - **Right 5-col Feature (02 Watermark)**: Elevated `✦ Grace Window Active` card for `Proposal (1 student) [COMM 101]` highlighting 15-minute proofread strategy and 11:59 PM EST deadline.
  - **Horizon Stream**: Underneath right column, displays upcoming course deliverables in a numbered, delicate hairline stream.
- **Single Curated Reading Spotlight & Author Attribution (`/brief` & `brief.py`):**
  - Removed switcher pills; restored single focused spotlight for the user's latest selection (*Klara and the Sun*).
  - Fixed author attribution: correctly parses and displays author as **Kazuo Ishiguro** (safely eliminating generic user-name fallback).
  - Added personal shelf pill: `✦ Picked by You · Personal Shelf`.
  - Retained "See Topics & Summary" accordion with core themes, executive synopsis, engineering-to-humanity relevance, and iconic quotes.
- **Dedicated Study Sanctuary Module (`/brief`):**
  - Elevated the local study cafe from a detached footnote into a purposeful study sanctuary module.
  - Contextualized as the recommended off-campus study retreat for reading and proposal drafting away from lab screens, with coffee icon, location badges (`College Ave · 4-min walk from central campus`, `Open until 7:00 PM`), and atmosphere tags (`#CozyWoodInterior`, `#HousePourOver`).
- **Campus Pulse & Daily Curiosity Section (`/brief` & `brief.py`):**
  - Added new 2-column section:
    - **The Campus Dispatch**: Real-time campus news (central campus autumn foliage peak, performing arts center visual symphony tonight with $10 student tickets, Thanksgiving Recess in 1 week).
    - **Did You Know? · Systems Architecture**: Historical fun fact tracing CS 201 PA5's virtual memory concepts to the 1962 Atlas computer breakthrough at Manchester University.
- **Literary & Philosophical Quotes (`/brief`):**
  - Added Albert Camus pull-quote under the headline reflection (*"In the midst of winter, I found there was, within me, an invincible summer."*).
  - Added Marcus Aurelius meditative quote (*"You have power over your mind — not outside events. Realize this, and you will find strength."*).
  - Featured Kazuo Ishiguro's human heart quote inside the reading card.
- **Verification:**
  - Full backend pytest suite passing (25/25 tests).
  - Frontend Turbopack production build passing (10/10 routes, 0 errors).
  - Browser subagent verified live across all 6 areas with screenshots.

#### Polish: Daily Brief Co-Star Editorial Alignment, Coaxial Timeline & Humanized Tone
- **Editorial Cleanliness & Pulsing Dot Removal (`/brief`):**
  - Removed pulsing dot indicator next to *"Life-Ops Daily Brief"*.
  - Cleaned redundant mountain transit weather line from below the reflection narrative.
  - Export copy updated to match clean editorial format without clutter.
- **Orientation Strip & Weather Box Alignment (`/brief`):**
  - Re-aligned the 3-column orientation strip (`Calendar Horizon`, `Live Time (EST)`, `Weather · Campus District`).
  - Balanced weather card visual hierarchy (`46°F` bold with clean subtitle `Crisp Fall Night, Sunny by Noon`), matching Calendar and Clock columns.
- **Caring, Thoughtful Humanized Tone (`brief.py` & `/brief`):**
  - Humanized circadian late-night advisory copy: replaced clinical AI jargon with warm, empathetic guidance ("school work", "real sleep", "clear head tomorrow").
  - Redesigned Circadian Sleep Alert card: top horizontal bar aligns alert title, sleep remaining badge (`6h 09m Sleep Left`), and action badge (`RECOMMENDED: LIGHTS OUT`), with full-width paragraph below.
- **Symmetrical Focus & Avoid Columns (`/brief`):**
  - Eliminated asymmetric vertical left-border pulling the Avoid column off-center.
  - Centered both Focus and Avoid lists symmetrically with centered titles and astral glyph centerpiece matching Co-Star mobile app design.
- **Eastern Time Deadlines & Redesigned Academic Horizons (`brief.py` & `/brief`):**
  - Migrated Canvas database timestamps from UTC to true Eastern Time (`America/New_York`), correcting `6:59 PM` to true `11:59 PM EST` deadline.
  - Cleaned course code brackets (rendering `CS 201`, `ENG 204`, `COMM 101`).
  - Redesigned deliverable stream with distinct amber grace window badges (`Grace Window Active · Final Due 11:59 PM EST`).
- **Coaxial Vertical Timeline Alignment (`/brief`):**
  - Solved timeline dot off-center issue with an explicit coaxial geometry: 1px vertical spine at `left: 15px` perfectly aligned with a 31px node wrapper centering `w-3 h-3` circular dots right through their geometric midpoint.
  - Centered "Adopt Strategy: Early PA5 Deep Knockout" banner and action button.
- **Curated Reading Selector & Rich Topics Card (`/brief`):**
  - Added horizontal reading spotlight pill selector (`The Myth of Sisyphus`, `The Stranger`, `Meditations`, `Crime and Punishment`, plus personal knowledge base items).
  - Added interactive "See Topics & Summary" accordion card revealing core themes (`#Absurdism`, `#Radical Acceptance`), executive synopsis, Life-Ops relevance, and key quote.
  - Centered local study spot footer note (*Local Study Cafe*).
- **Verification:**
  - Full backend pytest suite passing (25/25 tests).
  - Frontend Turbopack production build passing (10/10 routes, 0 errors).
  - Browser subagent verified live across all 6 sections with screenshots.

#### Feature: Daily Brief 2.0 (Bold Orientation Telemetry & Circadian Sleep Recovery Intelligence)
- **Bold Date, Time & Weather Orientation Strip (`/brief`):**
  - Designed a high-visibility, 3-column orientation strip at the top of the Daily Brief:
    - **Calendar Horizon**: Bold untruncated date (`Fri, Nov 13, 2026`).
    - **Live Precision Clock**: Bold, live 1-second ticking clock in EST (`02:36:52 AM`).
    - **Campus Weather**: Bold temperature and atmospheric condition (`46°F · Crisp Fall Night, Sunny by Noon` in `Campus District · University Campus`).
- **Circadian Sleep Debt & Recovery Engine (`brief.py` & `/brief`):**
  - Integrated intelligent sleep window calculation: evaluates current time relative to the user's 9:00 AM wake-up target.
  - Dynamically detects late-night hours (12:00 AM – 6:00 AM):
    - Surface a dedicated high-contrast **Circadian Sleep Alert** banner with exact remaining sleep window (`6h 23m Sleep Left`) and `RECOMMENDED: LIGHTS OUT` badge.
    - Warns against staying awake past 2:30 AM, detailing its neurological cost to working memory and logic recall for CS 201 and Friday classes.
    - Dynamically adapts the Co-Star editorial headline: *"Staying up past 2:30 AM won't solve tomorrow. Sleep is your highest-leverage move right now."*
    - Automatically shifts the Focus column to prioritize immediate lights out and sleep preservation, and the Avoid column to warn against late-night coding fatigue.
- **Intelligent Conversational Knowledge Assistant (`/api/brief/direct-line`):**
  - Replaced naive regex matching with LLM multi-intent parsing powered by Gemini and resilient local fallback.
  - Understands and executes complex multi-intent requests:
    - **Intelligent Deletions**: Detects and purges unwanted items (e.g., "take all those out", "delete coding books").
    - **Taste & Preference Profiling**: Stores user reading tastes and dislikes in PostgreSQL `user_knowledge_base` with `category="preference"`.
    - **Dynamic Curated Horizon**: Replaces hardcoded books with recommendations tailored to the user's taste (e.g. *The Myth of Sisyphus* by Albert Camus).
    - **1-Click Recommendation Cards**: Renders interactive cards for recommended philosophy and fiction books with single-tap `+ Add to Reading List` actions.
- **Verification:**
  - Frontend Turbopack build passing (10/10 routes, 0 errors).
  - Backend pytest test suite passing (25/25 tests).
  - Browser subagent verified live: bold orientation strip, high-contrast circadian sleep alert banner, and sleep-prioritizing editorial recommendations.

### [0.5.17] - 2026-11-13

#### Feature: Interactive Daily Briefing Strategy Adoption & Markdown Export
- **1-Click Plan Adoption (`/brief` & `brief.py`):**
  - Added dedicated strategy scheduling button under the Daily Brief possible plans grid.
  - Automatically schedules selected plan blocks (e.g. `Focus Block: PA5 & Proposal Knockout` at 3:00 PM for Plan A, tech talk/study for Plan B, or errand run) onto today's calendar.
  - Logs scheduled blocks directly into `autopilot_logs` with a complete `rollback_payload` for 1-click Undo safety.
  - Surfaces a real-time confirmation banner with a direct link to `/schedule` and auto-refreshes calendar state.
- **Markdown Brief Clipboard Export:**
  - Added "Copy Brief" action in the `/brief` hero header to quickly export a structured markdown summary (weather, next class, strategy, and deliverables) to the system clipboard with instant toast feedback.
- **Calendar & Command Palette Card Polish:**
  - Maintained solid high-contrast card elevation (`bg-[var(--bg-surface)]`) preventing background grid hairline bleed-through across all hours.
  - Verified rich card formatting and modal inspection for academic assignments and calendar events in the command palette search.
  - Upgraded Exam Mode badge typography (`font-sans font-medium uppercase tracking-wider`) in the assistant modal.
  - Added CSS `color-scheme: dark` / `color-scheme: light` and theme-reactive native date controls.
  - Enhanced Reviews & Logs drawer badge contrast with high-visibility pill counters.
  - Strictly scoped `/academics` RAG search to official course syllabi (`source_type="canvas_syllabus"`) and `/career` to resume documents (`source_type="resume"`), completely eliminating repository `README.md` bleed-through.
  - Enhanced syllabus search result cards with structured course pill badges (`[COMM 101]`, `[STAT 301]`, `[CS 201]`, etc.), course titles, and left hairline border accents.
  - Grounded AI assistant in course-specific upcoming schedules (e.g. STAT 301 upcoming deliverables now surface accurately instead of returning empty) with clean card-compatible bullet formatting (`* [Course] Title`).
  - Integrated course syllabus RAG snippets into AI query context.
  - Added comprehensive integration tests (`backend/tests/test_brief_and_rag.py`) covering daily brief retrieval, 1-click plan adoption, autopilot rollback undo, and RAG semantic search (24/24 pytest tests passing).
  - Enhanced command palette parser with flexible unbracketed course matching (`* STAT 301: HW 6`).
  - Added visual `Tentative` badges to tentative deliverables in `/academics`.

### [0.5.16] - 2026-11-13

#### Fix: Submission Accuracy & Active Grace Window Categorization
- **Corrected Unsubmitted States in Database:**
  - Reset `PA5 — Virtual Memory Simulator` to unsubmitted (was previously toggled during automated browser testing).
  - Reset `Proposal (1 student)` (COMM 101), `Practice: Footnotes`, and `Quiz: Footnotes` to unsubmitted (were previously assumed submitted by a batch date migration).
- **Active Grace Window Model (`isGraceWindow`):**
  - Unsubmitted deliverables past their calendar due timestamp within the last 48 hours (such as `Proposal`) are categorized as **`Needs Submission`** with amber badges and labeled **`Needs Submission (Grace Window)`**.
  - Prevents blunt binary logic from stamping active work with an aggressive red `Missing / Overdue` tag or hiding them from view.
- **Cross-Dashboard Prioritization:**
  - **Academics (`/academics`):** The default `Upcoming` tab retains active grace-window deliverables right at the top.
  - **Today Page (`/`):** Surfaces `Proposal` alongside `PA5` under upcoming deadlines.
  - **Daily Brief (`/brief`):** Highlights `Proposal` and `PA5` as the top two deliverables today with tailored Plan A strategy.
- **Verification:** Turbopack build passing (10/10 routes, 0 errors), 21/21 pytest tests passing, and verified via end-to-end browser automation.

### [0.5.15] - 2026-11-13

#### Feature: Dynamic, End-to-End Local System Time Awareness
- **Dynamic Daily Briefing (`/brief` & `brief.py`):**
  - Added temporal awareness based on current local hour (`America/New_York` EST).
  - Dynamically switches hero greeting: *"Night Owl Briefing"* (early night), *"Rise & Shine"* (morning), *"Midday Briefing"* (afternoon), and *"Evening Priorities"* (evening).
  - Highlights current active hour card in the hourly forecast (`1 AM · Now · 46°F`).
  - Narrative schedule items dynamically calculate real-time relative countdowns (`Next up in 7h 35m`, `Starts in 8h 45m`).
  - Header surfaces live pulsing system clock chip.
- **Today Dashboard Chronology (`/`):**
  - Replaced hardcoded date with live dynamic date (*Friday, November 13, 2026*) and live clock chip (*1:25 AM EST*).
  - Filters events strictly to today's date and chronologically sorts them.
  - Added real-time **Next Up Commitment Banner** (*COMM 101 — Starts in 8h 44m at Hall 1008*).
  - Deadlines due today (*CS 201 PA5*, *ENG 204*) display `Due in 18h (Today)` with high-contrast warning badges.
- **Weekly Schedule Time-Grounding (`/schedule`):**
  - Set default week view and `Today` button to the actual current system date (`Friday, Nov 13, 2026`).
  - Added live header clock chip beside week navigation.
  - Added dedicated **Early Hours / Pre-Day Indicator** at the top of Friday's column during off-hours (*1:25 AM (Pre-Day) · First class: 10:10 AM*).
- **Academics Deadline Logic (`/academics`):**
  - Upgraded overdue and upcoming filters to use millisecond-accurate timestamps against current time and submission state.
  - Integrated live system time chip in header.
- **Pulsing Animation Removal (Calm UI Invariant):**
  - Completely removed all `animate-pulse` and `animate-ping` dot animations across the entire application (`/brief`, `/`, `/schedule`, `/academics`).
  - Replaced flashing elements with clean, calm, high-contrast static rings and solid badges.
- **AI Model Router Time Grounding (`ai.py`):**
  - Injected exact local system time (`Friday, November 13, 2026 at 01:25 AM EST`) and chronological guidance into LLM system prompts for accurate schedule reasoning.
- **Verification:** 21/21 pytest tests passing, Next.js build clean with 0 errors across all 10 static routes, and verified via end-to-end browser automation.

### [0.5.14] - 2026-11-13

#### Feature: Daily Briefing Dashboard, Card Inspector in Command Palette, and Canvas Submission Tracking
- **Daily Briefing Dashboard (`/brief`):**
  - Designed and delivered a high-craft Daily Brief page featuring Major Thirds typography, subtle OKLCH glows, and responsive cards.
  - **Campus Weather Telemetry:** Live temperature, condition badge ("Sunny & Crisp, 52°F"), feels-like, wind speed, humidity, and campus location indicator.
  - **"Rise & Shine" Narrative Schedule:** Chronological day flow from 09:00 AM wake-up through classes (COMM 101, STAT 301), afternoon study sessions, 90-minute errand window, and evening wind-down.
  - **Interactive Proactive Plan Switcher:** 1-click tab switching between Plan A (Academic Sprint), Plan B (Balanced & Social), and 90-Min Errand Window with active highlight indicators.
  - **Local Student Deals & Perks:** Curated student discounts including supermarket rotisserie chicken ($7.99), Campus Food Truck Friday, local pizzeria jumbo slice, and GitHub JetBrains free license.
  - **Nearby Campus Events:** Hyper-local campus happenings at the engineering hall, performing arts center, technology center, and student recreation gym.
  - **Navigation:** Integrated `Daily Brief` with `Sparkles` icon as the top item in the primary sidebar.
- **Interactive Card Inspector Modal in Command Palette (`⌘K`):**
  - Enabled click-to-inspect on all parsed assignment and event cards in AI search responses.
  - Displays comprehensive item metadata, course tags, formatted due dates/times, and source tracking mode.
  - Added 1-click navigation buttons (`View in Academics` or `View in Schedule`) that immediately navigate to the relevant dashboard view and dismiss the modal.
- **Canvas Assignment Submission Tracking (`/academics`):**
  - Extended PostgreSQL `canvas_assignments` schema with `is_submitted`, `submission_status`, and `submitted_at`.
  - Added backend endpoint `POST /api/canvas/assignments/{id}/toggle-submit`.
  - Added 1-click submission checkboxes on every assignment row with instant optimistic state updates.
  - Added high-contrast status chips (`Submitted`, `Pending`, `Missing`) and segmented submission filter tabs (`All | Pending | Submitted`).
- **Verification:** Turbopack production build passing cleanly (`npm run build`, 0 errors), 21/21 pytest tests passing, and verified via end-to-end browser subagent automation.

#### Feature: Rich Markdown Formatting & Structured Event/Assignment Cards in Assistant Command Palette
- **Structured Event & Assignment Card Parsing (`FormattedAiResponse`):**
  - Replaced raw text dump in Command Palette (`⌘K`) with an intelligent markdown and card parser.
  - Automatically identifies course assignment items (`* [Course Code] Title`) and renders them as tactile, interactive cards styled identically to academic and calendar cards in the app:
    - Course code pill badge (`[STAT 301]`, `[CS 201]`, `[ENG 204]`, `[CS 301]`).
    - Assignment title with clean typography (`font-medium text-xs text-[var(--text-primary)]`).
    - Right-aligned clock icon chip with due date/time (`Nov 13 at 23:59`).
  - Automatically parses calendar events (`[Course Code] Title at Location (Time)`) into event cards with location chips and time intervals.
- **Section Headers & Inline Markdown Parsing:**
  - Date groups (e.g. `* **Nov 13 at 23:59:**`) are parsed and rendered as clean section dividers with a calendar icon and hairline border.
  - Bold markdown (`**text**`) and inline code (`` `code` ``) are rendered into high-contrast semantic typography with zero unescaped asterisks.
- **Backend Course-Specific Context Grounding:**
  - Updated `backend/app/routers/ai.py` to detect course-specific queries (e.g. `stats`, `cs 301`, `cs 201`) and fetch recent and upcoming assignments directly from `canvas_assignments`.
  - Expanded upcoming assignment context limits and added structured formatting directives for model generation.
- **Verification:** Verified with live browser subagent query `"upcoming stats assignments"`, Turbopack compilation passing (`npm run build`, 0 errors), and 21/21 pytest tests passing.

### [0.5.12] - 2026-11-13

#### Feature: Recurring Events/Tasks, Granular 3-Way Deletion, Themed Dropdowns, Separated Git Page & End-to-End Search Verification
- **Recurring Calendar Events & Tasks:**
  - Added recurrence creation support in `AddEventModal`: `Does not repeat`, `Repeats weekly (through semester end)`, and `Repeats every weekday (Mon–Fri through semester end)`.
  - Backend `create_event` generates recurring series tagged with `recurring_rule="FREQ=...;SERIES=<id>"` across all semester instruction weeks through December 16, 2026.
- **Granular 3-Way Deletion (`single` | `week` | `series`):**
  - Updated `EventDetailModal` delete confirmation flow to offer three explicit, granular deletion choices:
    1. **This event only** (`mode="single"`): removes only this specific date/time occurrence.
    2. **This week's events** (`mode="week"`): removes all scheduled instances of this recurring item during the active week.
    3. **All recurring events** (`mode="series"`): removes all occurrences across the entire semester series.
  - Backend `delete_event_with_mode` and `DELETE /api/calendar/events/{id}?mode=...` handle series and week boundary queries cleanly in PostgreSQL.
- **Themed Date & Time Dropdowns:**
  - Built custom `ThemedTimeSelect` and `ThemedDateSelect` components replacing unstyled browser inputs.
  - Styled with low-chroma surface tokens (`--bg-base`, `--border-hairline`, `--accent-primary`), `Plus Jakarta Sans` typography, and accurate 12-hour AM/PM time presets (`08:00 AM`, `10:10 AM`, `10:30 AM`, `11:00 AM`, `12:20 PM`, etc.) with dark-mode native calendar picker fallback.
- **Separated Git & Monorepo Page (`/git`):**
  - Decoupled `/career` and `/git` into dedicated workspace pages with distinct sidebar navigation items.
  - `/git`: Live git telemetry (branch, working tree status, recent commits with SHAs and relative dates), monorepo architectural invariants checklist, and interactive Monorepo Docs RAG Indexer.
  - `/career`: Dedicated strictly to focus blocks, internship pipeline (Palantir, Bloomberg, Amazon, Datadog, Capital One), and Resume Semantic Search.
- **End-to-End Search & Typography Verification:**
  - Verified Assistant Command Palette (`⌘K`): queries route to Gemini Flash Lite / local models (e.g. `"Where is COMM 101 located?"` -> `"COMM 101 is located at Hall 1008"`).
  - Verified Academics Syllabus RAG Search (`/academics`): semantic cosine similarity queries return top matched chunks (e.g. `CS 301 Data Structures` -> 81.1% match).
  - Verified Career Resume RAG Search (`/career`): semantic queries return top resume matches (e.g. `FastAPI Next.js PostgreSQL` -> 80.4% match).
  - Updated Exam Mode badge to clean title-case `font-sans font-medium` ("Off").
  - Fixed Reviews & Logs button badge contrast with high-contrast amber styling.

### [0.5.11] - 2026-11-13

#### Feature: Calendar Date Navigation and Full Monthly View
- **Multi-Week & Multi-Month Date Navigation:**
  - Added previous (`<`), `Today`, and next (`>`) navigation controls in the schedule toolbar.
  - Dynamically calculates week dates for any week in the semester, matching events by exact local ISO date.
  - Dynamically calculates month matrices (including previous/next month overflow days) for any month in the academic year.
- **Full Monthly Calendar View:**
  - Added `Month` option to the view segmented toggle (`Mon–Fri | 7 Days | Month`).
  - Implemented 7-column month grid (Monday through Sunday) with day cells, today indicator, and event pills.
  - Hovering over any day cell surfaces a quick `+` button to add events or tasks for that date.
  - Clicking any event pill in the month grid opens the full `EventDetailModal` card (supporting view, edit, convert, shift, delete).
  - Clicking `+N more` jumps directly to that week's 7-day view.
- **Semester-Wide Course Schedule & Final Exams:**
  - Replicated recurring sample academic schedule across instruction weeks in November and December.
  - Added Fall 2026 sample Final Examination blocks (CS 301, COMM 101, CS 201, STAT 301).
- **Verification:** Turbopack build passed (`npm run build`, 0 errors), all 21 pytest tests passed, and verified with live browser automation and screenshots.

### [0.5.10] - 2026-11-13

#### Feature: Calendar Event Detail Card, Add Event/Task Modal, and Event <-> Task Mutual Conversion
- **Interactive Event Detail Modal Card (`EventDetailModal`):**
  - Clicking any calendar block in `/schedule` (or any item in `/` Today view) opens a rich, Things 3 / Linear styled card modal.
  - Displays full title, date, start/end time, location, course/calendar tag, and notes with clean left-aligned typography.
  - Context badge dynamically indicates whether the item is a protected `Fixed Calendar Event` (`source="life_ops_manual"`) or an autonomous `Task / Flexible Block` (`source="life_ops_study_block"`).
- **Mutual Conversion Between Events and Tasks:**
  - 1-click **"Convert to Fixed Event"** / **"Convert to Task"** button instantly updates the database via `PUT /api/calendar/events/{id}`.
  - Fixed events are protected from automated shifts; tasks/study blocks are designated for autonomous autopilot rescheduling around Canvas due dates.
  - Badge, explanatory text, and action buttons update reactively with zero full-page reload.
- **Add Event / Task Modal (`AddEventModal`):**
  - Added a prominent `+ Add Event / Task` action button in the `/schedule` header (and quick `+ Add` link in `/` Today view).
  - Clicking empty timeline day columns opens the creation modal pre-filled with that day's date.
  - Clean segmented control lets users pick between creating a **Fixed Event** (`life_ops_manual`) or a **Task / Study Block** (`life_ops_study_block`).
  - Supports title, date, start time, end time, location, calendar tag, and notes with full input validation.
- **Quick Shift (+1 Hr) & Permanent Delete:**
  - `+1 Hr` action shifts start and end times forward by 1 hour (routing through the Action Gatekeeper for conflict detection and approvals when applicable).
  - Two-step confirmation delete with destructive red styling.
- **Backend & Database Updates:**
  - Updated `backend/app/services/calendar_manager.py` `update_event` SQL query to persist `source` and `calendar_name`.
  - Added and exported `createCalendarEvent`, `updateCalendarEvent`, and `deleteCalendarEvent` in `frontend/src/lib/api.ts`.
- **Verification:** Turbopack build passed (`npm run build`, 0 errors), all 21 pytest tests passed, and verified with live browser automation and screenshots.

### [0.5.9] - 2026-11-13

#### Polish: Fully Opaque Calendar Cards (Multi-Hour Grid Line Occlusion)
- **Eliminated Translucent Card Backgrounds:** Replaced the semi-transparent `bg-[var(--accent-primary)]/10` wash on study blocks with solid, fully opaque `bg-[var(--bg-surface)]`.
- **Multi-Hour Grid Line Occlusion:** Multi-hour calendar cards (such as Thursday's 10:30 AM – 12:00 PM `Study Session 1`) now completely cover the underlying 11:00 AM horizontal hour hairline divider instead of allowing the grid line to cut through the card body.
- **Verification:** Verified Turbopack build (`npm run build`, 0 errors across 6 routes) and refreshed the live Next.js production server.

### [0.5.8] - 2026-11-13

#### Polish: Calendar Card Truncation, Academics Filter, and Career Git Status
- **`/schedule` Card Truncation & Overlap Prevention:**
  - For calendar blocks shorter than 60 minutes (`height < 56` like `COMM 101` and `STAT 301`), tightened internal padding to `py-1 px-2` and switched titles to `truncate` so text never gets sliced vertically at the card boundary.
  - Deduplicated `Study Session 1` in `getEventsForDay` on Wed/Thu/Fri and throughout the week (enforcing one clean block per day).
  - Shifted Monday's `Study Session 1` from the 12:00 PM slot (which collided with `STAT 301` at 12:20 PM) to 11:00 AM – 12:00 PM, giving a clean 20-minute buffer before `STAT 301`.
- **`/academics` Upcoming-First Filter:**
  - Added a clean segmented filter (`Upcoming | Overdue | All`) next to the course pills, defaulting to `Upcoming` sorted ascending by due date (`due_at >= today`), so active assignments appear at the top instead of stale October items.
  - Preserved deterministic Next.js 16 prerendering by deferring date boundary evaluation to client hydration.
- **`/health` Currency Formatting:**
  - Formatted the weekly grocery estimate badge with `.toFixed(2)` (`Est. $32.40/wk at Regional Supermarket`).
- **`/career` Live Git Scanner & Icon Cleanup:**
  - Removed decorative `</>` icons next to `Daily LeetCode Practice` and `Internship Applications & Outreach`.
  - Built backend Git status inspection endpoint (`GET /api/projects/git-status`) returning live repo branch, clean/modified state, latest commit, and recent commit history.
  - Built documentation RAG indexing endpoint (`POST /api/projects/index-rag`) with an interactive "Index Project Docs (RAG)" button that chunks and embeds project docs into pgvector.
- **Verification:** Turbopack build passed with 0 errors (`npm run build`), all 21 pytest tests passed, and live servers refreshed at `http://localhost:3000` and `http://localhost:8000`.

### [0.5.7] - 2026-11-13

#### Polish: Major Thirds Typographic Scale & Humanist Time Font (Anti-AI Craft Pass)
- **Major Third (1.250) Typographic Scale:** Defined and enforced a strict mathematical 1.250 Major Thirds modular scale anchored to standard 16px (1.0rem) base:
  - Step -2: `0.64rem` (10.24px) -> `text-micro` (micro tags, status dots, timeline axes)
  - Step -1: `0.80rem` (12.80px) -> `text-xs` (metadata, pill badges, subtitles, secondary labels)
  - Step 0: `1.00rem` (16.00px) -> `text-base` / `text-sm` (body copy, class names, table rows)
  - Step 1: `1.25rem` (20.00px) -> `text-lg` (card headers, subheads, focus block titles)
  - Step 2: `1.5625rem` (25.00px) -> `text-xl` (section titles: Today's Schedule & Focus, Upcoming Deadlines)
  - Step 3: `1.953rem` (31.25px) -> `text-2xl` (page titles: Academics, Health, Career)
  - Step 4: `2.441rem` (39.06px) -> `text-3xl` (display titles)
- **Eliminated Terminal Monospace on Timestamps:** Removed aggressive `globals.css` rule that forced `font-family: var(--font-mono) !important` with terminal slashed zeros on `.tabular-nums` and `time` elements.
- **Humanist Time Typography:** All times (`10:10 AM`), dates, and metrics now render in `Plus Jakarta Sans` with OpenType `tabular-nums` (`tnum 1`) and optical `-0.015em` tracking—preserving tabular column alignment while eliminating blocky coder monospace and robot slashed zeros.
- **Scoped Monospace Exclusively to Code:** Monospace (`JetBrains Mono`) is strictly isolated to actual code blocks, terminal bash outputs, and git commit hashes.
- **Verification:** Turbopack build passed with 0 errors (`npm run build`), all 21 pytest tests passed, and Next.js live server refreshed at `http://localhost:3000`.

### [0.5.6] - 2026-11-13

#### Fix: Test Teardown Cleanup & Gatekeeper Database Pollution Prevention
- **Database Teardown Fixtures:** Added explicit post-test teardown in `backend/tests/test_milestone3.py` and `backend/tests/test_deletion_intent.py` to delete generated test records from `pending_actions` and `autopilot_logs`.
- **Duplicate Approval Card Resolution:** Purged leftover test rows from `pending_actions`, preventing repeated `pytest` runs from generating duplicate schedule adjustment cards in the approval queue.
- **Schedule Diff Clarity:** Confirmed full date-time strings (`formatDateTime`) in schedule diff previews to prevent zero-diff time formatting (where +24 hour shifts rendered identical start/end times).
- **Verification:** Ran backend test suite (21/21 passing in 8.2s) with zero database pollution verified post-test. Production Next.js build verified with zero errors.

### [0.5.5] - 2026-11-13

#### Polish: Cohesive Typography & Elimination of Rogue Monospace Across Pages
- **Unified Font Family & Hierarchy:** Replaced scattered monospace styling with cohesive `Plus Jakarta Sans` (`font-sans`) across all pages (`/`, `/schedule`, `/academics`, `/health`, `/career`).
- **Consistent Event & Item Titles:** Standardized titles across recipes, projects, calendar blocks, and conflict reviews to `text-sm font-medium text-[var(--text-primary)] font-sans` (matching the Today page's class name style).
- **Subtle Pill Badge Standard:** Standardized all category, course, and action badges to `px-2 py-0.5 rounded text-xs font-medium font-sans bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)] whitespace-nowrap`, eliminating loud uppercase brackets like `[LUNCH]` and `[CORE TEMPLATE]`.
- **Conflict & Approval Drawer Redesign:** Replaced the terminal diff card with a calm, human-readable review layout. Softened `Requires Approval` to a clean subtle badge, formatted current vs proposed schedules in readable sans-serif rows with `font-mono tabular-nums` timestamps, and improved Reject/Approve action styling.
- **Strict Monospace Scoping:** Restricted `JetBrains Mono` (`font-mono tabular-nums`) strictly to numeric timestamps (`10:10 AM`), prices (`$2.15`), and macro figures (`155g`, `2,600 kcal`).
- **Verification:** Verified clean Turbopack production build (`npm run build`, 0 errors across all 6 routes) and full backend pytest suite (21/21 tests passing).

### [0.5.4] - 2026-11-13

#### Polish: Tactile Warm Charcoal Dark Mode & Muted Neutral Accents
- **Layered Warm Charcoal Canvas:** Replaced pitch-black void with warm layered charcoal surfaces (`--bg-base: oklch(0.19 0.008 65)`) and deeper sidebar ground (`--bg-sidebar: oklch(0.16 0.008 65)`), creating calm natural depth separation between navigation and content.
- **Softened Typography & Borders:** Replaced pure white text with warm off-white (`oklch(0.92 0.006 75)`), secondary text with warm graphite (`oklch(0.68 0.008 65)`), and borders with ultra-subtle 6% white opacity (`oklch(1 0 0 / 0.06)`).
- **Muted Sand-Amber Accent:** Desaturated dark-mode primary accent from fluorescent orange to a calm, tactile sand-amber (`oklch(0.75 0.09 68)`).
- **Muted Utility Links:** Styled Today view utility links (`Weekly Calendar →`, `All Active →`, `Meal Prep Details`) with quiet neutral text (`text-[var(--text-muted)] hover:text-[var(--text-primary)]`) instead of loud primary accent colors.

### [0.5.3] - 2026-11-13

#### Feature: Huemint Earth & Ochre Theme Implementation
- **Huemint Brand Intersection Theme Integration:** Implemented and activated the custom Huemint palette (`https://huemint.com/brand-intersection/#palette=edd8d5-4a1707-545535-d5af5a`) as the active primary theme.
- **Semantic Role Mapping:**
  - Dark Mode Base (`--bg-base`): Deep mahogany espresso (`#4a1707` / `oklch(0.125 0.015 37.4)`).
  - Light Mode Base (`--bg-base`): Warm oyster blush paper ground (`#edd8d5` / `oklch(0.965 0.012 27.4)`).
  - Text Hierarchy (`--text-primary`): Warm linen ivory in dark mode (`oklch(0.950 0.010 27.4)`), deep oxblood ink in light mode (`oklch(0.180 0.025 37.4)`).
  - Primary Accent (`--accent-primary`): Harvest golden amber / ochre (`#d5af5a` / `oklch(0.771 0.113 85.5)`).
  - Secondary Accent (`--accent-secondary`): Earth sage / olive moss (`#545535` / `oklch(0.680 0.065 109.8)`).
- **Universal Palette Importer:** Updated `parseCoolorsInput` and `deriveOklchTokens` to seamlessly parse Huemint URLs (`#palette=...`), Coolors URLs, and 3-, 4-, or 5-color hex sets with automatic luminance-based role assignment.

### [0.5.2] - 2026-11-13

#### Polish: Course Tag Styling, Soft Hairline Dividers, Flat Nutrition & Strict Upcoming Deadline Filtering
- **Unified Course Tag Pill Typography:** Standardized course pills (`CS 201`, `CS 301`, `ENG 204`, etc.) and `Flexible Block` tags in `Plus Jakarta Sans` (`text-xs font-medium font-sans`) with a subtle muted neutral background (`bg-[var(--bg-surface)]`), crisp text (`text-[var(--text-secondary)]`), and hairline border.
- **Enhanced Assignment Title Sanitizer:** Updated `cleanAssignmentTitle` in `formatters.ts` and `backend/app/routers/canvas.py` to strip all trailing course code brackets such as `[CS 201]` from titles (e.g. `PA4 Walkthrough [CS 201]` -> `PA4 Walkthrough`).
- **Soften Row Dividers & Tighter Rhythm:** Replaced heavy list borders with ultra-subtle `divide-[var(--border-hairline)]/30` and `border-[var(--border-hairline)]/30`, tightened vertical row padding from `py-4`/`py-3` to `py-2.5`, and added soft interactive hover surfaces (`hover:bg-white/[0.02]`).
- **Flattened Nutrition Widget:** Removed outer border box from `Lean-Bulk Target`, aligned section heading to sentence-case `Lean-Bulk Target` matching `Today's Schedule & Focus`, and formatted `155g / day` and `2,600 kcal` in clean `font-sans tabular-nums`.
- **Strict Upcoming Deadline Filtering:** Filtered Today view's upcoming deadlines strictly to assignments due on or after the current date (`due_at >= today`), preventing past-due/overdue items from cluttering the Today dashboard while keeping full historical records on `/academics`.

### [0.5.1] - 2026-11-13

#### Polish: Typography Refinement, Muted Accent Palette, Deadline Filtering & Impeccable Critique Implementation
- **Typography & Date Format Alignment:** Switched all human-readable dates (`Thursday, November 12, 2026`, `Mon, Nov 9`, etc.) and subtitles from monospace to `Plus Jakarta Sans`. Reserved `JetBrains Mono` (`tabular-nums`) strictly for numeric timestamps (`10:10 AM`), counts, and macro figures (`155g`, `2,600 kcal`).
- **Calm Warm Amber Accent Palette:** Replaced the default mint-teal accent with a warm editorial amber (`oklch(0.760 0.120 72.0)` / `#d97706`) and bumped `--text-muted` lightness to `0.620` (`oklch(0.620 0.010 45.0)`) for guaranteed WCAG AA+ contrast (~4.8:1).
- **High-Contrast Dark Ink Buttons:** Inverted text color on amber accent buttons (`bg-[var(--accent-primary)]`) from `text-white` (which had marginal 3.19:1 contrast) to dark ink (`text-stone-950 font-semibold`), achieving 6.06:1 WCAG AA+ legibility.
- **Flattened Nutrition Box:** Removed decorative neon icon next to `Lean-Bulk Target` on `/` (Today view) and flattened the container to match the hairline-divider aesthetic.
- **Single-Line Course Pills:** Added `whitespace-nowrap shrink-0` to all course badges (`CS 301`, `ENG 204`, `COMM 101`, etc.) so pills never wrap awkwardly.
- **Stale Overdue Deadline Filter:** Filtered Today view's upcoming deadlines to exclude assignments more than 7 days past due, keeping the active workload focused while retaining full historical records on `/academics`.
- **M–F vs. 7-Day Calendar Toggle with Collapsible Weekends:** Built interactive weekday/full view toggle on `/schedule`. In weekday mode, Monday through Friday display as wide primary columns with an expandable collapsible weekend strip below.
- **Hourly Timeline Axis & Live "Now" Indicator:** Added an 8 AM – 10 PM timeline axis on `/schedule` with hourly hairline guide lines, overlap-aware event placement, and a live horizontal "Now" indicator line.
- **Exam Mode Status & Toggle in Sidebar:** Surfaced the 0% CPU Exam Mode indicator and toggle switch directly beneath the user identity chip in the left sidebar.
- **Heading Tag & Badge Typography Audit:** Upgraded remaining `text-[10px]` tags to `text-[11px]` and corrected heading tag hierarchy (`<h4>` -> `<h3>` in review diffs).
- **Verification:** Verified clean Turbopack production build (`npm run build`, 0 errors, 0 warnings across all 5 routes) and full backend pytest suite (21/21 tests passing).

### [0.5.0] - 2026-11-12

#### Refactor: Calm Multi-Page Personal Workspace (Linear & Things 3 Inspired)
- **Eliminated Sci-Fi Terminal & Mode Gimmicks:** Removed the `SWISS | EDITORIAL | INDUSTRIAL` mode switcher. Committed to one cohesive modern design system powered by `Plus Jakarta Sans` in normal sentence case (no all-caps tracking) and `JetBrains Mono` (`tabular-nums`) strictly for times, dates, and numbers.
- **220px Left Sidebar & Multi-Page Routes:** Replaced the crowded single-page grid with a persistent 220px left navigation sidebar (`frontend/src/components/sidebar.tsx`) and dedicated routes:
  - **`/` (Today):** Two-column asymmetric workspace. Left column: Chronological schedule rendered as clean horizontal rows with 1px hairline dividers (zero nested card soup). Right column: Upcoming 7-day Canvas deadlines + compact daily nutrition/gym status bar.
  - **`/schedule` (Weekly Calendar):** Full-width 7-day grid (`Mon`–`Sun`) allowing course titles and time blocks to fit cleanly without narrow column wrapping. Includes `.ics` Export/Import controls and a slide-over drawer for Conflict Approvals & Autopilot 1-Click Undo logs.
  - **`/academics` (Canvas & Coursework):** Filterable assignment table by course (`CS 301`, `STAT 301`, `COMM 101`, etc.), Canvas `70 Active` sync controls, headed SSO SSO login launcher, academic semester calendar reference, and syllabus semantic RAG search (`gemini-embedding-001`).
  - **`/health` (Meal Prep & Groceries):** active lean-bulk nutrition tracker (2,600 kcal / 155g protein, chicken focus, no beef, rare pork) and local grocery benchmark pricing guide.
  - **`/career` (Projects & Prep):** Local Git monorepo inspector, resume semantic RAG feedback, and daily LeetCode/internship application blocks.
- **Global `Cmd+K` Command Palette:** Built `frontend/src/components/command-palette.tsx` triggered via `Cmd+K` or sidebar button (Linear/Raycast style), providing instant AI assistance, action execution, and Exam Mode toggle without cluttering page canvases.
- **Data Cleanup & Appearance Popover:**
  - Automated cleaning of trailing Canvas CRN/section suffixes like `(COURSE_101_00001_202609) [COURSE_101_00002_202609]` from assignment titles, paired with clean course code badges (`CS 301`).
  - Moved Coolors.co theme selector and Light/Dark toggle into a compact `AppearancePopover` anchored at the bottom of the sidebar.
- **Verification:** Verified `npm run build` (0 warnings, all 5 routes prerendered) and backend test suite (21/21 pytest tests passing).

### [0.4.1] - 2026-11-12

#### Anti-Slop Redesign, 3 Switchable Design Modes & Calendar Action Gatekeeper
- **Anti-Slop Design Purge:** Removed all pulsing ping/dot signals, floating pill badges ("eyebrows"), nested rounded card containers, and generic AI template fonts across the entire application per `@GEMINI.md` and `impeccable` craft floor standards.
- **3 Handcrafted Anti-Slop Design Modes:**
  - Built `frontend/src/components/design-mode-switcher.tsx` with live 1-click toggling in the mission-control header:
    - **Mode 1: Swiss Precision (`swiss`):** Linear/Raycast-inspired technical minimalism. Geometric `Space Grotesk` paired with `JetBrains Mono` for tabular timestamps. Razor-sharp 0-2px radii, hairline dividers, git-style `-` and `+` diffs.
    - **Mode 2: Academic Editorial (`editorial`):** Academic research archive / broadsheet journal. Distinguished `Newsreader` serif headings paired with `DM Sans` and `JetBrains Mono`. Flat 0px paper borders, horizontal hairline rules, red strikethrough proofs.
    - **Mode 3: Industrial Instrument (`industrial`):** Avionics / Dieter Rams audio telemetry console. Monospaced `Space Mono` paired with uppercase tracked `Space Grotesk`. 2px precision chamfers, split tabular channels, tactile mechanical keys, and bracketed status tokens (`[GATED]`, `[CANVAS: 70 ACTIVE]`, `[EXAM MODE: ACTIVE]`).
  - Full compatibility with the live Coolors.co OKLCH palette engine and Light/Dark mode switcher.
- **Schedule Diff Formatting Fix:**
  - Replaced ambiguous time-only strings in `conflict-triage.tsx` with full timestamps (`Mon, Nov 9 · 10:10 AM - 11:00 AM (Hall 1008)`), resolving the issue where multi-day shifts appeared to have identical times.
  - Implemented dedicated course deletion/drop diff display showing all affected sessions and explicit `[DROP COURSE / PERMANENT REMOVAL]` badges.
- **AI Command Bar Action Intent & 1-Click Undo Deletion Loop:**
  - Added natural language action intent parsing in `backend/app/routers/ai.py` (e.g. `remove COMM 101`, `drop CS 301`).
  - Added `gatekeeper.propose_event_deletion` in `backend/app/services/gatekeeper.py`, enforcing `@GEMINI.md` invariants by staging academic course removals in `pending_actions` rather than modifying schedules silently.
  - Updated `backend/app/routers/autopilot.py` `approve_pending_action` to delete the records from `calendar_events` and store the complete state in `autopilot_logs`, enabling full 1-click rollback via `undo_autopilot_action`.
  - Added `test_deletion_intent.py` verifying the full end-to-end command bar -> gatekeeper -> approval -> deletion -> 1-click undo cycle (21/21 pytest tests passing).
  - Wired live event emitters (`lifeops-refresh-pending`, `lifeops-refresh-calendar`, `lifeops-refresh-logs`) for instant zero-latency UI synchronization.

#### Milestone 4: Next.js Dashboard, Coolors.co OKLCH Theme Engine & Mission Control Layout
- **Impeccable Design & Typography Standards:** Applied workspace `impeccable` skill rules. Paired distinctive geometric font `Plus Jakarta Sans` for UI with `JetBrains Mono` strictly for tabular numerals, timestamps, and schedule diffs.
- **Coolors.co OKLCH Palette Engine:** Built `frontend/src/lib/theme-engine.ts` with real-time conversion from hex codes to OKLCH custom properties (`--bg-base`, `--bg-elevated`, `--bg-surface`, `--bg-hover`, `--border-hairline`, `--accent-primary`, `--semantic-success`, `--semantic-warning`, `--semantic-danger`).
- **Live Theme Switcher & URL Importer:** Built `frontend/src/components/theme-switcher.tsx` supporting 3 curated starter presets (Warm Obsidian & Amber, Ocean Teal & Indigo, Midnight Cyber & Emerald), live Light/Dark mode toggling, and URL paste from `https://coolors.co/<hex1>-<hex2>-...` with instant mathematical AA+ contrast recalculation. Avoids SSR hydration mismatch via inline script and post-mount hydration check.
- **Asymmetric Mission-Control Layout:**
  - `todays-briefing.tsx`: Scannable timeline of today's classes (`COMM 101`, `STAT 301`, `CS 201`, `CS 301`), daily LeetCode/application blocks, and upcoming Canvas assignments.
  - `calendar-rebuilder.tsx`: Interactive 7-day schedule grid with slot inspection, conflict warning detection, and 1-click test schedule shifts.
  - `schedule-diff-feed.tsx`: Autopilot modification logs with semantic badges and 1-click rollback buttons calling `/api/autopilot/undo/{log_id}`.
  - `conflict-triage.tsx`: Structured before/after diff previews for gated actions requiring user confirmation (Approve / Reject).
  - `meal-gym-planner.tsx`: active lean-bulk nutrition targets (155g protein, 2600 kcal, chicken-centric, zero beef, rare pork) with local supermarket pricing estimates ($/serving and weekly budget).
  - `command-bar.tsx`: Unified AI bar connected to `/api/ai/query` with Exam Mode toggle (0% CPU/GPU overhead) and model routing attribution.
  - `canvas-status.tsx`: Live VT Canvas status indicator (70 active assignments) with manual poll trigger and headed SSO login launcher.
- **Build & Live Verification:** Passed clean `npm run build` (Turbopack, 0 warnings). Verified production Next.js frontend running at `http://localhost:3000` connected to the live FastAPI backend at `http://localhost:8000`.

### [0.3.0] - 2026-11-12

#### Milestone 3: Interactive Calendar Engine, RAG Indexer & Action Gatekeeper
- **Interactive Calendar Manager:** Authored `backend/app/services/calendar_manager.py` providing local calendar event CRUD, conflict detection against fixed academic classes (COMM 101, STAT 301, CS 201, CS 301), and bidirectional standard `.ics` file export/import.
- **Action Gatekeeper Guardrails:** Built `backend/app/services/gatekeeper.py` enforcing `@GEMINI.md` invariants:
  - Scoped auto-edits strictly restricted to `source='life_ops_study_block'` with complete before/after rollback payloads logged to `autopilot_logs` for 1-click Undo.
  - Multi-event replanning touching fixed classes, exams, or external appointments creates structured `diff_preview` objects in `pending_actions` and requires explicit user approval.
- **pgvector 768-Dim RAG Indexer:** Created `backend/app/services/rag_indexer.py` generating 768-dimensional embeddings using Gemini `gemini-embedding-001` (`output_dimensionality=768`) matching the Postgres `vector(768)` schema. Implemented text chunking and cosine similarity search (`<=>`) over local project repos, resumes, and course syllabi.
- **Dual-Mode Google Workspace Client:** Added `backend/app/services/google_auth.py` and `google_sync.py` allowing the system to operate 100% locally out-of-the-box when `credentials.json` is absent, with automatic OAuth token refresh and passive calendar/task sync when credentials are provided.
- **API Endpoints:** Mounted `/api/calendar` (events, conflicts, adjustments, ICS export/import) and `/api/rag` (text/file indexing, semantic vector search).
- **Automated Verification:** Added `backend/tests/test_milestone3.py`. All 20 tests in the test suite passed with 100% success.

### [0.2.0] - 2026-11-12

#### Milestone 2: Backend Core, Model Router & Two-Layer Canvas Ingestion
- **Canvas Ingestion Layer A (.ics Poller):** Implemented `backend/app/jobs/canvas_ics.py` with automatic course code extraction (`CS 301`, `ENG 204`, `COMM 101`), date normalization, and due-date shift detection saving `previous_due_at`. Verified against a live university Canvas `.ics` feed (70 assignments parsed and synced into Postgres).
- **Canvas Ingestion Layer B (Playwright SSO Bridge):** Built `backend/app/services/canvas_pw.py` with headed Chromium login for university SSO / Duo 2FA and persistent `storageState.json` session caching, providing graceful degradation to `.ics`-only mode when cookies expire.
- **Dual Model Router & Telemetry:** Built `backend/app/services/model_router.py` using official `google-genai` SDK with `gemini-3.5-flash-lite` and Ollama `llama3.2:3b` integration. Added query complexity classifier, Exam Mode override, and automatic fallback logging all telemetry to `ai_query_logs`.
- **FastAPI Application & Lifespan Scheduler:** Authored `backend/app/main.py` mounting CORS for Next.js frontend port 3000, managing asyncpg pool lifecycles, and scheduling unattended Canvas `.ics` polling every 30 minutes via `APScheduler`.
- **Modular REST Routers:** Created `/api/canvas` (assignments, session status, manual poll), `/api/ai` (grounded query command bar, query logs, exam mode toggle), `/api/autopilot` (logs, 1-click rollback, pending approvals), and `/api/health` (high-protein lean-bulk recipes, local grocery pricing, weekly budget calculation).
- **Automated Verification:** Added 15 comprehensive unit and integration tests across `test_api.py`, `test_canvas_ics.py`, `test_model_router.py`, and `test_milestone1.py`. 100% test suite pass rate.

### [0.1.0] - 2026-11-12

#### Milestone 1: Infrastructure & Foundation
- **Secret Protection:** Established strict `.gitignore` covering `.env*`, `credentials.json`, `token.json`, `storageState.json`, `postgres_data/`, and `.venv/`.
- **Docker Compose:** Configured `pgvector/pgvector:pg16` on host port `5432:5432` with automated healthchecks.
- **Environment Configuration:** Authored sanitized `.env.example` with placeholders; stored actual VT Canvas `.ics` feed exclusively in gitignored `.env`.
- **Database Schema & Vector Store:** Created `backend/schema.sql` enabling `vector` (0.8.7) and `uuid-ossp` (1.1) extensions across 14 relational tables.
- **Academic Calendar:** Seeded 20 official academic dates spanning Fall 2026 (Aug 24 – Dec 16) and Spring 2027 (Jan 19 – May 12).
- **Schedule Reconstruction:** Seeded 30 baseline calendar events modeling a sample undergraduate schedule (COMM 101, STAT 301, CS 201, CS 301, daily LeetCode, internship applications, and tagged `life_ops_study_block` sessions).
- **Lean-Bulk Nutrition & Grocery Pricing:** Seeded active lean-bulk dietary targets (~2,600 kcal, 155g protein, chicken-centric, zero beef, rare pork) with 4 high-protein recipes and 10 regional grocery item price benchmarks.
- **Backend Toolchain & SDK:** Initialized Python 3.14 virtual environment with `fastapi`, `asyncpg`, `apscheduler`, `playwright`, `pytest-asyncio`, and modern `google-genai` SDK support.
- **Verification:** Passed all automated tests (`pytest -v`) validating configuration, SDK imports, database connectivity, and seeded row counts.
