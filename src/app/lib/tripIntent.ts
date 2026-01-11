/**
 * Trip Intent & Recipe System
 * 
 * Pure, deterministic functions for deriving trip configuration from user intent.
 * This enables "smart curation" - showing only relevant fields and actions based on what the trip needs.
 */

export type TripStructureLevel = 'casual' | 'normal' | 'organised';

export type TripIntent = {
  structureLevel: TripStructureLevel;
  needsLogistics: boolean;  // meeting point, ferry, itinerary notes
  needsExport: boolean;     // roster export / agent pack later
  hasCapacityLimit: boolean;
  // reserved for future:
  needsScoring?: boolean;
  needsTeams?: boolean;
};

export type TripRecipe = {
  sections: {
    basics: true;
    signups: boolean;
    logistics: boolean;
    export: boolean;
    scoring: boolean;
  };
  defaults: {
    capacity?: number | null;          // null means no cap
    cutoffRule: 'none' | 'nightBefore' | 'daysBefore';
    cutoffDaysBefore?: number;         // used if cutoffRule=daysBefore
    ferryEnabled?: boolean;
  };
  enabledActions: {
    exportRoster: boolean;             // appears later on manage page when Locked
    exportAgentPack: boolean;          // future placeholder
  };
};

type GroupContext = {
  defaultCapacity?: number | null;
};

/**
 * Pure function to derive trip recipe from intent.
 * Deterministic rules - no hidden magic.
 * 
 * IMPORTANT: Defaults apply ONLY when field is missing from user input.
 * Never override explicit user input (name, date, etc.) with defaults or recipe logic.
 */
export function deriveTripRecipe(
  intent: TripIntent,
  groupContext?: GroupContext
): TripRecipe {
  const recipe: TripRecipe = {
    sections: {
      basics: true,
      signups: false,
      logistics: false,
      export: false,
      scoring: false,
    },
    defaults: {
      capacity: null,
      cutoffRule: 'none',
      cutoffDaysBefore: undefined,
      ferryEnabled: false,
    },
    enabledActions: {
      exportRoster: false,
      exportAgentPack: false,
    },
  };

  // Structure level determines cutoff rules and signups
  switch (intent.structureLevel) {
    case 'casual':
      recipe.sections.signups = true;
      recipe.defaults.cutoffRule = 'nightBefore';
      recipe.defaults.capacity = intent.hasCapacityLimit
        ? (groupContext?.defaultCapacity ?? 16)
        : null;
      break;

    case 'normal':
      recipe.sections.signups = true;
      recipe.defaults.cutoffRule = 'nightBefore';
      recipe.defaults.capacity = intent.hasCapacityLimit
        ? (groupContext?.defaultCapacity ?? 16)
        : null;
      break;

    case 'organised':
      recipe.sections.signups = true;
      recipe.defaults.cutoffRule = 'daysBefore';
      recipe.defaults.cutoffDaysBefore = 3;
      recipe.defaults.capacity = intent.hasCapacityLimit
        ? (groupContext?.defaultCapacity ?? 16)
        : null;
      break;
  }

  // Logistics section
  if (intent.needsLogistics) {
    recipe.sections.logistics = true;
    // ferryEnabled is set by user toggle in UI, not here
  }

  // Export section
  if (intent.needsExport) {
    recipe.sections.export = true;
    recipe.enabledActions.exportRoster = true;
  }

  // Scoring (future)
  if (intent.needsScoring) {
    recipe.sections.scoring = true;
  }

  return recipe;
}

/**
 * Helper to get a human-readable summary of what the trip will do based on recipe.
 */
export function getRecipeSummary(recipe: TripRecipe): string[] {
  const summary: string[] = [];

  if (recipe.sections.signups) {
    if (recipe.defaults.cutoffRule === 'nightBefore') {
      summary.push('Sign-ups close the night before');
    } else if (recipe.defaults.cutoffRule === 'daysBefore') {
      summary.push(`Sign-ups close ${recipe.defaults.cutoffDaysBefore} days before`);
    } else {
      summary.push('Sign-ups enabled');
    }
  }

  if (recipe.sections.logistics) {
    summary.push('Logistics section enabled');
  }

  if (recipe.enabledActions.exportRoster) {
    summary.push('Roster export will be available after sign-ups close');
  }

  if (recipe.defaults.capacity !== null) {
    summary.push(`Capacity limit: ${recipe.defaults.capacity}`);
  } else {
    summary.push('No capacity limit');
  }

  return summary;
}

/**
 * Derive recipe from existing trip data (heuristic fallback when intent not stored).
 * 
 * TODO: This is a TEMPORARY heuristic. The intent should be persisted to the database
 * (e.g., in a JSONB column like trips.intent or trips.settings.intent) so that:
 * - The recipe can be computed deterministically from stored intent
 * - The trip's configuration remains consistent across devices
 * - We can avoid heuristic drift and edge cases
 * 
 * Once intent is persisted, this function should only be used for legacy trips
 * that don't have intent stored.
 * 
 * This is used on the manage page to show what's enabled based on actual trip state.
 */
export function deriveRecipeFromTrip(trip: {
  cutoffAt?: string | null;
  capacity?: number | null;
  logistics?: {
    meetingPoint?: string;
    meetTime?: string;
    ferryDetails?: string;
    notes?: string;
  } | null;
}): TripRecipe {
  // Heuristic: if trip has logistics fields, assume logistics is enabled
  const hasLogistics = !!(
    trip.logistics?.meetingPoint ||
    trip.logistics?.meetTime ||
    trip.logistics?.ferryDetails ||
    trip.logistics?.notes
  );

  // Heuristic: if trip has cutoff, determine rule
  let cutoffRule: 'none' | 'nightBefore' | 'daysBefore' = 'none';
  let cutoffDaysBefore: number | undefined = undefined;

  if (trip.cutoffAt) {
    const cutoff = new Date(trip.cutoffAt);
    const tripDate = new Date(); // Would need trip.date, but this is a fallback
    const daysDiff = Math.ceil((tripDate.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 1) {
      cutoffRule = 'nightBefore';
    } else if (daysDiff > 1 && daysDiff <= 7) {
      cutoffRule = 'daysBefore';
      cutoffDaysBefore = daysDiff;
    } else {
      cutoffRule = 'none';
    }
  }

  return {
    sections: {
      basics: true,
      signups: !!trip.cutoffAt,
      logistics: hasLogistics,
      export: false, // Cannot determine from trip data alone
      scoring: false,
    },
    defaults: {
      capacity: trip.capacity ?? null,
      cutoffRule,
      cutoffDaysBefore,
      ferryEnabled: hasLogistics,
    },
    enabledActions: {
      exportRoster: false, // Cannot determine from trip data alone
      exportAgentPack: false,
    },
  };
}
