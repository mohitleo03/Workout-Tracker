/**
 * Starter food catalog. Macros are per `servingSize` of `servingUnit` and are
 * good-enough averages from standard composition tables (IFCT / USDA), not
 * brand-exact numbers - the app rescales them to whatever quantity is logged.
 */
export const FOODS = [
  // ---------------------------------------------------------------- grains
  { name: 'Roti / Chapati (whole wheat)', category: 'grains', servingSize: 1, servingUnit: 'piece', calories: 104, protein: 3.1, carbs: 20.5, fat: 1.2, sugar: 0.4, fiber: 2.7 },
  { name: 'Cooked white rice', category: 'grains', servingSize: 100, servingUnit: 'g', calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3, sugar: 0.1, fiber: 0.4 },
  { name: 'Cooked brown rice', category: 'grains', servingSize: 100, servingUnit: 'g', calories: 123, protein: 2.7, carbs: 25.6, fat: 1, sugar: 0.4, fiber: 1.6 },
  { name: 'Oats (dry)', category: 'grains', servingSize: 100, servingUnit: 'g', calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9, sugar: 0, fiber: 10.6 },
  { name: 'Poha (dry)', category: 'grains', servingSize: 100, servingUnit: 'g', calories: 350, protein: 6.6, carbs: 77.3, fat: 1.2, sugar: 0.3, fiber: 2.2 },
  { name: 'Whole wheat bread', category: 'grains', servingSize: 1, servingUnit: 'slice', calories: 69, protein: 3.6, carbs: 11.6, fat: 1.1, sugar: 1.4, fiber: 1.9 },
  { name: 'Daliya / broken wheat (dry)', category: 'grains', servingSize: 100, servingUnit: 'g', calories: 342, protein: 12.3, carbs: 71.2, fat: 1.5, sugar: 0.4, fiber: 12.5 },
  { name: 'Idli', category: 'grains', servingSize: 1, servingUnit: 'piece', calories: 58, protein: 1.9, carbs: 12.1, fat: 0.2, sugar: 0.1, fiber: 0.6 },
  { name: 'Plain dosa', category: 'grains', servingSize: 1, servingUnit: 'piece', calories: 133, protein: 2.7, carbs: 20.8, fat: 4.2, sugar: 0.3, fiber: 1 },
  { name: 'Paratha (plain)', category: 'grains', servingSize: 1, servingUnit: 'piece', calories: 210, protein: 4.5, carbs: 28, fat: 8.5, sugar: 0.6, fiber: 3 },

  // --------------------------------------------------------------- protein
  { name: 'Chicken breast (cooked, skinless)', category: 'protein', servingSize: 100, servingUnit: 'g', calories: 165, protein: 31, carbs: 0, fat: 3.6, sugar: 0, fiber: 0 },
  { name: 'Chicken thigh (cooked, skinless)', category: 'protein', servingSize: 100, servingUnit: 'g', calories: 209, protein: 26, carbs: 0, fat: 10.9, sugar: 0, fiber: 0 },
  { name: 'Whole egg (large)', category: 'protein', servingSize: 1, servingUnit: 'piece', calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8, sugar: 0.2, fiber: 0 },
  { name: 'Egg white (large)', category: 'protein', servingSize: 1, servingUnit: 'piece', calories: 17, protein: 3.6, carbs: 0.2, fat: 0.1, sugar: 0.2, fiber: 0 },
  { name: 'Paneer (full fat)', category: 'protein', servingSize: 100, servingUnit: 'g', calories: 296, protein: 18.3, carbs: 3.6, fat: 22.8, sugar: 2.6, fiber: 0 },
  { name: 'Paneer (low fat)', category: 'protein', servingSize: 100, servingUnit: 'g', calories: 206, protein: 24, carbs: 4, fat: 10.5, sugar: 3, fiber: 0 },
  { name: 'Soya chunks (dry)', category: 'protein', servingSize: 100, servingUnit: 'g', calories: 345, protein: 52, carbs: 33, fat: 0.5, sugar: 8, fiber: 13 },
  { name: 'Tofu', category: 'protein', servingSize: 100, servingUnit: 'g', calories: 76, protein: 8.1, carbs: 1.9, fat: 4.8, sugar: 0.6, fiber: 0.3 },
  { name: 'Whey protein isolate', category: 'supplement', servingSize: 30, servingUnit: 'g', calories: 113, protein: 25, carbs: 1.5, fat: 0.5, sugar: 0.8, fiber: 0 },
  { name: 'Whey protein concentrate', category: 'supplement', servingSize: 32, servingUnit: 'g', calories: 130, protein: 24, carbs: 4, fat: 1.8, sugar: 2, fiber: 0.5 },
  { name: 'Fish - rohu (cooked)', category: 'protein', servingSize: 100, servingUnit: 'g', calories: 97, protein: 16.6, carbs: 0, fat: 1.4, sugar: 0, fiber: 0 },
  { name: 'Salmon (cooked)', category: 'protein', servingSize: 100, servingUnit: 'g', calories: 208, protein: 20.4, carbs: 0, fat: 13.4, sugar: 0, fiber: 0 },
  { name: 'Mutton (cooked)', category: 'protein', servingSize: 100, servingUnit: 'g', calories: 258, protein: 25.6, carbs: 0, fat: 16.5, sugar: 0, fiber: 0 },
  { name: 'Greek yogurt (plain)', category: 'dairy', servingSize: 100, servingUnit: 'g', calories: 59, protein: 10, carbs: 3.6, fat: 0.4, sugar: 3.2, fiber: 0 },

  // --------------------------------------------------------------- legumes
  { name: 'Cooked dal (toor / arhar)', category: 'legumes', servingSize: 100, servingUnit: 'g', calories: 116, protein: 7.6, carbs: 19.6, fat: 0.4, sugar: 1.5, fiber: 4.5 },
  { name: 'Cooked rajma (kidney beans)', category: 'legumes', servingSize: 100, servingUnit: 'g', calories: 127, protein: 8.7, carbs: 22.8, fat: 0.5, sugar: 0.3, fiber: 6.4 },
  { name: 'Cooked chana / chickpeas', category: 'legumes', servingSize: 100, servingUnit: 'g', calories: 164, protein: 8.9, carbs: 27.4, fat: 2.6, sugar: 4.8, fiber: 7.6 },
  { name: 'Cooked moong dal', category: 'legumes', servingSize: 100, servingUnit: 'g', calories: 105, protein: 7, carbs: 19, fat: 0.4, sugar: 2, fiber: 7.6 },
  { name: 'Sprouted moong', category: 'legumes', servingSize: 100, servingUnit: 'g', calories: 30, protein: 3, carbs: 5.9, fat: 0.2, sugar: 4.1, fiber: 1.8 },

  // ----------------------------------------------------------------- dairy
  { name: 'Milk (toned, 3%)', category: 'dairy', servingSize: 250, servingUnit: 'ml', calories: 145, protein: 8, carbs: 12, fat: 7.5, sugar: 12, fiber: 0 },
  { name: 'Milk (skimmed)', category: 'dairy', servingSize: 250, servingUnit: 'ml', calories: 85, protein: 8.5, carbs: 12.5, fat: 0.3, sugar: 12.5, fiber: 0 },
  { name: 'Curd / dahi', category: 'dairy', servingSize: 100, servingUnit: 'g', calories: 61, protein: 3.5, carbs: 4.7, fat: 3.3, sugar: 4.7, fiber: 0 },
  { name: 'Butter', category: 'fats', servingSize: 10, servingUnit: 'g', calories: 72, protein: 0.1, carbs: 0.1, fat: 8.1, sugar: 0.1, fiber: 0 },
  { name: 'Ghee', category: 'fats', servingSize: 10, servingUnit: 'g', calories: 90, protein: 0, carbs: 0, fat: 10, sugar: 0, fiber: 0 },
  { name: 'Cheese slice', category: 'dairy', servingSize: 1, servingUnit: 'slice', calories: 68, protein: 3.9, carbs: 1.3, fat: 5.3, sugar: 0.9, fiber: 0 },

  // ------------------------------------------------------------------ fats
  { name: 'Almonds', category: 'nuts', servingSize: 100, servingUnit: 'g', calories: 579, protein: 21.2, carbs: 21.6, fat: 49.9, sugar: 4.4, fiber: 12.5 },
  { name: 'Walnuts', category: 'nuts', servingSize: 100, servingUnit: 'g', calories: 654, protein: 15.2, carbs: 13.7, fat: 65.2, sugar: 2.6, fiber: 6.7 },
  { name: 'Peanuts', category: 'nuts', servingSize: 100, servingUnit: 'g', calories: 567, protein: 25.8, carbs: 16.1, fat: 49.2, sugar: 4.7, fiber: 8.5 },
  { name: 'Peanut butter', category: 'nuts', servingSize: 32, servingUnit: 'g', calories: 190, protein: 8, carbs: 6, fat: 16, sugar: 3, fiber: 2 },
  { name: 'Cashews', category: 'nuts', servingSize: 100, servingUnit: 'g', calories: 553, protein: 18.2, carbs: 30.2, fat: 43.9, sugar: 5.9, fiber: 3.3 },
  { name: 'Olive oil', category: 'fats', servingSize: 10, servingUnit: 'ml', calories: 88, protein: 0, carbs: 0, fat: 10, sugar: 0, fiber: 0 },
  { name: 'Mustard / refined oil', category: 'fats', servingSize: 10, servingUnit: 'ml', calories: 88, protein: 0, carbs: 0, fat: 10, sugar: 0, fiber: 0 },

  // ----------------------------------------------------------------- fruit
  { name: 'Banana', category: 'fruit', servingSize: 1, servingUnit: 'piece', calories: 105, protein: 1.3, carbs: 27, fat: 0.4, sugar: 14.4, fiber: 3.1 },
  { name: 'Apple', category: 'fruit', servingSize: 1, servingUnit: 'piece', calories: 95, protein: 0.5, carbs: 25.1, fat: 0.3, sugar: 18.9, fiber: 4.4 },
  { name: 'Orange', category: 'fruit', servingSize: 1, servingUnit: 'piece', calories: 62, protein: 1.2, carbs: 15.4, fat: 0.2, sugar: 12.2, fiber: 3.1 },
  { name: 'Mango', category: 'fruit', servingSize: 100, servingUnit: 'g', calories: 60, protein: 0.8, carbs: 15, fat: 0.4, sugar: 13.7, fiber: 1.6 },
  { name: 'Papaya', category: 'fruit', servingSize: 100, servingUnit: 'g', calories: 43, protein: 0.5, carbs: 10.8, fat: 0.3, sugar: 7.8, fiber: 1.7 },
  { name: 'Grapes', category: 'fruit', servingSize: 100, servingUnit: 'g', calories: 69, protein: 0.7, carbs: 18.1, fat: 0.2, sugar: 15.5, fiber: 0.9 },
  { name: 'Dates', category: 'fruit', servingSize: 100, servingUnit: 'g', calories: 277, protein: 1.8, carbs: 75, fat: 0.2, sugar: 66.5, fiber: 6.7 },

  // ------------------------------------------------------------ vegetables
  { name: 'Mixed cooked vegetables', category: 'vegetables', servingSize: 100, servingUnit: 'g', calories: 65, protein: 2.4, carbs: 8.5, fat: 2.5, sugar: 3.2, fiber: 3.1 },
  { name: 'Potato (boiled)', category: 'vegetables', servingSize: 100, servingUnit: 'g', calories: 87, protein: 1.9, carbs: 20.1, fat: 0.1, sugar: 0.9, fiber: 1.8 },
  { name: 'Sweet potato (boiled)', category: 'vegetables', servingSize: 100, servingUnit: 'g', calories: 86, protein: 1.6, carbs: 20.1, fat: 0.1, sugar: 4.2, fiber: 3 },
  { name: 'Spinach (cooked)', category: 'vegetables', servingSize: 100, servingUnit: 'g', calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, sugar: 0.4, fiber: 2.2 },
  { name: 'Broccoli (cooked)', category: 'vegetables', servingSize: 100, servingUnit: 'g', calories: 35, protein: 2.4, carbs: 7.2, fat: 0.4, sugar: 1.4, fiber: 3.3 },
  { name: 'Salad (cucumber, tomato, onion)', category: 'vegetables', servingSize: 100, servingUnit: 'g', calories: 10, protein: 0.6, carbs: 3.5, fat: 0.1, sugar: 2.2, fiber: 1.1 },

  // --------------------------------------------------------- drinks & misc
  { name: 'Black coffee (no sugar)', category: 'drinks', servingSize: 250, servingUnit: 'ml', calories: 2, protein: 0.3, carbs: 0, fat: 0, sugar: 0, fiber: 0 },
  { name: 'Tea with milk and sugar', category: 'drinks', servingSize: 150, servingUnit: 'ml', calories: 90, protein: 2, carbs: 12, fat: 3.5, sugar: 11, fiber: 0 },
  { name: 'Green tea', category: 'drinks', servingSize: 250, servingUnit: 'ml', calories: 2, protein: 0, carbs: 0.5, fat: 0, sugar: 0, fiber: 0 },
  { name: 'Coconut water', category: 'drinks', servingSize: 250, servingUnit: 'ml', calories: 46, protein: 1.7, carbs: 8.9, fat: 0.5, sugar: 6.3, fiber: 2.7 },
  { name: 'Creatine monohydrate', category: 'supplement', servingSize: 5, servingUnit: 'g', calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 },
  { name: 'Sugar', category: 'other', servingSize: 5, servingUnit: 'g', calories: 20, protein: 0, carbs: 5, fat: 0, sugar: 5, fiber: 0 },
  { name: 'Honey', category: 'other', servingSize: 20, servingUnit: 'g', calories: 61, protein: 0.1, carbs: 16.5, fat: 0, sugar: 16.3, fiber: 0 },
];
