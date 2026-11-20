"use client";

import { MetricPanel } from "@/components/MetricPanel";

export default function VitalsPage() {
  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-semibold">Vitals</h1>
      <MetricPanel
        groups={[
          { title: "Resting heart rate", types: ["restingHr"] },
          { title: "Blood pressure", types: ["systolic", "diastolic"] },
          { title: "SpO₂", types: ["spo2"] },
          { title: "Sleep", types: ["sleepHours"] },
          { title: "Steps", types: ["steps"] },
          { title: "Vascular age", types: ["vascularAge"], optional: true },
          { title: "Pulse wave velocity", types: ["pwv"], optional: true },
          { title: "VO₂ max", types: ["vo2max"], optional: true },
          { title: "Temperature", types: ["temperature"], optional: true },
        ]}
        addable={["restingHr", "systolic", "diastolic", "spo2", "sleepHours", "steps"]}
      />
    </div>
  );
}
