import type { Food } from '../types'
import { deriveCalories } from './macros'

export type FoodMacros = {
  protein: number
  carbs: number
  fats: number
  fiber: number
  calories: number
}

// Resolve the per-serving macros for a food. Plain foods return their own
// stored macros (calories derived if not set explicitly). Recipes sum each
// component's resolved macros × its qty. A `seen` set guards against cyclic
// recipe references (a recipe that includes itself, directly or indirectly).
export function resolveFoodMacros(
  food: Food,
  byId: Map<string, Food>,
  seen: Set<string> = new Set(),
): FoodMacros {
  if (!food.components || food.components.length === 0 || seen.has(food.id)) {
    const protein = food.protein || 0
    const carbs = food.carbs || 0
    const fats = food.fats || 0
    return {
      protein,
      carbs,
      fats,
      fiber: food.fiber || 0,
      calories: food.calories ?? deriveCalories(protein, carbs, fats),
    }
  }
  seen.add(food.id)
  const t: FoodMacros = { protein: 0, carbs: 0, fats: 0, fiber: 0, calories: 0 }
  for (const comp of food.components) {
    const cf = byId.get(comp.foodId)
    if (!cf) continue
    const m = resolveFoodMacros(cf, byId, seen)
    const q = comp.qty || 0
    t.protein += m.protein * q
    t.carbs += m.carbs * q
    t.fats += m.fats * q
    t.fiber += m.fiber * q
    t.calories += m.calories * q
  }
  seen.delete(food.id)
  return t
}

export function scaleMacros(m: FoodMacros, qty: number): FoodMacros {
  return {
    protein: m.protein * qty,
    carbs: m.carbs * qty,
    fats: m.fats * qty,
    fiber: m.fiber * qty,
    calories: m.calories * qty,
  }
}

export function roundMacros(m: FoodMacros): FoodMacros {
  return {
    protein: Math.round(m.protein),
    carbs: Math.round(m.carbs),
    fats: Math.round(m.fats),
    fiber: Math.round(m.fiber),
    calories: Math.round(m.calories),
  }
}

export function isRecipe(food: Food): boolean {
  return !!food.components && food.components.length > 0
}
