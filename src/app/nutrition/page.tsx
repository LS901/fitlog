"use client";

import { AIInsights } from "@/components/AIInsights";
import { MaintenanceCard } from "@/components/MaintenanceCard";
import { NutritionInput } from "@/components/NutritionInput";
import { NutritionPanels } from "@/components/NutritionPanels";

export default function NutritionPage() {
  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-semibold">Food</h1>
      <NutritionPanels />
      <AIInsights tab="nutrition" />
      <NutritionInput />
      <MaintenanceCard />
    </div>
  );
}
