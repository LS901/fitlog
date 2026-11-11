import { db } from "./db";
import { parseProgrammeText } from "./measures";
import type { Programme } from "./types";

/** Phase 6 from ExpertPT: 2 Nov – 27 Dec 2026. Odd weeks = volume, even weeks = heavy. */
const PHASE_6 = `# Warm-up & mobility
Cross trainer 3-5min
Quad and hip flexor stretch 1x10 (each side)
Wall assisted chest stretch 1x10 (each side)
Knee across the body stretch 1x10 (each side)
Bent over trap 3 raise 1x12

# Session 1 · Heavy
Barbell Deadlift 4x6 rest 2m
Incline dumbbell chest press 4x6 rest 90s
+ Dumbbell single arm incline row 4x6 rest 90s (each side)
Leg extension 4x8 rest 60s
Shoulder press (Hammer Strength) 3x10 rest 60s
Full crunch 2x8 rest 60s
+ Conventional dead bugs 2x8-12 rest 60s (each side)
Rowing machine 4min

# Session 1 · Volume
Barbell Deadlift 4x8 rest 2m
Incline dumbbell chest press 4x8 rest 90s
+ Dumbbell single arm incline row 4x8 rest 90s (each side)
Leg extension 4x10 rest 60s
Shoulder press (Hammer Strength) 3x12 rest 60s
V Sits 2x10-12 rest 60s
+ Air bike 2x15 rest 60s (each side)
Rowing machine 2x2min rest 90s

# Session 2 · Heavy
Barbell back squats 4x6 rest 2m
Dumbbell chest press 4x6 rest 90s
+ Dumbbell bent over row (palms facing in) 4x6 rest 90s
Seated leg curl 4x8 rest 60s
Cable curl 3x10 rest 50s
+ Cable triceps pushdowns 3x10 rest 50s
Machine Seated Abduction 3x10 rest 50s
Otis up 3x10 rest 50s

# Session 2 · Volume
Barbell back squats 4x8 rest 2m
Dumbbell chest press 4x8 rest 90s
+ Dumbbell bent over row (palms facing in) 4x8 rest 90s
Seated leg curl 4x10 rest 60s
Barbell curl 3x12 rest 50s
+ Barbell skull crushers 3x12 rest 50s
Machine Seated Abduction 3x12 rest 50s
Sit ups 3x15 rest 50s

# Session 3 · Heavy
Flat barbell bench press 4x6 rest 90s
Diverging pulldown 4x6 rest 90s
Kettlebell swings 4x10 rest 2m
+ Goblet squats 4x10 rest 2m
Lateral raises 2x10 rest 60s
+ Seated triceps press 2x10 rest 60s
Elbows to knees 3x12 rest 50s
Incline treadmill 4min

# Session 3 · Volume
Flat barbell bench press 4x10 rest 90s
Diverging pulldown 4x10 rest 90s
Kettlebell swings 4x12 rest 2m
+ Goblet squats 4x12 rest 2m
Seated lateral raises 2x12 rest 55s
+ Seated triceps press 2x12 rest 55s
Half sits 3x15 rest 50s
Treadmill 5min`;

export const PHASE_6_PROGRAMME: Programme = {
  name: "Phase 6",
  days: parseProgrammeText(PHASE_6),
  phase: { start: "2026-11-02", weeks: 8 },
};

const FLAG = "fitlog.seeded.v1";

export async function seedIfEmpty() {
  try {
    if (localStorage.getItem(FLAG)) return;
    // Check-and-add in one transaction (concurrent calls queue behind it), and only mark as seeded
    // once it has committed: setting the flag first lost the seed if the first page load was cut short.
    await db.transaction("rw", db.programmes, async () => {
      if ((await db.programmes.count()) === 0) await db.programmes.add(PHASE_6_PROGRAMME);
    });
    localStorage.setItem(FLAG, "1");
  } catch {
    /* storage unavailable: skip seeding */
  }
}
