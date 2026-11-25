"""
Optional sample tentative deliverable seeder.
Populates generic sample course deliverables and tentative exam milestones
matching the baseline sample courses in backend/schema.sql.
"""
import asyncio
import logging
from datetime import datetime
from zoneinfo import ZoneInfo
from app.db import init_db, get_conn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

EST = ZoneInfo("America/New_York")


async def reconcile_and_seed_tentative():
    await init_db()
    async with get_conn() as conn:
        logger.info("1. Reconciling sample deliverable submission statuses...")

        # COMM 1014 sample exercises
        await conn.execute("""
            UPDATE canvas_assignments
            SET is_submitted = true, submission_status = 'submitted', updated_at = now()
            WHERE course_name = 'COMM 1014' AND title ILIKE '%Citation%'
        """)

        await conn.execute("""
            UPDATE canvas_assignments
            SET is_submitted = false, submission_status = 'unsubmitted', updated_at = now()
            WHERE course_name = 'COMM 1014' AND title ILIKE '%Persuasive Speech Proposal%'
        """)

        # CS 2505 sample PA5
        await conn.execute("""
            UPDATE canvas_assignments
            SET is_submitted = false, submission_status = 'unsubmitted', updated_at = now()
            WHERE course_name = 'CS 2505' AND title ILIKE '%PA5%'
        """)

        # ENGE 2724 sample deliverables
        await conn.execute("""
            UPDATE canvas_assignments
            SET is_submitted = false, submission_status = 'unsubmitted', updated_at = now()
            WHERE course_name = 'ENGE 2724' AND (title ILIKE '%Next-Semester%' OR title ILIKE '%Check-In Week 12%')
        """)

        await conn.execute("""
            UPDATE canvas_assignments
            SET is_submitted = true, submission_status = 'submitted', updated_at = now()
            WHERE course_name = 'ENGE 2724' AND title ILIKE '%Meeting Minutes Week 11%'
        """)

        # STAT 3005 sample HW 5
        await conn.execute("""
            UPDATE canvas_assignments
            SET is_submitted = true, submission_status = 'submitted', updated_at = now()
            WHERE course_name = 'STAT 3005' AND title ILIKE '%HW 5%'
        """)

        # Ensure pending sample items are marked unsubmitted
        await conn.execute("""
            UPDATE canvas_assignments
            SET is_submitted = false, submission_status = 'unsubmitted', updated_at = now()
            WHERE (course_name = 'CS 3114' AND (title ILIKE '%Midterm 2%' OR title ILIKE '%Project2:%'))
               OR (course_name = 'CS 2505' AND (title ILIKE '%PA4%' OR title ILIKE '%Test 5%'))
        """)

        logger.info("2. Ingesting sample tentative deliverables into canvas_assignments...")

        tentative_deliverables = [
            # STAT 3005
            {
                "course_name": "STAT 3005",
                "title": "HW 6: Multiple Linear Regression & One-Way ANOVA [STAT 3005]",
                "description": "Homework 6 covering Simple Linear Regression, Multiple Linear Regression, and One-Way ANOVA.",
                "due_at": datetime(2026, 12, 4, 23, 59, 59, tzinfo=EST),
                "is_tentative": True,
                "status": "active",
                "canvas_uid": "stat3005_hw6_tentative",
            },
            {
                "course_name": "STAT 3005",
                "title": "Final Project: Engineering Statistical Analysis [STAT 3005]",
                "description": "Comprehensive statistical analysis report and regression models on an engineering dataset.",
                "due_at": datetime(2026, 12, 4, 23, 59, 59, tzinfo=EST),
                "is_tentative": True,
                "status": "active",
                "canvas_uid": "stat3005_final_proj_tentative",
            },
            {
                "course_name": "STAT 3005",
                "title": "Final Examination: Statistical Methods for Engineers [Hall 338]",
                "description": "Final exam covering Chapters 1-11: Two-sample hypothesis tests, regression, ANOVA, and SQC. Tuesday Dec 15, 3:25 PM - 5:25 PM in Hall 338.",
                "due_at": datetime(2026, 12, 15, 15, 25, 0, tzinfo=EST),
                "is_tentative": True,
                "status": "active",
                "canvas_uid": "stat3005_final_exam_tentative",
            },

            # CS 2505
            {
                "course_name": "CS 2505",
                "title": "CS 2505 Test 7 - Hardware Security & Buffer Overflows [CS 2505]",
                "description": "Test 7 covering stack frames, buffer overflows, return-to-libc concepts, and memory safety defenses. In-class Wednesday Dec 2.",
                "due_at": datetime(2026, 12, 2, 17, 15, 0, tzinfo=EST),
                "is_tentative": True,
                "status": "active",
                "canvas_uid": "cs2505_test7_tentative",
            },
            {
                "course_name": "CS 2505",
                "title": "PA6: Capstone Systems Architecture [CS 2505]",
                "description": "Programming Assignment 6: Capstone multi-stage pipelined processor caching simulator. Due Wednesday Dec 9 at 11:59 PM.",
                "due_at": datetime(2026, 12, 9, 23, 59, 59, tzinfo=EST),
                "is_tentative": True,
                "status": "active",
                "canvas_uid": "cs2505_pa6_tentative",
            },
            {
                "course_name": "CS 2505",
                "title": "CS 2505 Final Examination [Center 2150]",
                "description": "Comprehensive Final Exam for Intro to Computer Organization. Monday Dec 14, 10:05 AM - 12:05 PM in Center 2150.",
                "due_at": datetime(2026, 12, 14, 10, 5, 0, tzinfo=EST),
                "is_tentative": True,
                "status": "active",
                "canvas_uid": "cs2505_final_exam_tentative",
            },

            # CS 3114
            {
                "course_name": "CS 3114",
                "title": "Algorithm Comprehensive Exercises [CS 3114]",
                "description": "Complete all remaining interactive algorithm modules and complexity exercises. Due Thursday Dec 10.",
                "due_at": datetime(2026, 12, 10, 23, 59, 59, tzinfo=EST),
                "is_tentative": True,
                "status": "active",
                "canvas_uid": "cs3114_modules_tentative",
            },
            {
                "course_name": "CS 3114",
                "title": "Project 4: Buffer Pools & Advanced Disk Indexing [CS 3114]",
                "description": "Project 4: Disk-based buffer pool management, B-tree / spatial memory indexing. Due Sunday Dec 13 at 11:59 PM.",
                "due_at": datetime(2026, 12, 13, 23, 59, 59, tzinfo=EST),
                "is_tentative": True,
                "status": "active",
                "canvas_uid": "cs3114_proj4_tentative",
            },
            {
                "course_name": "CS 3114",
                "title": "CS 3114 Final Examination [Hall 140]",
                "description": "Comprehensive Final Examination covering data structures, algorithm analysis, sorting, graph algorithms, and indexing. Friday Dec 11, 1:05 PM - 3:05 PM in Hall 140.",
                "due_at": datetime(2026, 12, 11, 13, 5, 0, tzinfo=EST),
                "is_tentative": True,
                "status": "active",
                "canvas_uid": "cs3114_final_exam_tentative",
            },

            # ENGE 2724
            {
                "course_name": "ENGE 2724",
                "title": "Final Showcase Presentation [Innovation Studio]",
                "description": "Final Project Showcase exhibition in Innovation Studio (5:30 PM - 7:20 PM). Live demo and team poster presentation.",
                "due_at": datetime(2026, 12, 2, 17, 30, 0, tzinfo=EST),
                "is_tentative": True,
                "status": "active",
                "canvas_uid": "enge2724_showcase_tentative",
            },
        ]

        inserted_count = 0
        for item in tentative_deliverables:
            exists = await conn.fetchval(
                "SELECT id FROM canvas_assignments WHERE canvas_uid = $1 OR (course_name = $2 AND title = $3)",
                item["canvas_uid"], item["course_name"], item["title"]
            )
            if not exists:
                await conn.execute("""
                    INSERT INTO canvas_assignments (
                        canvas_uid, course_name, title, description, due_at,
                        is_tentative, is_submitted, submission_status, status, deep_fetched, created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, false, 'unsubmitted', $7, true, now(), now())
                """, item["canvas_uid"], item["course_name"], item["title"], item["description"],
                item["due_at"], item["is_tentative"], item["status"])
                inserted_count += 1
            else:
                await conn.execute("""
                    UPDATE canvas_assignments
                    SET due_at = $1, description = $2, is_tentative = $3, status = $4, updated_at = now()
                    WHERE id = $5
                """, item["due_at"], item["description"], item["is_tentative"], item["status"], exists)

        logger.info(f"Tentative deliverables inserted/updated: {inserted_count} new entries.")

        stat_rows = await conn.fetch(
            "SELECT course_name, title, due_at, is_submitted, is_tentative FROM canvas_assignments WHERE course_name ILIKE '%STAT%' ORDER BY due_at"
        )
        logger.info(f"STAT 3005 assignments count now: {len(stat_rows)}")
        for r in stat_rows:
            logger.info(f"  {r['title']} | Due: {r['due_at']} | Tentative: {r['is_tentative']}")


if __name__ == "__main__":
    asyncio.run(reconcile_and_seed_tentative())
