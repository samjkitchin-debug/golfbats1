/**
 * Unit tests for tripIntent.ts
 * 
 * These tests verify the deterministic behavior of deriveTripRecipe().
 * 
 * To run: Add a test runner (Jest/Vitest) to package.json, or run manually by
 * importing and calling test functions.
 */

import { deriveTripRecipe, type TripIntent } from '../tripIntent';

describe('deriveTripRecipe', () => {
  test('casual structure: nightBefore cutoff, capacity if hasCapacityLimit', () => {
    const intent: TripIntent = {
      structureLevel: 'casual',
      needsLogistics: false,
      needsExport: false,
      hasCapacityLimit: true,
    };

    const recipe = deriveTripRecipe(intent, { defaultCapacity: 20 });

    expect(recipe.sections.signups).toBe(true);
    expect(recipe.defaults.cutoffRule).toBe('nightBefore');
    expect(recipe.defaults.capacity).toBe(20);
  });

  test('casual structure: no capacity limit', () => {
    const intent: TripIntent = {
      structureLevel: 'casual',
      needsLogistics: false,
      needsExport: false,
      hasCapacityLimit: false,
    };

    const recipe = deriveTripRecipe(intent);

    expect(recipe.sections.signups).toBe(true);
    expect(recipe.defaults.cutoffRule).toBe('nightBefore');
    expect(recipe.defaults.capacity).toBeNull();
  });

  test('normal structure: nightBefore cutoff', () => {
    const intent: TripIntent = {
      structureLevel: 'normal',
      needsLogistics: false,
      needsExport: false,
      hasCapacityLimit: true,
    };

    const recipe = deriveTripRecipe(intent, { defaultCapacity: 16 });

    expect(recipe.sections.signups).toBe(true);
    expect(recipe.defaults.cutoffRule).toBe('nightBefore');
    expect(recipe.defaults.capacity).toBe(16);
  });

  test('organised structure: daysBefore cutoff with default 3 days', () => {
    const intent: TripIntent = {
      structureLevel: 'organised',
      needsLogistics: false,
      needsExport: false,
      hasCapacityLimit: true,
    };

    const recipe = deriveTripRecipe(intent, { defaultCapacity: 16 });

    expect(recipe.sections.signups).toBe(true);
    expect(recipe.defaults.cutoffRule).toBe('daysBefore');
    expect(recipe.defaults.cutoffDaysBefore).toBe(3);
    expect(recipe.defaults.capacity).toBe(16);
  });

  test('needsLogistics: enables logistics section', () => {
    const intent: TripIntent = {
      structureLevel: 'normal',
      needsLogistics: true,
      needsExport: false,
      hasCapacityLimit: false,
    };

    const recipe = deriveTripRecipe(intent);

    expect(recipe.sections.logistics).toBe(true);
  });

  test('needsExport: enables export section and exportRoster action', () => {
    const intent: TripIntent = {
      structureLevel: 'normal',
      needsLogistics: false,
      needsExport: true,
      hasCapacityLimit: false,
    };

    const recipe = deriveTripRecipe(intent);

    expect(recipe.sections.export).toBe(true);
    expect(recipe.enabledActions.exportRoster).toBe(true);
  });

  test('combined flags: all features enabled', () => {
    const intent: TripIntent = {
      structureLevel: 'organised',
      needsLogistics: true,
      needsExport: true,
      hasCapacityLimit: true,
    };

    const recipe = deriveTripRecipe(intent, { defaultCapacity: 24 });

    expect(recipe.sections.signups).toBe(true);
    expect(recipe.sections.logistics).toBe(true);
    expect(recipe.sections.export).toBe(true);
    expect(recipe.defaults.cutoffRule).toBe('daysBefore');
    expect(recipe.defaults.cutoffDaysBefore).toBe(3);
    expect(recipe.defaults.capacity).toBe(24);
    expect(recipe.enabledActions.exportRoster).toBe(true);
  });
});

// Manual test runner (if no test framework available)
if (typeof describe === 'undefined') {
  console.log('Test framework not available. Install Jest or Vitest to run tests.');
  console.log('Tests are defined but require a test runner to execute.');
}
