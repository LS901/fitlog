"use client";

import { AIInsights } from "@/components/AIInsights";
import { GoalProgress } from "@/components/GoalProgress";
import { MetricPanel } from "@/components/MetricPanel";
import { useGoals } from "@/lib/useGoals";

export default function BodyPage() {
  const goals = useGoals();
  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-semibold">Body</h1>
      <GoalProgress />
      <AIInsights tab="body" />
      <MetricPanel
        groups={[
          { title: "Weight", types: ["weight"], goalLine: goals.weightKg },
          { title: "Body fat", types: ["bodyFat"] },
          { title: "Lean & muscle mass", types: ["leanMass", "muscleMass"] },
          { title: "Measurements", types: ["waist", "chest", "hips", "arm", "thigh"] },
          { title: "Fat mass", types: ["fatMass"], optional: true },
          { title: "Visceral fat", types: ["visceralFat"], optional: true },
          { title: "Bone mass", types: ["boneMass"], optional: true },
          { title: "Body water", types: ["bodyWater"], optional: true },
          { title: "Basal metabolic rate", types: ["bmr"], optional: true },
          { title: "Metabolic age", types: ["metabolicAge"], optional: true },
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
