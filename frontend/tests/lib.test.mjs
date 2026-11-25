import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  STARTER_PALETTES,
  parseCoolorsInput,
  hexToOklch,
  deriveOklchTokens,
} from "../src/lib/theme-engine.ts";
import {
  cleanAssignmentTitle,
  formatTime,
  formatDate,
  toInputDate,
  toInputTime,
} from "../src/lib/formatters.ts";
import {
  getCalendarKey,
  isCalendarVisible,
} from "../src/lib/calendar-visibility.ts";

describe("Theme Engine (Coolors.co & OKLCH)", () => {
  test("parses Coolors.co URLs, Huemint URLs, and raw hex strings", () => {
    assert.deepEqual(
      parseCoolorsInput("https://coolors.co/1c1917-d97706-65a30d-dc2626-0284c7"),
      ["1c1917", "d97706", "65a30d", "dc2626", "0284c7"]
    );
    assert.deepEqual(
      parseCoolorsInput("https://huemint.com/brand-intersection/#palette=edd8d5-4a1707-545535-d5af5a"),
      ["edd8d5", "4a1707", "545535", "d5af5a"]
    );
    assert.deepEqual(parseCoolorsInput("#0f172a, #14b8a6, #eab308"), [
      "0f172a",
      "14b8a6",
      "eab308",
    ]);
    assert.deepEqual(parseCoolorsInput(""), []);
  });

  test("converts hex colors to valid OKLCH coordinates", () => {
    const amber = hexToOklch("d97706");
    assert.ok(amber.l > 0.4 && amber.l < 0.8);
    assert.ok(amber.c > 0.1);
    assert.ok(amber.h >= 0 && amber.h <= 360);
  });

  test("derives dark and light OKLCH token sets with required CSS variables", () => {
    const requiredKeys = [
      "--bg-base",
      "--bg-sidebar",
      "--bg-elevated",
      "--bg-surface",
      "--border-hairline",
      "--text-primary",
      "--text-secondary",
      "--accent-primary",
      "--semantic-success",
      "--semantic-warning",
      "--semantic-danger",
    ];
    for (const mode of ["dark", "light"]) {
      const tokens = deriveOklchTokens(STARTER_PALETTES[1].hexes, mode);
      for (const k of requiredKeys) {
        assert.ok(typeof tokens[k] === "string" && tokens[k].length > 0, `Missing ${k} (${mode})`);
      }
    }
  });
});

describe("Formatters & Assignment Title Normalization", () => {
  test("strips trailing Canvas course codes cleanly", () => {
    assert.equal(
      cleanAssignmentTitle("Project 2: Buffer Pool [CS_301_001]"),
      "Project 2: Buffer Pool"
    );
    assert.equal(cleanAssignmentTitle(""), "");
  });

  test("formats ISO timestamps into date, time, and input values", () => {
    const iso = "2026-11-25T14:30:00";
    assert.equal(toInputDate(iso), "2026-11-25");
    assert.equal(toInputTime(iso), "14:30");
    assert.match(formatTime(iso), /2:30\s*PM/);
    assert.match(formatDate(iso), /Nov\s+25/);
  });
});

describe("Calendar Visibility Helpers", () => {
  test("resolves calendar keys and hidden-list filtering", () => {
    assert.equal(getCalendarKey({ calendar_id: "canvas_deadlines", calendar_name: "Canvas Deadlines" }), "canvas_deadlines");
    assert.equal(getCalendarKey({ calendar_name: "Personal" }), "Personal");
    assert.equal(getCalendarKey({}), "primary");

    assert.equal(isCalendarVisible({ calendar_id: "canvas_deadlines" }, []), true);
    assert.equal(isCalendarVisible({ calendar_id: "canvas_deadlines" }, ["canvas_deadlines"]), false);
    assert.equal(isCalendarVisible({ calendar_id: "personal" }, ["canvas_deadlines"]), true);
  });
});
