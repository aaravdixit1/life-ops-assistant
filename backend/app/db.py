import asyncio
import asyncpg
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from .config import settings
import logging

logger = logging.getLogger(__name__)

pool: asyncpg.Pool | None = None
_schema_ensured: bool = False


async def ensure_schema_extensions(conn: asyncpg.Connection) -> None:
    """Idempotently ensure tables & columns added for open-source onboarding exist."""
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS user_knowledge_base (
            id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            category     TEXT NOT NULL DEFAULT 'note',
            title        TEXT NOT NULL,
            content      TEXT DEFAULT '',
            metadata     JSONB DEFAULT '{}',
            is_completed BOOLEAN DEFAULT FALSE,
            created_at   TIMESTAMPTZ DEFAULT now(),
            updated_at   TIMESTAMPTZ DEFAULT now()
        );

        ALTER TABLE user_knowledge_base
            ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;

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

        ALTER TABLE calendar_events
            ADD COLUMN IF NOT EXISTS external_uid TEXT;

        ALTER TABLE calendar_events
            ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'event';

        UPDATE calendar_events
        SET item_type = 'task'
        WHERE source IN ('canvas_inferred', 'life_ops_study_block')
          AND (item_type IS NULL OR item_type = 'event');

        ALTER TABLE canvas_assignments
            ADD COLUMN IF NOT EXISTS ai_summary TEXT;

        ALTER TABLE canvas_assignments
            ADD COLUMN IF NOT EXISTS ai_sections JSONB;

        ALTER TABLE canvas_assignments
            ADD COLUMN IF NOT EXISTS ai_content_hash TEXT;

        ALTER TABLE canvas_assignments
            ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;

        ALTER TABLE canvas_assignments
            ADD COLUMN IF NOT EXISTS ai_model TEXT;

        ALTER TABLE user_profile
            ADD COLUMN IF NOT EXISTS gemini_api_key TEXT DEFAULT '';

        ALTER TABLE user_profile
            ADD COLUMN IF NOT EXISTS majors JSONB DEFAULT '[]'::jsonb;

        ALTER TABLE user_profile
            ADD COLUMN IF NOT EXISTS minors JSONB DEFAULT '[]'::jsonb;

        ALTER TABLE user_profile
            ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT '';

        ALTER TABLE user_profile
            ADD COLUMN IF NOT EXISTS expected_graduation TEXT DEFAULT '';

        ALTER TABLE user_profile
            ADD COLUMN IF NOT EXISTS career_role TEXT DEFAULT '';

        ALTER TABLE user_profile
            ADD COLUMN IF NOT EXISTS grocery_radius_miles INT DEFAULT 5;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_external_uid
            ON calendar_events(external_uid)
            WHERE external_uid IS not NULL;

        CREATE TABLE IF NOT EXISTS assistant_sessions (
            id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            title       TEXT NOT NULL DEFAULT 'New Conversation',
            created_at  TIMESTAMPTZ DEFAULT now(),
            updated_at  TIMESTAMPTZ DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS assistant_messages (
            id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            session_id  UUID NOT NULL REFERENCES assistant_sessions(id) ON DELETE CASCADE,
            role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
            content     TEXT NOT NULL,
            payload     JSONB DEFAULT '{}'::jsonb,
            created_at  TIMESTAMPTZ DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_assistant_sessions_updated
            ON assistant_sessions(updated_at DESC);

        CREATE INDEX IF NOT EXISTS idx_assistant_messages_session_created
            ON assistant_messages(session_id, created_at ASC);
    """)


async def init_db() -> asyncpg.Pool:
    global pool, _schema_ensured
    current_loop = asyncio.get_running_loop()
    if pool is not None:
        # Check if the pool's event loop is still running
        try:
            if getattr(pool, "_loop", None) is not current_loop or getattr(pool, "_closed", False):
                await close_db()
        except Exception:
            pool = None

    if pool is None:
        dsn = settings.database_url
        if dsn.startswith("postgresql://"):
            dsn = dsn.replace("postgresql://", "postgres://", 1)
        logger.info("Initializing asyncpg connection pool...")
        pool = await asyncpg.create_pool(
            dsn=dsn,
            min_size=1,
            max_size=10,
            command_timeout=60,
        )
        _schema_ensured = False

    if not _schema_ensured:
        async with pool.acquire() as conn:
            await ensure_schema_extensions(conn)
        _schema_ensured = True

    return pool


async def close_db() -> None:
    global pool, _schema_ensured
    if pool is not None:
        try:
            await pool.close()
        except Exception:
            pass
        pool = None
    _schema_ensured = False


@asynccontextmanager
async def get_conn() -> AsyncGenerator[asyncpg.Connection, None]:
    global pool
    current_loop = asyncio.get_running_loop()
    if pool is None or getattr(pool, "_loop", None) is not current_loop or getattr(pool, "_closed", False):
        await init_db()
    async with pool.acquire() as conn:
        yield conn
