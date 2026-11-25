"""
Optional sample semester calendar seeder.
Replicates baseline weekly schedule events across sample semester instruction weeks
and inserts generic sample final exam blocks.
"""
import asyncio
from datetime import datetime, timedelta
from app.db import get_conn


async def seed_semester():
    async with get_conn() as conn:
        base_events = await conn.fetch("""
            SELECT calendar_id, calendar_name, summary, description, location,
                   start_time, end_time, source, color
            FROM calendar_events
            WHERE start_time >= '2026-11-09 00:00:00+00' AND start_time < '2026-11-14 00:00:00+00'
        """)
        print(f"Found {len(base_events)} base template events in Nov 9-13.")

        inserted = 0
        # Nov 16-20 (week offset +1) and Nov 30-Dec 4 (week offset +3)
        for week_offset in [1, 3]:
            for ev in base_events:
                new_start = ev["start_time"] + timedelta(weeks=week_offset)
                new_end = ev["end_time"] + timedelta(weeks=week_offset)

                exists = await conn.fetchval(
                    "SELECT id FROM calendar_events WHERE summary = $1 AND start_time = $2",
                    ev["summary"], new_start
                )
                if not exists:
                    await conn.execute("""
                        INSERT INTO calendar_events (
                            calendar_id, calendar_name, summary, description, location,
                            start_time, end_time, source, color
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    """, ev["calendar_id"], ev["calendar_name"], ev["summary"], ev["description"],
                    ev["location"], new_start, new_end, ev["source"], ev["color"])
                    inserted += 1

        # Dec 7-9 (Mon-Wed of final instruction week, offset +4)
        for ev in base_events:
            if ev["start_time"].weekday() in [0, 1, 2]:
                new_start = ev["start_time"] + timedelta(weeks=4)
                new_end = ev["end_time"] + timedelta(weeks=4)
                exists = await conn.fetchval(
                    "SELECT id FROM calendar_events WHERE summary = $1 AND start_time = $2",
                    ev["summary"], new_start
                )
                if not exists:
                    await conn.execute("""
                        INSERT INTO calendar_events (
                            calendar_id, calendar_name, summary, description, location,
                            start_time, end_time, source, color
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    """, ev["calendar_id"], ev["calendar_name"], ev["summary"], ev["description"],
                    ev["location"], new_start, new_end, ev["source"], ev["color"])
                    inserted += 1

        # Sample Final Exams in December
        final_exams = [
            ("CS 3114 Final Examination", "Data Structures & Algorithms Comprehensive Final", "Hall 140", "2026-12-11T13:05:00-05:00", "2026-12-11T15:05:00-05:00", "life_ops_manual", "#ef4444"),
            ("COMM 1014 Final Presentation", "Final Persuasive Speech Delivery", "Hall 1008", "2026-12-12T10:00:00-05:00", "2026-12-12T12:00:00-05:00", "life_ops_manual", "#38bdf8"),
            ("CS 2505 Final Examination", "Computer Organization Final Exam", "Center 2150", "2026-12-14T10:05:00-05:00", "2026-12-14T12:05:00-05:00", "life_ops_manual", "#ef4444"),
            ("STAT 3005 Final Examination", "Statistical Methods Final", "Hall 338", "2026-12-15T15:25:00-05:00", "2026-12-15T17:25:00-05:00", "life_ops_manual", "#ef4444"),
        ]
        for summary, desc, loc, st, et, src, col in final_exams:
            st_dt = datetime.fromisoformat(st)
            et_dt = datetime.fromisoformat(et)
            exists = await conn.fetchval(
                "SELECT id FROM calendar_events WHERE summary = $1 AND start_time = $2",
                summary, st_dt
            )
            if not exists:
                await conn.execute("""
                    INSERT INTO calendar_events (calendar_id, calendar_name, summary, description, location, start_time, end_time, source, color)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """, "academics", "Academics", summary, desc, loc, st_dt, et_dt, src, col)
                inserted += 1

        print(f"Successfully inserted {inserted} new recurring & exam events across November and December.")


if __name__ == "__main__":
    asyncio.run(seed_semester())
