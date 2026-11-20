import { z } from "zod";

/**
 * The kit the user can train with (Settings → Equipment, `settings.equipment`). A tap-to-toggle
 * checklist rather than a CSV: quicker on a phone, and the ids map cleanly onto the exercise
 * library's equipment field. Anything unusual goes in `notes`. Used by the phase generator (sent
 * as text with the brief) and by the swap list on a workout (`allowsLibraryEquipment`).
 */

export interface EquipmentItem {
  id: string;
  label: string;
}

export const EQUIPMENT_GROUPS: { title: string; items: EquipmentItem[] }[] = [
  {
    title: "Free weights",
    items: [
      { id: "barbell", label: "Barbell & plates" },
      { id: "rack", label: "Squat / power rack" },
      { id: "flatBench", label: "Flat bench" },
      { id: "adjustableBench", label: "Adjustable bench" },
      { id: "dumbbells", label: "Dumbbells" },
      { id: "kettlebells", label: "Kettlebells" },
      { id: "ezBar", label: "EZ curl bar" },
      { id: "trapBar", label: "Trap / hex bar" },
      { id: "landmine", label: "Landmine" },
    ],
  },
  {
    title: "Machines & cables",
    items: [
      { id: "cable", label: "Cable stack / crossover" },
      { id: "latPulldown", label: "Lat pulldown" },
      { id: "seatedRow", label: "Seated row" },
      { id: "smith", label: "Smith machine" },
      { id: "legPress", label: "Leg press" },
      { id: "hackSquat", label: "Hack squat" },
      { id: "legExtension", label: "Leg extension" },
      { id: "legCurl", label: "Leg curl" },
      { id: "chestPress", label: "Chest press machine" },
      { id: "pecDeck", label: "Pec deck / rear delt fly" },
      { id: "shoulderPress", label: "Shoulder press machine" },
      { id: "gluteMachine", label: "Hip thrust / glute machine" },
      { id: "calfRaise", label: "Calf raise machine" },
      { id: "assistedPullup", label: "Assisted pull-up / dip" },
    ],
  },
  {
    title: "Bodyweight & accessories",
    items: [
      { id: "pullupBar", label: "Pull-up bar" },
      { id: "dipStation", label: "Dip station" },
      { id: "bands", label: "Resistance bands" },
      { id: "suspension", label: "Suspension trainer (TRX)" },
      { id: "box", label: "Plyo box / step" },
      { id: "medBall", label: "Medicine ball" },
      { id: "swissBall", label: "Swiss ball" },
      { id: "abWheel", label: "Ab wheel" },
      { id: "sled", label: "Sled" },
    ],
  },
  {
    title: "Cardio",
    items: [
      { id: "treadmill", label: "Treadmill" },
      { id: "rower", label: "Rowing machine" },
      { id: "bike", label: "Exercise bike" },
      { id: "airBike", label: "Air bike" },
      { id: "crossTrainer", label: "Cross trainer" },
      { id: "stairs", label: "Stair climber" },
      { id: "skiErg", label: "Ski erg" },
    ],
  },
];

const ALL_ITEMS = EQUIPMENT_GROUPS.flatMap((g) => g.items);
const LABEL = new Map(ALL_ITEMS.map((i) => [i.id, i.label]));

export const EquipmentSchema = z.object({
  items: z.array(z.string().max(40)).max(80),
  dumbbellMaxKg: z.number().positive().max(200).optional(),
  kettlebellMaxKg: z.number().positive().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});
export type MyEquipment = z.infer<typeof EquipmentSchema>;

export const EQUIPMENT_KEY = "equipment";
export const NO_EQUIPMENT: MyEquipment = { items: [] };

const MACHINES = EQUIPMENT_GROUPS[1].items.map((i) => i.id).filter((id) => id !== "cable");

export const EQUIPMENT_PRESETS: { label: string; items: string[] }[] = [
  { label: "Full gym", items: ALL_ITEMS.map((i) => i.id) },
  {
    label: "Home gym",
    items: ["barbell", "rack", "adjustableBench", "dumbbells", "pullupBar", "bands"],
  },
  {
    label: "Hotel gym",
    items: ["dumbbells", "adjustableBench", "cable", "treadmill", "bike", "swissBall"],
  },
];

/** True when the user has filled anything in, so the generator should use it. */
export const hasEquipment = (e: MyEquipment | undefined): e is MyEquipment =>
  !!e && (e.items.length > 0 || !!e.notes?.trim());

/** Plain-text list for the phase generator's prompt, grouped like the checklist. */
export function describeEquipment(e: MyEquipment): string {
  const have = new Set(e.items);
  const lines: string[] = [];
  for (const g of EQUIPMENT_GROUPS) {
    const labels = g.items
      .filter((i) => have.has(i.id))
      .map((i) => {
        if (i.id === "dumbbells" && e.dumbbellMaxKg) return `${i.label} (up to ${e.dumbbellMaxKg} kg)`;
        if (i.id === "kettlebells" && e.kettlebellMaxKg) return `${i.label} (up to ${e.kettlebellMaxKg} kg)`;
        return i.label;
      });
    if (labels.length) lines.push(`${g.title}: ${labels.join(", ")}`);
  }
  const unknown = e.items.filter((id) => !LABEL.has(id));
  if (unknown.length) lines.push(`Other: ${unknown.join(", ")}`);
  if (e.notes?.trim()) lines.push(`Notes: ${e.notes.trim()}`);
  return lines.join("\n");
}

/**
 * Whether an exercise from the library (free-exercise-db `equipment` values) can be done with this
 * kit. Coarse on purpose: any machine counts for "machine", and bodyweight/other always pass. With
 * no list set, everything passes.
 */
export function allowsLibraryEquipment(e: MyEquipment | undefined, libraryEquipment?: string | null): boolean {
  if (!e || !e.items.length || !libraryEquipment) return true;
  const have = new Set(e.items);
  switch (libraryEquipment) {
    case "barbell":
      return have.has("barbell");
    case "e-z curl bar":
      return have.has("ezBar") || have.has("barbell");
    case "dumbbell":
      return have.has("dumbbells");
    case "kettlebells":
      return have.has("kettlebells");
    case "cable":
      return have.has("cable") || have.has("latPulldown") || have.has("seatedRow");
    case "machine":
      return MACHINES.some((id) => have.has(id)) || have.has("smith");
    case "bands":
      return have.has("bands");
    case "medicine ball":
      return have.has("medBall");
    case "exercise ball":
      return have.has("swissBall");
    default:
      return true;
  }
}
