-- =====================================================================
-- Life-Ops Assistant PostgreSQL Schema
-- Database: PostgreSQL 16 with pgvector & uuid-ossp
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ┌────────────────────────────────────────────────────────────────────┐
-- │ 1. Canvas / Academics                                              │
-- └────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS canvas_assignments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_uid      TEXT UNIQUE NOT NULL,       -- UID from .ics VEVENT
    course_name     TEXT,
    title           TEXT NOT NULL,
    description     TEXT,                       -- HTML from Playwright deep fetch
    due_at          TIMESTAMPTZ,
    previous_due_at TIMESTAMPTZ,               -- tracks shifts
    status          TEXT DEFAULT 'active'
                    CHECK (status IN ('active','completed','deleted')),
    ics_raw         TEXT,                       -- raw VEVENT block
    deep_fetched    BOOLEAN DEFAULT FALSE,
    is_tentative    BOOLEAN DEFAULT FALSE,      -- flagged if marked tentative in syllabus/feed
    syllabus_notes  TEXT,
    is_submitted    BOOLEAN DEFAULT FALSE,      -- whether student has submitted the assignment
    submission_status TEXT DEFAULT 'unsubmitted' CHECK (submission_status IN ('unsubmitted','submitted','graded')),
    submitted_at    TIMESTAMPTZ,                -- timestamp when submitted
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canvas_announcements (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id       TEXT UNIQUE NOT NULL,
    course_name     TEXT,
    title           TEXT NOT NULL,
    message         TEXT,
    posted_at       TIMESTAMPTZ,
    url             TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS university_dates (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    term        TEXT NOT NULL,                 -- e.g. 'Fall 2026', 'Spring 2027'
    label       TEXT NOT NULL,                 -- e.g. 'Fall 2026 Classes Begin'
    category    TEXT NOT NULL
                CHECK (category IN (
                    'semester_start','semester_end','add_drop',
                    'break','closure','exam_period','holiday','reading_day'
                )),
    start_date  DATE NOT NULL,
    end_date    DATE,                          -- NULL for single-day events
    notes       TEXT
);

-- ┌────────────────────────────────────────────────────────────────────┐
-- │ 2. Calendar, Routines & Tasks                                      │
-- └────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS calendar_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    google_event_id TEXT UNIQUE,                -- NULL if created purely in Life-Ops local UI
    external_uid    TEXT UNIQUE,                -- UID for synced .ics / webcal external feeds
    calendar_id     TEXT DEFAULT 'primary',     -- 'primary', 'academics', 'career', 'leetcode', etc.
    calendar_name   TEXT DEFAULT 'Personal',
    summary         TEXT NOT NULL,
    description     TEXT,
    location        TEXT,
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ NOT NULL,
    source          TEXT DEFAULT 'life_ops_manual'
                    CHECK (source IN ('life_ops_manual', 'life_ops_study_block', 'external', 'canvas_inferred')),
    status          TEXT DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
    recurring_rule  TEXT,                       -- e.g. 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'
    color           TEXT,                       -- hex or badge token
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_feeds (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name             TEXT NOT NULL,
    provider         TEXT NOT NULL
                     CHECK (provider IN ('google', 'apple', 'outlook', 'canvas', 'ics_url', 'ics_file')),
    feed_url         TEXT,
    calendar_id      TEXT NOT NULL DEFAULT 'external',
    color            TEXT DEFAULT '#38bdf8',
    sync_enabled     BOOLEAN DEFAULT TRUE,
    last_synced_at   TIMESTAMPTZ,
    last_event_count INT DEFAULT 0,
    last_error       TEXT,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_profile (
    id                    TEXT PRIMARY KEY DEFAULT 'default',
    full_name             TEXT DEFAULT '',
    first_name            TEXT DEFAULT '',
    institution           TEXT DEFAULT '',
    term_label            TEXT DEFAULT 'Current Term',
    major_or_role         TEXT DEFAULT '',
    city                  TEXT DEFAULT '',
    region                TEXT DEFAULT '',
    timezone              TEXT DEFAULT 'America/New_York',
    latitude              DOUBLE PRECISION,
    longitude             DOUBLE PRECISION,
    wake_time             TEXT DEFAULT '08:30',
    sleep_time            TEXT DEFAULT '23:30',
    study_sanctuary       TEXT DEFAULT '',
    canvas_base_url       TEXT DEFAULT '',
    canvas_ics_url        TEXT DEFAULT '',
    daily_calories_target INT DEFAULT 2600,
    daily_protein_g       INT DEFAULT 155,
    daily_carbs_g         INT DEFAULT 320,
    daily_fats_g          INT DEFAULT 75,
    dietary_notes         TEXT DEFAULT '',
    onboarding_completed  BOOLEAN DEFAULT FALSE,
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_knowledge_base (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category    TEXT NOT NULL DEFAULT 'note',
    title       TEXT NOT NULL,
    content     TEXT DEFAULT '',
    metadata    JSONB DEFAULT '{}',
    is_completed BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS google_tasks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    google_task_id  TEXT UNIQUE,
    task_list_id    TEXT DEFAULT 'default',
    title           TEXT NOT NULL,
    notes           TEXT,
    due_date        DATE,
    status          TEXT DEFAULT 'needsAction'
                    CHECK (status IN ('needsAction','completed')),
    source          TEXT DEFAULT 'life_ops_manual',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emails (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gmail_id        TEXT UNIQUE NOT NULL,
    thread_id       TEXT,
    subject         TEXT,
    sender          TEXT,
    sender_email    TEXT,
    snippet         TEXT,
    body_preview    TEXT,                       -- first 500 chars
    received_at     TIMESTAMPTZ,
    labels          TEXT[],
    priority        TEXT DEFAULT 'normal'
                    CHECK (priority IN ('urgent','high','normal','low')),
    triaged         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ┌────────────────────────────────────────────────────────────────────┐
-- │ 3. RAG / Document Embeddings (pgvector)                            │
-- └────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS document_embeddings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_type     TEXT NOT NULL
                    CHECK (source_type IN (
                        'drive','local_file','canvas_syllabus','resume','project_repo'
                    )),
    source_path     TEXT NOT NULL,             -- Drive file ID or local path
    chunk_index     INT NOT NULL,
    content         TEXT NOT NULL,
    embedding       vector(768),               -- Gemini text-embedding dimension
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_vector
    ON document_embeddings USING hnsw (embedding vector_cosine_ops);

-- ┌────────────────────────────────────────────────────────────────────┐
-- │ 4. Health, Lean Bulk & Grocery Engine                              │
-- └────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS dietary_rules (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_name   TEXT NOT NULL,
    rule_type   TEXT NOT NULL
                CHECK (rule_type IN ('restriction','preference','macro_target','calorie_target')),
    value       JSONB NOT NULL,                -- e.g. {"target_g": 155} or {"disallowed": ["beef"]}
    active      BOOLEAN DEFAULT TRUE,
    notes       TEXT
);

CREATE TABLE IF NOT EXISTS meal_templates (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                TEXT NOT NULL,
    meal_type           TEXT NOT NULL
                        CHECK (meal_type IN ('breakfast','lunch','dinner','snack','post_workout')),
    ingredients         JSONB NOT NULL,            -- [{name, qty, unit, protein_g, est_cost_cents}]
    prep_time_min       INT,
    calories            INT,
    protein_g           NUMERIC(5,1),
    cost_estimate_cents INT,                       -- estimated cost per serving in cents
    instructions        TEXT,
    tags                TEXT[]                     -- {'high-protein','chicken','lean-bulk','meal-prep'}
);

CREATE TABLE IF NOT EXISTS grocery_prices (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_name           TEXT NOT NULL,
    category            TEXT NOT NULL,             -- 'protein','carb','dairy','produce','pantry'
    typical_unit        TEXT NOT NULL,             -- 'lb', 'dozen', 'tub (32oz)', 'bag (5lb)'
    price_cents         INT NOT NULL,              -- active local price in cents
    store               TEXT DEFAULT 'Supermarket',
    city                TEXT DEFAULT 'Campus District',
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_macro_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    logged_date         DATE NOT NULL DEFAULT CURRENT_DATE,
    meal_name           TEXT NOT NULL,
    meal_type           TEXT DEFAULT 'lunch',
    calories            INT NOT NULL,
    protein_g           NUMERIC(5,1) NOT NULL,
    carbs_g             NUMERIC(5,1) DEFAULT 0,
    fat_g               NUMERIC(5,1) DEFAULT 0,
    cost_estimate_cents INT DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workout_splits (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,             -- e.g. 'Push (Chest, Shoulders, Triceps)'
    day_of_week     INT,                       -- 0=Mon, 6=Sun (NULL = flexible)
    exercises       JSONB NOT NULL,            -- [{name, sets, reps, target_rpe, notes}]
    duration_min    INT,
    notes           TEXT
);

-- ┌────────────────────────────────────────────────────────────────────┐
-- │ 5. Autopilot Logs, Gatekeeper & Rollback                           │
-- └────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS autopilot_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_type     TEXT NOT NULL,             -- 'study_block_shift','study_block_create','conflict_resolved'
    description     TEXT NOT NULL,
    affected_ids    UUID[] NOT NULL,           -- IDs of modified calendar_events
    rollback_payload JSONB NOT NULL,           -- complete state before modification
    undone          BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pending_actions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_type     TEXT NOT NULL,
    description     TEXT NOT NULL,
    diff_preview    JSONB NOT NULL,            -- structured before/after comparison
    status          TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','expired')),
    created_at      TIMESTAMPTZ DEFAULT now(),
    resolved_at     TIMESTAMPTZ
);

-- ┌────────────────────────────────────────────────────────────────────┐
-- │ 6. AI Query Logs & Routing Telemetry                               │
-- └────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS ai_query_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query           TEXT NOT NULL,
    routed_to       TEXT NOT NULL              -- 'local' | 'gemini'
                    CHECK (routed_to IN ('local','gemini')),
    model_name      TEXT,
    response        TEXT,
    latency_ms      INT,
    tokens_used     INT,
    exam_mode       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- =====================================================================
-- SEED DATA
-- =====================================================================

-- ── Official Academic Calendar (Fall 2026 & Spring 2027) ──
INSERT INTO university_dates (term, label, category, start_date, end_date, notes) VALUES
    ('Fall 2026', 'Fall 2026 Classes Begin', 'semester_start', '2026-08-24', NULL, 'First day of instruction'),
    ('Fall 2026', 'Labor Day - No Classes', 'holiday', '2026-09-07', NULL, 'University closed, no classes'),
    ('Fall 2026', 'Fall Break Day', 'break', '2026-10-09', NULL, 'No classes, university offices open'),
    ('Fall 2026', 'Thanksgiving Break', 'break', '2026-11-21', '2026-11-29', 'Classes end at noon on Wed Nov 25'),
    ('Fall 2026', 'Fall 2026 Classes End', 'semester_end', '2026-12-09', NULL, 'Last day of classes'),
    ('Fall 2026', 'Fall Reading Day', 'reading_day', '2026-12-10', NULL, 'No classes or exams'),
    ('Fall 2026', 'Fall 2026 Final Exams', 'exam_period', '2026-12-11', '2026-12-16', 'Final examination period'),
    ('Fall 2026', 'Fall 2026 Degree Conferral', 'semester_end', '2026-12-16', NULL, 'Fall graduation date'),
    ('Spring 2027', 'Spring Add/Drop Opens', 'add_drop', '2026-12-07', NULL, 'Course request adjustment opens at 7:00 AM'),
    ('Spring 2027', 'Martin Luther King Jr. Day', 'holiday', '2027-01-18', NULL, 'University closed, no classes'),
    ('Spring 2027', 'Spring 2027 Classes Begin', 'semester_start', '2027-01-19', NULL, 'First day of Spring instruction'),
    ('Spring 2027', 'Last Day to Add Classes', 'add_drop', '2027-01-25', NULL, 'Deadline for course additions'),
    ('Spring 2027', 'Census Date', 'add_drop', '2027-02-16', NULL, 'Spring enrollment census freeze'),
    ('Spring 2027', 'Last Day to Drop / P-F Option', 'add_drop', '2027-03-01', NULL, 'Deadline to drop individual courses or select P/F'),
    ('Spring 2027', 'Spring Break', 'break', '2027-03-06', '2027-03-14', 'No classes, university offices open M-F'),
    ('Spring 2027', 'Last Day to Resign from Semester', 'add_drop', '2027-03-30', NULL, 'Resignation deadline'),
    ('Spring 2027', 'Spring 2027 Classes End', 'semester_end', '2027-05-05', NULL, 'Last day of Spring classes'),
    ('Spring 2027', 'Spring Reading Day', 'reading_day', '2027-05-06', NULL, 'No classes or exams'),
    ('Spring 2027', 'Spring 2027 Final Exams', 'exam_period', '2027-05-07', '2027-05-12', 'Spring final examination period'),
    ('Spring 2027', 'Spring 2027 Degree Conferral', 'semester_end', '2027-05-12', NULL, 'Spring graduation date')
ON CONFLICT DO NOTHING;

-- ── Academic & Routine Schedule Baseline ─────────
-- Baseline dates aligned to sample week Nov 9 - Nov 13, 2026
INSERT INTO calendar_events (calendar_id, calendar_name, summary, description, location, start_time, end_time, source, color) VALUES
    -- COMM 1014 Public Speaking (MWF 10:10am - 11:00am, Hall 1008)
    ('academics', 'Academics', 'COMM 1014 - Public Speaking', 'Public Speaking lecture', 'Hall 1008', '2026-11-09 10:10:00-05', '2026-11-09 11:00:00-05', 'life_ops_manual', '#38bdf8'),
    ('academics', 'Academics', 'COMM 1014 - Public Speaking', 'Public Speaking lecture', 'Hall 1008', '2026-11-11 10:10:00-05', '2026-11-11 11:00:00-05', 'life_ops_manual', '#38bdf8'),
    ('academics', 'Academics', 'COMM 1014 - Public Speaking', 'Public Speaking lecture', 'Hall 1008', '2026-11-13 10:10:00-05', '2026-11-13 11:00:00-05', 'life_ops_manual', '#38bdf8'),

    -- STAT 3005 Statistical Methods (MWF 12:20pm - 1:10pm, Hall 338)
    ('academics', 'Academics', 'STAT 3005 - Stat Methods', 'Stat Methods for Engineers / Scientists', 'Hall 338', '2026-11-09 12:20:00-05', '2026-11-09 13:10:00-05', 'life_ops_manual', '#38bdf8'),
    ('academics', 'Academics', 'STAT 3005 - Stat Methods', 'Stat Methods for Engineers / Scientists', 'Hall 338', '2026-11-11 12:20:00-05', '2026-11-11 13:10:00-05', 'life_ops_manual', '#38bdf8'),
    ('academics', 'Academics', 'STAT 3005 - Stat Methods', 'Stat Methods for Engineers / Scientists', 'Hall 338', '2026-11-13 12:20:00-05', '2026-11-13 13:10:00-05', 'life_ops_manual', '#38bdf8'),

    -- CS 2505 Intro to Computer Organization (TR 12:30pm - 1:45pm, Center 2150)
    ('academics', 'Academics', 'CS 2505 - Intro to Comp Org', 'Intro to Computer Organization', 'Center 2150', '2026-11-10 12:30:00-05', '2026-11-10 13:45:00-05', 'life_ops_manual', '#38bdf8'),
    ('academics', 'Academics', 'CS 2505 - Intro to Comp Org', 'Intro to Computer Organization', 'Center 2150', '2026-11-12 12:30:00-05', '2026-11-12 13:45:00-05', 'life_ops_manual', '#38bdf8'),

    -- CS 3114 Data Structures (MW 4:00pm - 5:15pm, Hall 140)
    ('academics', 'Academics', 'CS 3114 - Data Structures', 'Data Structures & Algorithms', 'Hall 140', '2026-11-09 16:00:00-05', '2026-11-09 17:15:00-05', 'life_ops_manual', '#38bdf8'),
    ('academics', 'Academics', 'CS 3114 - Data Structures', 'Data Structures & Algorithms', 'Hall 140', '2026-11-11 16:00:00-05', '2026-11-11 17:15:00-05', 'life_ops_manual', '#38bdf8'),

    -- Study Session 1 (MWF 11am-12pm, TR 10:30am-12pm) - Tagged as life_ops_study_block for auto-pilot
    ('academics', 'Academics', 'Study Session 1', 'Focus study block', NULL, '2026-11-09 11:00:00-05', '2026-11-09 12:00:00-05', 'life_ops_study_block', '#f97316'),
    ('academics', 'Academics', 'Study Session 1', 'Focus study block', NULL, '2026-11-10 10:30:00-05', '2026-11-10 12:00:00-05', 'life_ops_study_block', '#f97316'),
    ('academics', 'Academics', 'Study Session 1', 'Focus study block', NULL, '2026-11-11 11:00:00-05', '2026-11-11 12:00:00-05', 'life_ops_study_block', '#f97316'),
    ('academics', 'Academics', 'Study Session 1', 'Focus study block', NULL, '2026-11-12 10:30:00-05', '2026-11-12 12:00:00-05', 'life_ops_study_block', '#f97316'),
    ('academics', 'Academics', 'Study Session 1', 'Focus study block', NULL, '2026-11-13 11:00:00-05', '2026-11-13 12:00:00-05', 'life_ops_study_block', '#f97316'),

    -- LeetCode Practice (Mon-Fri 2:00pm - 3:00pm)
    ('leetcode', 'LeetCode & Projects', 'LeetCode Practice', 'Daily algorithms problem solving', NULL, '2026-11-09 14:00:00-05', '2026-11-09 15:00:00-05', 'life_ops_manual', '#f59e0b'),
    ('leetcode', 'LeetCode & Projects', 'LeetCode Practice', 'Daily algorithms problem solving', NULL, '2026-11-10 14:00:00-05', '2026-11-10 15:00:00-05', 'life_ops_manual', '#f59e0b'),
    ('leetcode', 'LeetCode & Projects', 'LeetCode Practice', 'Daily algorithms problem solving', NULL, '2026-11-11 14:00:00-05', '2026-11-11 15:00:00-05', 'life_ops_manual', '#f59e0b'),
    ('leetcode', 'LeetCode & Projects', 'LeetCode Practice', 'Daily algorithms problem solving', NULL, '2026-11-12 14:00:00-05', '2026-11-12 15:00:00-05', 'life_ops_manual', '#f59e0b'),
    ('leetcode', 'LeetCode & Projects', 'LeetCode Practice', 'Daily algorithms problem solving', NULL, '2026-11-13 14:00:00-05', '2026-11-13 15:00:00-05', 'life_ops_manual', '#f59e0b'),

    -- Internship Applications (Mon-Fri 3:00pm - 4:00pm)
    ('career', 'Career & Applications', 'Internship Applications', 'Job search, resume tweaking, submissions', NULL, '2026-11-09 15:00:00-05', '2026-11-09 16:00:00-05', 'life_ops_manual', '#a855f7'),
    ('career', 'Career & Applications', 'Internship Applications', 'Job search, resume tweaking, submissions', NULL, '2026-11-10 15:00:00-05', '2026-11-10 16:00:00-05', 'life_ops_manual', '#a855f7'),
    ('career', 'Career & Applications', 'Internship Applications', 'Job search, resume tweaking, submissions', NULL, '2026-11-11 15:00:00-05', '2026-11-11 16:00:00-05', 'life_ops_manual', '#a855f7'),
    ('career', 'Career & Applications', 'Internship Applications', 'Job search, resume tweaking, submissions', NULL, '2026-11-12 15:00:00-05', '2026-11-12 16:00:00-05', 'life_ops_manual', '#a855f7'),
    ('career', 'Career & Applications', 'Internship Applications', 'Job search, resume tweaking, submissions', NULL, '2026-11-13 15:00:00-05', '2026-11-13 16:00:00-05', 'life_ops_manual', '#a855f7'),

    -- NLP Weekly w/ team (Thu 5:00pm - 6:00pm)
    ('leetcode', 'LeetCode & Projects', 'NLP Weekly w/ team', 'Project sync meeting', NULL, '2026-11-12 17:00:00-05', '2026-11-12 18:00:00-05', 'life_ops_manual', '#3b82f6'),

    -- Study Session 2 (M,W,R,F 7:00pm - 8:00pm)
    ('academics', 'Academics', 'Study Session 2', 'Evening revision and homework block', NULL, '2026-11-09 19:00:00-05', '2026-11-09 20:00:00-05', 'life_ops_study_block', '#f97316'),
    ('academics', 'Academics', 'Study Session 2', 'Evening revision and homework block', NULL, '2026-11-10 19:00:00-05', '2026-11-10 20:00:00-05', 'life_ops_study_block', '#f97316'),
    ('academics', 'Academics', 'Study Session 2', 'Evening revision and homework block', NULL, '2026-11-12 19:00:00-05', '2026-11-12 20:00:00-05', 'life_ops_study_block', '#f97316'),
    ('academics', 'Academics', 'Study Session 2', 'Evening revision and homework block', NULL, '2026-11-13 19:00:00-05', '2026-11-13 20:00:00-05', 'life_ops_study_block', '#f97316')
ON CONFLICT DO NOTHING;

-- ── Dietary Rules (Lean Bulk Phase - Active Student) ────────────
INSERT INTO dietary_rules (rule_name, rule_type, value, notes) VALUES
    ('Calorie Surplus Target', 'calorie_target', '{"target_kcal": 2600, "surplus_kcal": 250}', 'Lean bulk surplus for active student target weight'),
    ('Daily Protein Target', 'macro_target', '{"protein_g": 155, "carbs_g": 320, "fats_g": 75}', 'Target 1g protein per lb of body weight minimum'),
    ('No Beef', 'restriction', '{"disallowed": ["beef", "steak", "ground beef"]}', 'Strict dietary rule'),
    ('Rarely Pork', 'preference', '{"preference": "minimize", "max_servings_per_week": 1}', 'Limit pork intake; prefer poultry and dairy'),
    ('Chicken Primary', 'preference', '{"preferred": ["chicken breast", "chicken thighs", "eggs", "greek yogurt"]}', 'Primary whole-food protein sources')
ON CONFLICT DO NOTHING;

-- ── High-Protein Chicken-Centric Meal Templates ──────────────────────
INSERT INTO meal_templates (name, meal_type, ingredients, prep_time_min, calories, protein_g, cost_estimate_cents, instructions, tags) VALUES
    ('Chipotle Marinated Chicken Rice Bowl', 'lunch',
     '[{"name": "Chicken Breast", "qty": 8, "unit": "oz", "protein_g": 52, "est_cost_cents": 175},
       {"name": "Jasmine Rice (cooked)", "qty": 1.5, "unit": "cup", "protein_g": 6, "est_cost_cents": 40},
       {"name": "Black Beans", "qty": 0.5, "unit": "cup", "protein_g": 7, "est_cost_cents": 35},
       {"name": "Chipotle in Adobo & Lime", "qty": 1, "unit": "tbsp", "protein_g": 0, "est_cost_cents": 25}]',
     25, 680, 65.0, 275, 'Marinate chicken in chipotle, lime, and garlic. Pan sear 6-7 min per side. Serve over rice and beans.',
     ARRAY['high-protein','chicken','lean-bulk','meal-prep']),

    ('Honey Garlic Glazed Chicken & Broccoli', 'dinner',
     '[{"name": "Chicken Breast", "qty": 8, "unit": "oz", "protein_g": 52, "est_cost_cents": 175},
       {"name": "Broccoli Florets", "qty": 1.5, "unit": "cup", "protein_g": 4, "est_cost_cents": 60},
       {"name": "Jasmine Rice", "qty": 1.5, "unit": "cup", "protein_g": 6, "est_cost_cents": 40},
       {"name": "Honey, Soy Sauce & Garlic", "qty": 2, "unit": "tbsp", "protein_g": 1, "est_cost_cents": 35}]',
     20, 640, 63.0, 310, 'Dice chicken, cook with garlic. Glaze with honey-soy sauce and steam broccoli. Serve with rice.',
     ARRAY['high-protein','chicken','quick','dinner']),

    ('Egg White & Chicken Breast Breakfast Scramble', 'breakfast',
     '[{"name": "Eggs", "qty": 2, "unit": "large", "protein_g": 12, "est_cost_cents": 50},
       {"name": "Liquid Egg Whites", "qty": 0.75, "unit": "cup", "protein_g": 20, "est_cost_cents": 75},
       {"name": "Diced Chicken Breast", "qty": 3, "unit": "oz", "protein_g": 20, "est_cost_cents": 65},
       {"name": "Whole Wheat Toast", "qty": 2, "unit": "slices", "protein_g": 8, "est_cost_cents": 40}]',
     15, 520, 60.0, 230, 'Scramble eggs and egg whites with pre-cooked chicken breast. Toast whole wheat bread.',
     ARRAY['high-protein','breakfast','lean-bulk']),

    ('High-Protein Greek Yogurt Parfait', 'snack',
     '[{"name": "Plain Nonfat Greek Yogurt", "qty": 1.25, "unit": "cup", "protein_g": 28, "est_cost_cents": 110},
       {"name": "Whey Vanilla Protein Powder", "qty": 0.5, "unit": "scoop", "protein_g": 13, "est_cost_cents": 50},
       {"name": "Mixed Berries", "qty": 0.5, "unit": "cup", "protein_g": 1, "est_cost_cents": 65},
       {"name": "Honey & Granola", "qty": 2, "unit": "tbsp", "protein_g": 3, "est_cost_cents": 40}]',
     5, 420, 45.0, 265, 'Stir protein powder directly into Greek yogurt until smooth. Top with berries and granola.',
     ARRAY['high-protein','snack','post_workout','quick'])
ON CONFLICT DO NOTHING;

-- ── Regional Grocery Pricing Estimates ───────────────────
INSERT INTO grocery_prices (item_name, category, typical_unit, price_cents, store, city) VALUES
    ('Boneless Skinless Chicken Breast', 'protein', 'lb', 349, 'Supermarket', 'Campus District'),
    ('Large Grade A Eggs (Dozen)', 'protein', 'dozen', 279, 'Supermarket', 'Campus District'),
    ('Plain Nonfat Greek Yogurt (32 oz)', 'dairy', 'tub (32oz)', 399, 'Local Grocer', 'Campus District'),
    ('Jasmine Rice (5 lb bag)', 'carb', 'bag (5lb)', 629, 'Supermarket', 'Campus District'),
    ('Fresh Broccoli Crowns', 'produce', 'lb', 199, 'Supermarket', 'Campus District'),
    ('Old Fashioned Rolled Oats (42 oz)', 'carb', 'tub (42oz)', 399, 'Local Grocer', 'Campus District'),
    ('Bananas', 'produce', 'lb', 59, 'Supermarket', 'Campus District'),
    ('Canned Black Beans (15.5 oz)', 'carb', 'can', 99, 'Local Grocer', 'Campus District'),
    ('Whole Wheat Bread Loaf', 'carb', 'loaf', 249, 'Supermarket', 'Campus District'),
    ('Olive Oil Extra Virgin (16.9 oz)', 'pantry', 'bottle', 699, 'Supermarket', 'Campus District')
ON CONFLICT DO NOTHING;
