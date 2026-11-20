import { describe, expect, it } from "vitest";
import { allowsLibraryEquipment, describeEquipment, hasEquipment } from "./equipment";
import { alternativesFor } from "./exercises";

describe("describeEquipment", () => {
  it("groups the kit like the checklist, with weight limits and notes", () => {
    expect(
      describeEquipment({
        items: ["rower", "dumbbells", "adjustableBench", "legPress"],
        dumbbellMaxKg: 30,
        notes: "Cable stack tops out at 50 kg",
      }),
    ).toBe(
      [
        "Free weights: Adjustable bench, Dumbbells (up to 30 kg)",
        "Machines & cables: Leg press",
        "Cardio: Rowing machine",
        "Notes: Cable stack tops out at 50 kg",
      ].join("\n"),
    );
  });
});

describe("hasEquipment", () => {
  it("is false until something is ticked or written", () => {
    expect(hasEquipment(undefined)).toBe(false);
    expect(hasEquipment({ items: [] })).toBe(false);
    expect(hasEquipment({ items: [], notes: "  " })).toBe(false);
    expect(hasEquipment({ items: [], notes: "Just bands" })).toBe(true);
    expect(hasEquipment({ items: ["bands"] })).toBe(true);
  });
});

describe("allowsLibraryEquipment", () => {
  const home = { items: ["dumbbells", "adjustableBench", "pullupBar"] };
  it("filters by the library's equipment, letting bodyweight through", () => {
    expect(allowsLibraryEquipment(home, "dumbbell")).toBe(true);
    expect(allowsLibraryEquipment(home, "barbell")).toBe(false);
    expect(allowsLibraryEquipment(home, "machine")).toBe(false);
    expect(allowsLibraryEquipment(home, "body only")).toBe(true);
    expect(allowsLibraryEquipment(home, null)).toBe(true);
    expect(allowsLibraryEquipment({ items: ["legPress"] }, "machine")).toBe(true);
  });

  it("allows everything with no list", () => {
    expect(allowsLibraryEquipment(undefined, "barbell")).toBe(true);
    expect(allowsLibraryEquipment({ items: [] }, "machine")).toBe(true);
  });

  it("narrows swap alternatives", () => {
    const all = alternativesFor("Barbell back squats", [], 20);
    const home = alternativesFor("Barbell back squats", [], 20, (eq) =>
      allowsLibraryEquipment({ items: ["dumbbells"] }, eq),
    );
    expect(home.length).toBeLessThanOrEqual(all.length);
    expect(home.every((n) => all.includes(n))).toBe(true);
  });
});
