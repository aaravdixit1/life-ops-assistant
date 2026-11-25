# Life-Ops Assistant ⚡

> **An autonomous, local-first, zero-cost ($0/mo) personal chief-of-staff and daily operations engine for students and builders.**

[![Python](https://img.shields.io/badge/Python-3.11+_(Tested_on_3.14)-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16.4_Turbopack-000000?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16_with_pgvector-4169E1?style=flat&logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-06B6D4?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Cost](https://img.shields.io/badge/Monthly_Cost-$0-brightgreen.svg)](#architectural-invariants--cost-constraints)

---

### [🚀 Live Interactive Demo](https://life-ops-assistant.vercel.app)

> **Note:** Demo runs on sample data for fictional student **Alex Chen** with a simulated assistant. The full version runs locally with FastAPI, PostgreSQL, and local/cloud models—and ships with a built-in `/setup` onboarding wizard so anyone cloning the repo can connect their own calendars, Canvas feed, location, and macro goals in minutes.

| Daily Operational Dispatch (`/brief`) | Adaptive Weekly Calendar (`/schedule`) |
|:---:|:---:|
| ![Daily Brief](docs/images/daily-brief.png) | ![Weekly Schedule](docs/images/weekly-schedule.png) |
| **Lean Bulk & Macro Engine (`/health`)** | **Executive Direct-Line Assistant (`/assistant`)** |
| ![Macro Health](docs/images/health-macros.png) | ![Assistant Chat](docs/images/assistant-chat.png) |

---

## Table of Contents

- [Overview](#overview)
- [Quick Start: Standalone Demo Mode (Zero Dependencies)](#quick-start-standalone-demo-mode-zero-dependencies)
- [Modes: Demo Mode vs Personal Mode](#modes-demo-mode-vs-personal-mode)
- [Design Decisions](#design-decisions)
- [Architectural Invariants & Cost Constraints](#architectural-invariants--cost-constraints)
- [System Architecture](#system-architecture)
- [Key Features & Surfaces](#key-features--surfaces)
  - [1. Daily Executive Briefing (`/brief`)](#1-daily-executive-briefing-brief)
  - [2. Autonomous Weekly Schedule (`/schedule`)](#2-autonomous-weekly-schedule-schedule)
  - [3. Canvas Academic Ingestion (`/academics`)](#3-canvas-academic-ingestion-academics)
  - [4. Personal Chief-of-Staff Assistant (`/assistant`)](#4-personal-chief-of-staff-assistant-assistant)
  - [5. Health & Lean Bulk Engine (`/health`)](#5-health--lean-bulk-engine-health)
  - [6. Career & Habit Cadence Hub (`/career`)](#6-career--habit-cadence-hub-career)
- [First-Run Setup & Integrations (`/setup`)](#first-run-setup--integrations-setup)
- [Coolors.co Palette Engine](#coolorsco-palette-engine)
- [Full-Stack Setup: Run Locally with Real Backend](#full-stack-setup-run-locally-with-real-backend)
  - [Prerequisites](#prerequisites)
  - [Step 1: Clone and Configure Environment](#step-1-clone-and-configure-environment)
  - [Step 2: Start PostgreSQL (`pgvector`)](#step-2-start-postgresql-pgvector)
  - [Step 3: Backend Setup](#step-3-backend-setup)
  - [Step 4: Connect Your Integrations via `/setup` (or CLI)](#step-4-connect-your-integrations-via-setup-or-cli)
  - [Step 5: Frontend Setup](#step-5-frontend-setup)
  - [One-Command Runner Scripts](#one-command-runner-scripts)
  - [Deploying Demo Mode to Vercel](#deploying-demo-mode-to-vercel)
- [Dual-Model Router & Exam Mode](#dual-model-router--exam-mode)
- [Limitations, Privacy & Security](#limitations-privacy--security)
- [Verification & Testing](#verification--testing)
- [Repository Structure](#repository-structure)
- [License & Disclaimer](#license--disclaimer)

---

## Overview

**Life-Ops Assistant** is an open-source (MIT-licensed), self-hosted personal operations platform designed to automate the scheduling and logistical friction of a semester or busy engineering workflow: Canvas assignment shifts, lecture attendance, deep work focus blocks, nutrition and macro tracking, career pipelines, and daily habit cadences.

Unifying unstructured inputs (Canvas calendar feeds, multi-provider `.ics`/`webcal://` calendars, uploaded syllabi and notes, local grocery pricing, daily habits) into a cohesive dashboard, Life-Ops features an autonomous scheduling engine that operates under strict safety guardrails.

---

## Quick Start: Standalone Demo Mode (Zero Dependencies)

Try the full interactive dashboard immediately in your browser—**no Docker, no Python, no database, and no API keys required**:

```bash
git clone https://github.com/aaravdixit1/life-ops-assistant.git
cd life-ops-assistant

# Install frontend dependencies and launch standalone demo
npm run dev:demo
# or: ./run.sh demo
```

Open [http://localhost:3000](http://localhost:3000). The app runs entirely inside your browser using dynamic realistic sample data for fictional student **Alex Chen**, complete with simulated AI chat, 1-click autopilot rollbacks, and interactive calendar/macro logging.

---

## Modes: Demo Mode vs Personal Mode

Life-Ops Assistant supports two distinct operational modes:

| Feature / Invariant | 🌐 Demo Mode (Recruiter / Vercel Preview) | 🏢 Personal Mode (Local Full-Stack) |
|---|---|---|
| **Intended User** | Public evaluators, recruiters, portfolio preview | Self-hosted personal daily operations |
| **Backend & DB Required?** | **No** (100% standalone, runs purely in browser) | **Yes** (FastAPI on `:8000` + PostgreSQL via Docker) |
| **Data Source** | In-memory dynamic fixtures with `localStorage` persistence | Live PostgreSQL, Canvas/iCal feeds, Open-Meteo, local/cloud models |
| **User Identity** | Fictional student persona (**Alex Chen**, Fall 2026) | Your configured `/setup` profile (`user_profile`) |
| **External Network Calls** | **Strictly Forbidden** (Hard client-side network guard) | Active REST calls to local FastAPI, configured feeds, & model router |
| **How to Run** | `npm run dev:demo` or `./run.sh demo` | `npm run dev` or `./run.sh` |
| **Deployment Target** | 1-click Vercel deployment (`NEXT_PUBLIC_DEMO_MODE=true`) | Local-first (bound to `127.0.0.1`) |

---

## Design Decisions

### 1. Why Scoped Auto-Edits & Gatekeeper (Instead of Free Agentic Calendar Writes)?
Granting an LLM unrestricted write permissions to your primary calendar is unsafe: an inaccurate completion or prompt injection from an untrusted assignment description could delete an exam or reschedule a required lab. Life-Ops enforces **scoped autonomy**:
- Autonomous rescheduling is strictly restricted to events tagged `source="life_ops_study_block"`.
- Every automated adjustment logs a full `rollback_payload` to `autopilot_logs` for **1-click Undo**.
- Any modification touching fixed lectures, exams, or external commitments is intercepted by the **Action Gatekeeper**, requiring a structured diff preview and explicit user confirmation.

### 2. Why Two-Layer Canvas Ingestion (Instead of Just APIs or Web Scraping)?
University Canvas instances typically block student Personal Access Tokens. Life-Ops uses a resilient **two-layer ingestion strategy**:
1. **Unattended `.ics` feed polling (`canvas_ics.py`):** Runs every 30 minutes in the background to catch due-date shifts and new/deleted assignments without browser interaction or login credentials.
2. **Playwright session context (`canvas_pw.py`):** Uses cached session cookies (`storageState.json`) against any configured `CANVAS_BASE_URL` domain to deep-fetch rubrics, announcements, and syllabus files. When session cookies expire, the system degrades gracefully to `.ics`-only mode without crashing.

### 3. Why a Dual-Model Router (Instead of Solely Cloud or Local LLMs)?
- Relying exclusively on cloud LLMs incurs monthly costs and exposes private thoughts, schedules, and notes to third-party providers.
- Relying exclusively on local models strains laptop battery and heats up hardware during intensive study sessions.
- **The Dual-Model Router** classifies query complexity: simple schedule lookups and note extraction run on local **Ollama** (`llama3.2:3b`), while complex rescheduling, structured assignment parsing, and multi-source reasoning route to **Google Gemini Free Tier** (using your configured `GEMINI_MODEL` / workspace API key with automatic fallback across `gemini-3.5-flash` / `gemini-3.8-flash` / `gemini-2.5-flash` and deterministic local fallbacks if offline or quota-limited).
- **Exam Mode (`EXAM_MODE=true`)** temporarily forces 100% cloud routing to keep local CPU/GPU completely idle during exams.

---

## Architectural Invariants & Cost Constraints

The system adheres strictly to the invariants defined in [`GEMINI.md`](GEMINI.md):

1. **Zero Cost ($0/mo):**
   - Never introduces paid cloud dependencies or subscription APIs.
   - Storage runs in local Docker via `pgvector/pgvector:pg16`.
   - Local LLM inference runs via OpenAI-compatible endpoints (Ollama / MLX on Apple Silicon).
   - Cloud AI fallback utilizes Google AI Studio's Free Tier (configured in `.env` or `/setup`).
   - Location geocoding and live weather forecasts use **Open-Meteo** (no key required); live nearby grocery discovery uses **OpenStreetMap Nominatim + Photon**, and live product nutrition/brand search uses **Open Food Facts** (all free & keyless).

2. **Standalone Runtime:**
   - All background ingestion, calendar reconciliation, and polling jobs run via Python `APScheduler` inside `backend/`, completely independent of editor or external runners.

3. **Strict Secrets & Privacy Protection:**
   - `.env`, `storageState.json`, `credentials.json`, `token.json`, and private `.ics` feed URLs are permanently untracked in `.gitignore`.
   - Network services are bound strictly to localhost (`127.0.0.1`) to prevent exposure on local networks.

---

## System Architecture

```mermaid
flowchart TD
    subgraph Ingestion["Ingestion & Integration Layer"]
        ICS["Canvas Private .ics Feed<br/>(APScheduler every 30m)"]
        CalFeeds["Multi-Provider Calendar Feeds<br/>(Google, Apple webcal://, Outlook, .ics)"]
        PW["Playwright Headless Browser<br/>(Generic University SSO Storage)"]
        External["Free Keyless Public APIs<br/>(Open-Meteo, OSM Groceries, Open Food Facts)"]
    end

    subgraph Backend["FastAPI Backend (Python 3.11+)"]
        Router["Model Router & Assistant Engine<br/>(Ollama + Gemini Free Tier)"]
        Gatekeeper["Action Gatekeeper<br/>(Autopilot & Rollback Engine)"]
        RAG["Vector RAG Engine<br/>(pgvector Cosine Similarity)"]
        API["FastAPI REST Endpoints<br/>(/setup, /brief, /schedule, /health, /canvas)"]
    end

    subgraph Data["PostgreSQL 16 + pgvector (Docker: 127.0.0.1)"]
        PG_Profile[("user_profile & calendar_feeds")]
        PG_Cal[("calendar_events (events & tasks)")]
        PG_Canvas[("canvas_assignments")]
        PG_Health[("meal_templates & macro_logs")]
        PG_Chat[("assistant_sessions & messages")]
        PG_Logs[("autopilot_logs & rollback_payload")]
        PG_Embed[("document_embeddings (768-dim)")]
    end

    subgraph Frontend["Next.js 16 (App Router + Turbopack)"]
        Setup["/setup — Student Onboarding & Feeds"]
        Brief["/brief — Daily Operational Dispatch"]
        Schedule["/schedule — Overlap-Aware Calendar"]
        Academics["/academics — Canvas Tasks & AI Breakdown"]
        Health["/health — Meals, Macros & Live Groceries"]
        AssistantUI["/assistant — Scoped Assistant & Chat Logs"]
        Career["/career — Resume RAG & Pipeline"]
        ThemeEngine["Collapsible Sidebar (⌘B) & Coolors OKLCH"]
    end

    ICS -->|Due Dates & Shifts| API
    CalFeeds -->|External Events| API
    PW -->|HTML Rubrics & Files| API
    External -->|Weather & Store Catalog| API

    API <--> Gatekeeper
    API <--> RAG
    API <--> Router

    API <--> PG_Profile
    Gatekeeper <--> PG_Cal
    Gatekeeper <--> PG_Logs
    API <--> PG_Canvas
    API <--> PG_Health
    API <--> PG_Chat
    RAG <--> PG_Embed

    Frontend <-->|REST API| API
```

---

## Key Features & Surfaces

### 1. Daily Executive Briefing (`/brief`)
- **Weather & Commute Advisory:** Live temperature curves, precipitation probability, and clothing advisories via **Open-Meteo** for your configured city and timezone (simulated campus weather in demo mode).
- **Dynamic Timeline Rhythm:** Real-time schedule generated directly from Postgres `calendar_events` with live in-progress countdown indicators and travel blocks.
- **Canvas Deliverable Radar:** Real-time countdowns for assignments due today and across the 72-hour horizon, tracking submission status and grace windows.
- **Curated Reading Spotlight:** Daily literary spotlight synchronized with your reading shelf.
- **Randomized Fact Dispatch:** Non-repeating computing milestones, engineering history, and circadian trivia.

### 2. Autonomous Weekly Schedule (`/schedule`)
- **Multi-Column Cluster Layout & Banner Tasks:** Distinguishes timed schedule blocks (`event`) from Canvas deadline markers (`task`) across `Mon–Fri`, `7 Days`, and `Month` views while expanding recurring `RRULE` schedules cleanly.
- **Google-Calendar-Style Feed Toggles & Deletion:** Show/hide or delete individual uploaded/subscribed calendars (`Canvas Deadlines`, Google, Apple, Outlook, `.ics` imports) with synchronized state across all pages.
- **Autopilot Adaptive Rescheduling & 1-Click Undo:** Automatically shifts flexible study blocks (`source="life_ops_study_block"`) when due dates move, logging full `rollback_payload` snapshots in `autopilot_logs` for instant 1-click Undo.
- **Themed Modals & Compact Pickers:** Custom accessible `<ThemedSelect>` dropdowns and a compact Hour/Minute/AM-PM `<ThemedTimeSelect>` popover across Add/Edit Event modals.

### 3. Canvas Academic Ingestion (`/academics`)
- **Two-Layer Ingestion Pipeline:** Unattended private `.ics` feed parser combined with generic Playwright SSO browser fallback for any Canvas university domain.
- **AI Assignment Structuring & Summary:** Rate-limited Gemini analyzer (`10 RPM` sliding window + SHA-256 cache + deterministic fallback) structures assignment descriptions into `summary`, `general`, `deliverables`, `rubric`, and `resources_and_policies` tabs, converting embedded HTML links cleanly into clickable links.
- **1-Click Submission Toggle:** Toggle assignments between `unsubmitted` and `submitted` with live cross-page calendar & brief synchronization.

### 4. Personal Chief-of-Staff Assistant (`/assistant`)
- **Persistent, Deletable Chat Logs & Cross-Session Recall:** Saves multi-turn conversations and interactive card payloads (`assistant_sessions` & `assistant_messages` in PostgreSQL, plus `localStorage` in Demo Mode), automatically restores your last active conversation when navigating back, supports 1-click thread switching and deletion, and pulls recent prior chats for context.
- **Strictly Scoped & Card-Enabled:** Handles workspace greetings, schedule queries, Canvas deadlines, personal memory facts, and natural-language appointment proposals with interactive commitment/inspection cards while explicitly refusing out-of-scope general trivia without searching the web.
- **Collapsible Chat Rail & App Sidebar:** Toggle the desktop Chat Logs panel independently or collapse/expand the main workspace sidebar anytime (`⌘B` / `Ctrl+B` or the header toggle button).

### 5. Health & Lean Bulk Engine (`/health`)
- **Profile-Synced Macro Targets & Instant Meal Logging:** Gauges, 7-day charts, and batch meal prep sync directly to `/setup` targets; Quick Log, custom logging, and recipe deletion show instant confirmation feedback.
- **Live Nearby Store Catalog & Open Food Facts Search:** Discovers real nearby supermarkets within your configurable `1–25 mile` radius (OpenStreetMap Nominatim + Photon), compares a 64-staple catalog across up to 8 nearby stores, links meal ingredients to real local stores, lets you click any store card to browse its catalog, and integrates keyless **Open Food Facts** live product search with nutrition badges and 1-click `+ Log Macro`.

### 6. Career & Resume RAG Hub (`/career`)
- **Multi-Format Resume Upload & Inspector:** Upload `.pdf`, `.docx`, `.md`, or `.txt` resumes directly in `/career`, view indexed chunk counts, delete uploaded documents, and run live semantic search probes via `pgvector`.
- **Career Pipeline & Cadences:** Synced with Google/external career calendar blocks, LeetCode streak tracking, and Push/Pull/Legs workout schedules.

---

## First-Run Setup & Integrations (`/setup`)

When running Life-Ops Assistant locally in Personal Mode for the first time, open **`/setup`** in your browser (also accessible anytime from the sidebar) to configure everything without hand-editing database rows:

1. **College Profile, Location & Weather Radius:**
   - Configure your **Name**, **University**, **Class Standing**, **Expected Graduation**, multi-chip **Major(s) & Optional Minor(s)** (supporting double/triple majors), **Career Track / Target Role**, **Timezone**, **Compact Wake / Sleep Time Pickers**, **City**, and **`1–25 mi` Grocery Radius** (with live Open-Meteo weather).
2. **Canvas LMS Connection & Optional Gemini API Key:**
   - Set your school's Canvas domain (`CANVAS_BASE_URL`, e.g., `https://canvas.instructure.com` or `https://canvas.youruniversity.edu`), paste your private **Canvas Calendar Feed `.ics` URL**, and optionally save a **Google AI Studio Free Tier Gemini API Key** (`gemini_api_key`, masked in UI) for assignment breakdown and assistant reasoning.
   - Optionally launch a headed Chromium browser session (`npm run canvas:login`) to cache university SSO cookies in `storageState.json` for deep assignment rubrics and descriptions.
3. **Multi-Provider Calendar Sync & Management:**
   - **Google Calendar, Apple iCloud (`webcal://`), Outlook, & `.ics` Imports:** Subscribe to calendar URLs, upload Google OAuth `credentials.json`, import `.ics` files, and remove individual feeds anytime.
4. **Documents, Resumes & Syllabi (Local RAG):**
   - Upload `.pdf`, `.docx`, `.md`, or `.txt` course syllabi, resumes, or personal notes to chunk and index them into PostgreSQL `pgvector` (`document_embeddings`).
5. **Dietary & Macro Targets (and Sample Data Reset):**
   - Customize daily calorie, protein, carb, and fat goals (`user_profile` & `dietary_rules`), or clear sample/uploaded data with one click to start clean.

---

## Coolors.co Palette Engine

Life-Ops Assistant includes an interactive theme generator:
- **Coolors.co Live Import:** Paste any Coolors URL (`https://coolors.co/<hex1>-<hex2>-...`) or hyphenated hex string into the Appearance drawer to apply custom palettes persisted to `localStorage`.
- **Dynamic OKLCH Derivation:** Swatches are parsed into perceived lightness/chroma custom properties (`--bg-base`, `--bg-elevated`, `--border-hairline`, `--accent-primary`, `--semantic-success`), ensuring WCAG AA+ contrast in both Light and Dark modes.
- **Typography:** Pairs **Plus Jakarta Sans** for humanist editorial interfaces with **JetBrains Mono** strictly reserved for tabular numbers, timestamps, and diff comparisons.

---

## Full-Stack Setup: Run Locally with Real Backend

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or OrbStack)
- [Python 3.11+](https://www.python.org/) (Tested on Python 3.14)
- [Node.js 20+](https://nodejs.org/) and `npm`

---

### Fast Path: Two Short Commands

```bash
git clone https://github.com/aaravdixit1/life-ops-assistant.git
cd life-ops-assistant

# 1. One-time bootstrap (.env, Docker Postgres, Python .venv, DB schema, npm deps)
npm run setup        # or: ./run.sh setup

# 2. Launch PostgreSQL + FastAPI (:8000) + Next.js (:3000)
npm run dev          # or: ./run.sh
```

Then open **[http://localhost:3000/setup](http://localhost:3000/setup)** in your browser to add your profile, Canvas feed, external calendars, Gemini API key, and macro targets.

---

### Shortened Root Commands Reference

Run any of these from the repository root (`npm run <cmd>` or `./run.sh <arg>`):

| Short Command | Alternative (`run.sh`) | Action |
|---|---|---|
| `npm run setup` | `./run.sh setup` | One-time bootstrap: creates `.env`, starts Postgres, creates `backend/.venv`, installs Python & npm deps, and initializes the DB schema. |
| `npm run dev` | `./run.sh` | Starts PostgreSQL container, FastAPI (`127.0.0.1:8000`), and Next.js (`:3000`) in one unified terminal. |
| `npm run demo` | `./run.sh demo` | Installs frontend dependencies if needed and starts Next.js in Standalone Demo Mode (`http://localhost:3000`) with zero backend dependencies. |
| `npm run canvas:login` | `./run.sh canvas-login` | Launches Playwright Canvas SSO login helper (`storageState.json`) without manually activating `.venv`. |
| `npm run backend` | `./run.sh backend` | Starts only the FastAPI backend on `127.0.0.1:8000`. |
| `npm run frontend` | `./run.sh frontend` | Starts only the Next.js frontend on `:3000`. |
| `npm run test:all` | `./run.sh test` | Runs both backend `pytest` and frontend Demo Mode invariant tests. |
| `npm run build` | `./run.sh build` | Runs the Next.js production build verification. |
| `npm run stop` | `./run.sh stop` | Frees lingering processes on ports `8000`, `3000`, and `3001`. |

<details>
<summary>Manual Step-by-Step Setup (click to expand)</summary>

#### Step 1: Configure Environment
```bash
cp .env.example .env
```
Configure `.env` (optional fields can also be edited live inside `/setup`):
```env
DATABASE_URL=postgresql://lifeops:lifeops_dev@127.0.0.1:5432/lifeops
CANVAS_BASE_URL=https://canvas.instructure.com
CANVAS_ICS_URL=https://canvas.instructure.com/feeds/calendars/user_PLACEHOLDER.ics
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
CLOUD_LLM_ENABLED=true
LOCAL_MODEL_BASE_URL=http://localhost:11434/v1
LOCAL_MODEL_NAME=llama3.2:3b
EXAM_MODE=false
```

#### Step 2: Start PostgreSQL (`pgvector`)
```bash
docker compose up -d
```

#### Step 3: Backend Setup
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium   # optional, only for Canvas SSO deep fetch
PYTHONPATH=. python3 -c "import asyncio; from app.db import init_db; asyncio.run(init_db())"
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
Interactive API docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

#### Step 4: Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

</details>

---

### Deploying Demo Mode to Vercel

To deploy the standalone demo to Vercel:
1. Connect the repository in the **Vercel Dashboard**.
2. **Crucial:** In **Project Settings** → **Build & Development Settings**, set **Root Directory** to `frontend`.
3. In **Environment Variables**, add:
   ```env
   NEXT_PUBLIC_DEMO_MODE=true
   ```
4. Deploy. Vercel builds the Next.js app with demo mode active.

---

## Dual-Model Router & Exam Mode

Life-Ops Assistant uses a **Dual-Model Router** (`backend/app/services/model_router.py`):

```mermaid
flowchart LR
    Query[User Query] --> Classify{Complexity Classifier}
    Classify -->|Simple Parsing & Lookups| Local[Ollama / MLX<br/>llama3.2:3b on Apple Silicon]
    Classify -->|Complex Rescheduling & Multi-source| Gemini[Google AI Studio Free Tier<br/>gemini-2.5-flash]
    Local -.->|Automatic Fallback if offline| Gemini
```

- **Exam Mode (`EXAM_MODE=true`):** During intense study periods, Exam Mode automatically routes 100% of reasoning to Google AI Studio's cloud tier to keep local CPU/GPU cool and idle.
- **Local-Only Mode (`CLOUD_LLM_ENABLED=false`):** Disables all external cloud model routing, keeping all queries strictly on local Ollama (overriding Exam Mode). If local Ollama is offline or unreachable, the router returns an explicit error rather than silently falling back to Gemini.

---

## Limitations, Privacy & Security

### Limitations
- **Self-Hosted Design:** Built as a personal operations platform; does not include multi-tenant user authentication out of the box.
- **Session Lifespans:** Canvas deep rubrics require active session cookies. When expired, the system relies exclusively on the private `.ics` calendar feed until refreshed.
- **Free-Tier Model Rate Limits:** Google AI Studio free-tier quotas apply during heavy query bursts.

### Privacy
- **What Goes to Cloud LLMs:** When routing queries to Google Gemini, general prompt contents (such as calendar summaries or assignment specs) are processed via Google AI Studio's Free Tier. Under Google's free-tier terms, data may be used to train or improve models.
- **Local Knowledge Base Residency:** Personal dossier entries (residence, private notes, and dietary rules from `user_knowledge_base`) are automatically excluded from cloud prompts by default to preserve privacy. Setting `CLOUD_LLM_ENABLED=false` enforces 100% local data residency; if Ollama is unreachable when cloud routing is disabled, the router halts with an explicit error rather than silently calling Gemini.
- **Demo Mode Isolation:** Standalone Demo Mode is completely isolated: all external network requests are intercepted and blocked by a client-side network guard.

### Security & Prompt Injection Blast Radius
- **Untrusted Ingestion:** Canvas assignment descriptions, announcements, external `.ics` feeds, and syllabus text are treated as untrusted user input.
- **Action Gatekeeper Blast Radius Defense:** The assistant architecture isolates LLM actions. Even if a prompt injection attempts to trigger destructive commands (e.g., *"cancel all lectures"*), the backend **Action Gatekeeper** limits the blast radius strictly to flexible study blocks and newly created events (both of which insert full rollback payloads into `autopilot_logs` for instantaneous 1-click Undo), while strictly blocking any unconfirmed modifications or deletions of fixed lectures, exams, or external appointments.

### Personal-Use Disclaimer
> **Disclaimer:** The Canvas SSO automation and grocery price utilities are designed strictly for individual personal productivity and educational research. Always comply with institutional acceptable use policies and website terms of service.

---

## Verification & Testing

Run everything from the repo root with shortened commands (`./run.sh test` / `./run.sh build` or `npm run ...`):

### Run All Suites (`pytest` + Frontend Demo Tests)
```bash
npm run test:all
# or: ./run.sh test
```

### Individual Checks
```bash
npm run test:backend   # Backend pytest suite (API, Canvas .ics, Gatekeeper, Router, Store Catalog)
npm test               # Frontend Demo Mode invariant & network-guard tests
npm run build          # Next.js TypeScript + Turbopack production build
```

---

## Repository Structure

```text
life-ops-assistant/
├── LICENSE                  # MIT License
├── package.json             # Root unified runner commands (npm run dev / dev:demo)
├── run.sh                   # Friendly 1-command launcher
├── scripts/
│   └── dev.mjs              # Unified process manager & port cleaner
├── .env.example             # Template environment variables
├── docker-compose.yml       # PostgreSQL 16 + pgvector container definition
├── GEMINI.md                # Invariants, guardrails, and architectural rules
├── CHANGELOG.md             # Keep-a-Changelog formatted milestone history
├── docs/
│   └── images/              # Documentation screenshots
├── backend/
│   ├── requirements.txt     # Python dependencies
│   ├── schema.sql           # Database schema, pgvector indices, and baseline fixtures
│   ├── pytest.ini           # Pytest configuration
│   ├── data/
│   │   └── syllabi/         # Generic sample course syllabi for RAG testing
│   ├── app/
│   │   ├── main.py          # FastAPI application entrypoint & scheduler init
│   │   ├── config.py        # Pydantic v2 application settings
│   │   ├── db.py            # Asyncpg connection pooling & idempotent schema setup
│   │   ├── jobs/
│   │   │   └── canvas_ics.py # Unattended Canvas .ics feed background job
│   │   ├── routers/
│   │   │   ├── profile.py   # /setup profile, Open-Meteo geocoding, feeds & uploads
│   │   │   ├── brief.py     # Executive briefing & Assistant direct-line
│   │   │   ├── calendar.py  # Calendar CRUD, .ics import/export & de-confliction
│   │   │   ├── canvas.py    # Canvas assignment specs & submissions
│   │   │   ├── health.py    # Macro tracking, recipes, & grocery store engine
│   │   │   └── autopilot.py # Approval queue & 1-click Undo rollback
│   │   └── services/
│   │       ├── assistant_engine.py   # Scoped LLM assistant & direct-line router
│   │       ├── assistant_sessions.py # Persistent Postgres chat logs & cross-session recall
│   │       ├── assignment_analyzer.py# Rate-limited Gemini assignment structuring
│   │       ├── calendar_feeds.py     # Multi-provider .ics / webcal:// feed sync
│   │       ├── canvas_pw.py          # Playwright deep assignment fetching
│   │       ├── gatekeeper.py         # Guardrail enforcement (scoped auto-edits)
│   │       ├── grocery_service.py    # OSM nearby stores + Open Food Facts product catalog
│   │       ├── model_router.py       # Dual-model router (Ollama / Gemini Free Tier)
│   │       ├── profile_service.py    # User profile defaults & Open-Meteo geocoding
│   │       └── rag_indexer.py        # Multi-format (.pdf/.docx/.md/.txt) pgvector RAG
│   └── tests/               # Automated unit & integration tests
└── frontend/
    ├── package.json         # Next.js 16 + React 19 dependencies & scripts
    ├── next.config.ts       # Next.js Turbopack configuration
    ├── tests/
    │   └── demo-mode.test.mjs # Standalone demo mode invariant test suite
    └── src/
        ├── app/
        │   ├── setup/       # Student onboarding, feeds, Gemini key & RAG setup
        │   ├── brief/       # Daily Operational Dispatch broadsheet
        │   ├── schedule/    # Overlap-aware calendar grid & feed toggles
        │   ├── academics/   # Canvas deliverable radar & AI spec tabs
        │   ├── health/      # Meal prep, macro gauges & live nearby groceries
        │   ├── assistant/   # Scoped assistant with persistent deletable chat logs
        │   └── career/      # Resume RAG upload & internship pipeline
        ├── components/      # Collapsible sidebar, portal selects, modals & theme controls
        └── lib/
            ├── api.ts       # Type-safe client fetch abstractions
            ├── theme-engine.ts # Coolors.co URL parser & OKLCH generator
            ├── demo-mode.ts   # Demo environment detection & local toggles
            ├── demo-guard.ts  # Hard network guard (blocks external/API calls)
            ├── demo-service.ts# In-memory & localStorage mock service layer
            ├── demo-data.ts   # Dynamic sample fixtures for Alex Chen
            └── persona.ts     # Fictional vs local private profile switcher
```

---

## License & Disclaimer

- **License:** Distributed under the [MIT License](LICENSE) (`Copyright (c) 2026 Life-Ops Assistant Contributors`).
- **Built with:** [FastAPI](https://fastapi.tiangolo.com/), [Next.js](https://nextjs.org/), [Tailwind CSS](https://tailwindcss.com/), [pgvector](https://github.com/pgvector/pgvector), [Open-Meteo](https://open-meteo.com/), and [Lucide Icons](https://lucide.dev/).
