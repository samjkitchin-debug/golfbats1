/**
 * Unit tests for tripDates.ts
 * 
 * These tests verify the timezone-correct behavior of cutoff date computation
 * and trip phase determination.
 * 
 * To run: Add a test runner (Jest/Vitest) to package.json, or run manually by
 * importing and calling test functions.
 */

import { computeDefaultCutoffAt } from '../tripDates';
import { deriveTripRecipe } from '../tripIntent';
import type { TripRecipe } from '../tripIntent';

describe('computeDefaultCutoffAt', () => {
  test('nightBefore: computes 23:59 SGT the day before trip date', () => {
    const tripDate = '2025-01-16'; // 16 Jan 2025
    const recipe: TripRecipe['defaults'] = {
      cutoffRule: 'nightBefore',
      capacity: null,
    };

    const cutoff = computeDefaultCutoffAt(tripDate, recipe);
    
    expect(cutoff).not.toBeNull();
    if (cutoff) {
      // Should be 15 Jan 2025 15:59 UTC (which is 23:59 SGT on 15 Jan)
      const cutoffDate = new Date(cutoff);
      expect(cutoffDate.getUTCFullYear()).toBe(2025);
      expect(cutoffDate.getUTCMonth()).toBe(0); // January (0-indexed)
      expect(cutoffDate.getUTCDate()).toBe(15);
      expect(cutoffDate.getUTCHours()).toBe(15);
      expect(cutoffDate.getUTCMinutes()).toBe(59);
    }
  });

  test('daysBefore: computes 23:59 SGT N days before trip date', () => {
    const tripDate = '2025-01-16'; // 16 Jan 2025
    const recipe: TripRecipe['defaults'] = {
      cutoffRule: 'daysBefore',
      cutoffDaysBefore: 3,
      capacity: null,
    };

    const cutoff = computeDefaultCutoffAt(tripDate, recipe);
    
    expect(cutoff).not.toBeNull();
    if (cutoff) {
      // Should be 13 Jan 2025 15:59 UTC (which is 23:59 SGT on 13 Jan)
      const cutoffDate = new Date(cutoff);
      expect(cutoffDate.getUTCFullYear()).toBe(2025);
      expect(cutoffDate.getUTCMonth()).toBe(0); // January (0-indexed)
      expect(cutoffDate.getUTCDate()).toBe(13);
      expect(cutoffDate.getUTCHours()).toBe(15);
      expect(cutoffDate.getUTCMinutes()).toBe(59);
    }
  });

  test('none: returns null', () => {
    const tripDate = '2025-01-16';
    const recipe: TripRecipe['defaults'] = {
      cutoffRule: 'none',
      capacity: null,
    };

    const cutoff = computeDefaultCutoffAt(tripDate, recipe);
    expect(cutoff).toBeNull();
  });

  test('edge case: trip date near month boundary', () => {
    const tripDate = '2025-02-01'; // 1 Feb 2025
    const recipe: TripRecipe['defaults'] = {
      cutoffRule: 'nightBefore',
      capacity: null,
    };

    const cutoff = computeDefaultCutoffAt(tripDate, recipe);
    
    expect(cutoff).not.toBeNull();
    if (cutoff) {
      // Should be 31 Jan 2025 15:59 UTC (which is 23:59 SGT on 31 Jan)
      const cutoffDate = new Date(cutoff);
      expect(cutoffDate.getUTCFullYear()).toBe(2025);
      expect(cutoffDate.getUTCMonth()).toBe(0); // January (0-indexed)
      expect(cutoffDate.getUTCDate()).toBe(31);
      expect(cutoffDate.getUTCHours()).toBe(15);
      expect(cutoffDate.getUTCMinutes()).toBe(59);
    }
  });

  test('edge case: trip date at year boundary', () => {
    const tripDate = '2025-01-01'; // 1 Jan 2025
    const recipe: TripRecipe['defaults'] = {
      cutoffRule: 'nightBefore',
      capacity: null,
    };

    const cutoff = computeDefaultCutoffAt(tripDate, recipe);
    
    expect(cutoff).not.toBeNull();
    if (cutoff) {
      // Should be 31 Dec 2024 15:59 UTC (which is 23:59 SGT on 31 Dec)
      const cutoffDate = new Date(cutoff);
      expect(cutoffDate.getUTCFullYear()).toBe(2024);
      expect(cutoffDate.getUTCMonth()).toBe(11); // December (0-indexed)
      expect(cutoffDate.getUTCDate()).toBe(31);
      expect(cutoffDate.getUTCHours()).toBe(15);
      expect(cutoffDate.getUTCMinutes()).toBe(59);
    }
  });
});

describe('deriveTripRecipe', () => {
  test('casual structure: nightBefore cutoff, capacity if hasCapacityLimit', () => {
    const intent = {
      structureLevel: 'casual' as const,
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
    const intent = {
      structureLevel: 'casual' as const,
      needsLogistics: false,
      needsExport: false,
      hasCapacityLimit: false,
    };

    const recipe = deriveTripRecipe(intent);

    expect(recipe.sections.signups).toBe(true);
    expect(recipe.defaults.cutoffRule).toBe('nightBefore');
    expect(recipe.defaults.capacity).toBeNull();
  });

  test('organised structure: daysBefore cutoff with default 3 days', () => {
    const intent = {
      structureLevel: 'organised' as const,
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
    const intent = {
      structureLevel: 'normal' as const,
      needsLogistics: true,
      needsExport: false,
      hasCapacityLimit: false,
    };

    const recipe = deriveTripRecipe(intent);

    expect(recipe.sections.logistics).toBe(true);
  });

  test('needsExport: enables export section and exportRoster action', () => {
    const intent = {
      structureLevel: 'normal' as const,
      needsLogistics: false,
      needsExport: true,
      hasCapacityLimit: false,
    };

    const recipe = deriveTripRecipe(intent);

    expect(recipe.sections.export).toBe(true);
    expect(recipe.enabledActions.exportRoster).toBe(true);
  });
});

// Manual test runner (if no test framework available)
if (typeof describe === 'undefined') {
  console.log('Test framework not available. Install Jest or Vitest to run tests.');
  console.log('Tests are defined but require a test runner to execute.');
}
