import { describe, expect, it } from "vitest";
import {
  e1rm,
  parseMeasurementCsv,
  parseProgrammeText,
  programmeToText,
  splitCsvLine,
} from "./measures";
import { PHASE_6_PROGRAMME } from "./seed";

describe("parseProgrammeText", () => {
  it("parses days, sets × reps, rest and trailing notes", () => {
    const days = parseProgrammeText(
      "# Day A\nBench Press 4x8 rest 90s (pause at bottom)\nRow 3×10-12 rest 2m",
    );
    expect(days).toEqual([
      {
        name: "Day A",
        exercises: [
          { name: "Bench Press", sets: 4, reps: "8", rest: 90, notes: "pause at bottom" },
          { name: "Row", sets: 3, reps: "10-12", rest: 120 },
        ],
      },
    ]);
  });

  it("joins `+` lines into a superset with the line above", () => {
    const [day] = parseProgrammeText("# A\nCurl 3x10\n+ Pushdown 3x10\nSquat 4x6\n+ Lunge 3x8\n+ Calf 3x15");
    expect(day.exercises.map((e) => e.group)).toEqual([1, 1, 2, 2, 2]);
  });

  it("parses duration-only moves as one set of minutes", () => {
    const [day] = parseProgrammeText("# A\nRowing machine 4min\nCross trainer 3-5min");
    expect(day.exercises).toEqual([
      { name: "Rowing machine", sets: 1, reps: "4min" },
      { name: "Cross trainer", sets: 1, reps: "3-5min" },
    ]);
  });

  it("keeps parentheses that are part of the name, not trailing notes", () => {
    const [day] = parseProgrammeText("# A\nShoulder press (Hammer Strength) 3x10 rest 60s");
    expect(day.exercises[0]).toEqual({
      name: "Shoulder press (Hammer Strength)",
      sets: 3,
      reps: "10",
      rest: 60,
    });
  });

  it("defaults to 3×8-12 for a bare name and creates a day when there is no heading", () => {
    expect(parseProgrammeText("Plank")).toEqual([
      { name: "Day 1", exercises: [{ name: "Plank", sets: 3, reps: "8-12" }] },
    ]);
  });

  it("ignores blank lines and returns nothing for empty text", () => {
    expect(parseProgrammeText("\n\n  \n")).toEqual([]);
  });
});

describe("programmeToText", () => {
  it("round-trips the seeded programme", () => {
    const text = programmeToText(PHASE_6_PROGRAMME.days);
    expect(parseProgrammeText(text)).toEqual(PHASE_6_PROGRAMME.days);
  });

  it("writes whole minutes of rest as `m` and supersets with `+`", () => {
    const text = programmeToText(parseProgrammeText("# A\nDeadlift 4x6 rest 120s\n+ Plank 3x30s rest 45s"));
    expect(text).toBe("# A\nDeadlift 4x6 rest 2m\n+ Plank 3x30s rest 45s");
  });
});

describe("e1rm", () => {
  it("uses Epley, and a single rep is the weight itself", () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 10)).toBeCloseTo(133.33, 2);
  });
});

describe("splitCsvLine", () => {
  it("handles quoted commas and trims cells", () => {
    expect(splitCsvLine('2026-11-01, "1,234", x')).toEqual(["2026-11-01", "1,234", "x"]);
  });
});

describe("parseMeasurementCsv", () => {
  it("maps known columns and skips blanks, unknown columns and bad dates", () => {
    const rows = parseMeasurementCsv(
      [
        "Date,Weight (kg),Fat mass (kg),Fat ratio (%),Comments",
        "2026-11-01T07:00:00Z,82.4,,18.2,hi",
        "not a date,80,,,",
        "2026-11-02T07:00:00Z,82.1,15,,",
      ].join("\r\n"),
    );
    expect(rows).toEqual([
      { date: "2026-11-01T07:00:00.000Z", type: "weight", value: 82.4, source: "csv" },
      { date: "2026-11-01T07:00:00.000Z", type: "bodyFat", value: 18.2, source: "csv" },
      { date: "2026-11-02T07:00:00.000Z", type: "weight", value: 82.1, source: "csv" },
    ]);
  });

  it("needs a date column and at least one data row", () => {
    expect(parseMeasurementCsv("Weight\n80")).toEqual([]);
    expect(parseMeasurementCsv("Date,Weight")).toEqual([]);
  });
});
