"use client";

import { GoalProgress } from "@/components/GoalProgress";
import { MetricPanel } from "@/components/MetricPanel";
import { useGoals } from "@/lib/useGoals";

export default function BodyPage() {
  const goals = useGoals();
  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-semibold">Body</h1>
      <GoalProgress />
      <MetricPanel
        groups={[
          { title: "Weight", types: ["weight"], goalLine: goals.weightKg },
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
