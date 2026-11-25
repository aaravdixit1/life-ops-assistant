from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import logging

from .config import settings
from .db import init_db, close_db
from .jobs.canvas_ics import poll_canvas_ics
from .services.calendar_feeds import sync_all_calendar_feeds
from .routers import canvas, ai, autopilot, health, calendar, rag, brief, profile

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger("life_ops")

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Life-Ops Assistant backend...")
    await init_db()

    # Schedule Canvas ICS poll every 30 minutes
    scheduler.add_job(
        poll_canvas_ics,
        "interval",
        minutes=30,
        id="canvas_ics_poll",
        replace_existing=True,
    )
    # Schedule external calendar feeds sync every 30 minutes
    scheduler.add_job(
        sync_all_calendar_feeds,
        "interval",
        minutes=30,
        id="calendar_feeds_sync",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("APScheduler started: canvas_ics_poll & calendar_feeds_sync active every 30 minutes.")

    yield

    # Shutdown
    logger.info("Shutting down Life-Ops Assistant...")
    scheduler.shutdown(wait=False)
    await close_db()


app = FastAPI(
    title="Life-Ops Assistant API",
    description="Autonomous Personal Life & Academic Operations Assistant",
    version="0.3.0",
    lifespan=lifespan,
)

# CORS configuration for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        f"http://localhost:{settings.frontend_port}",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3042",
        "http://127.0.0.1:3042",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(canvas.router, prefix="/api/canvas", tags=["Canvas Academics"])
app.include_router(calendar.router, prefix="/api/calendar", tags=["Calendar & Schedules"])
app.include_router(rag.router, prefix="/api/rag", tags=["RAG & Document Indexer"])
app.include_router(ai.router, prefix="/api/ai", tags=["AI Command Bar"])
app.include_router(autopilot.router, prefix="/api/autopilot", tags=["Autopilot & Undo"])
app.include_router(health.router, prefix="/api/health", tags=["Health & Meal Prep"])
app.include_router(brief.router, prefix="/api/brief", tags=["Daily Briefing"])
app.include_router(profile.router, prefix="/api/profile", tags=["User Profile & Setup"])


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "app": "life-ops-assistant", "version": "0.3.0"}


@app.get("/")
async def root():
    return {
        "message": "Life-Ops Assistant API operational",
        "docs_url": "/docs",
        "canvas_host": settings.canvas_base_url,
    }
