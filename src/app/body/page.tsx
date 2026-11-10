"use client";

import { MetricPanel } from "@/components/MetricPanel";

export default function BodyPage() {
  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-semibold">Body</h1>
      <MetricPanel
        groups={[
          { title: "Weight", types: ["weight"] },
          { title: "Body fat", types: ["bodyFat"] },
          { title: "Lean & muscle mass", types: ["leanMass", "muscleMass"] },
          { title: "Measurements", types: ["waist", "chest", "hips", "arm", "thigh"] },
        ]}
        addable={[
          "weight",
          "bodyFat",
          "leanMass",
          "muscleMass",
          "waist",
          "chest",
          "hips",
          "arm",
          "thigh",
        ]}
      />
    </div>
  );
}
