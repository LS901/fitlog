"use client";

import { NutritionInput } from "@/components/NutritionInput";
import { NutritionPanels } from "@/components/NutritionPanels";

export default function NutritionPage() {
  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-semibold">Food</h1>
      <NutritionPanels />
      <NutritionInput />
    </div>
  );
}
