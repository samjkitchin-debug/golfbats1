/**
 * Scenario Registry
 * 
 * Single source of truth for all trip scenarios.
 * 
 * Scenario truth lives in src/app/lib/scenarios/registry.ts and docs/trips/scenarios.md
 * 
 * ITERATIVE IMPROVEMENT RULE: This registry is IMMUTABLE at runtime.
 * All changes must be deliberate, evidence-driven, and reviewable.
 * See docs/trips/iteration-playbook.md "Iterative Improvement Rule — No Silent Drift"
 * 
 * Adding a new scenario requires:
 * 1. Adding a key to ScenarioKey union
 * 2. Adding one ScenarioDefinition object to SCENARIOS
 * 3. Updating classifier in src/app/lib/scenarios/classifier.ts
 * 4. Updating docs/trips/scenarios.md
 * 
 * All UI, readiness, and recipe derivation automatically adapt.
 */

import { type TripRecipe } from "../tripIntent";
import type { ScenarioAnswers } from "./classifier";

/**
 * Scenario key union type
 */
export type ScenarioKey =
  | "local_round"
  | "carpool_round"
  | "away_day"
  | "overnight_trip"
  | "organiser_booking"
  | "cross_border_agent"
  | "casual_round"; // future

/**
 * Trip setup step types
 */
export type TripSetupStep =
  | "basics"
  | "course"
  | "signups"
  | "capacity"
  | "logistics"
  | "profile"
  | "export"
  | "itinerary"
  | "flights";

/**
 * Scenario definition - complete configuration for a scenario
 */
export type ScenarioDefinition = {
  /** Unique scenario key */
  key: ScenarioKey;
  /** Human-readable label for UI */
  label: string;
  /** Short label for compact UI */
  shortLabel: string;
  /** Short description for UI tooltips/help */
  description: string;
  /** Minimal prompts for scenario classification */
  prompts: {
    questions: Array<{
      id: keyof ScenarioAnswers | "overnight" | "carpool";
      text: string;
      options: Array<{ value: any; label: string }>;
      when?: (answers: Partial<ScenarioAnswers>) => boolean;
    }>;
  };
  /** Default values for trip configuration */
  defaults: {
    cutoffRule?: "nightBefore" | "daysBefore";
    cutoffDays?: number;
    capacity?: number | null;
  };
  /** Enabled modules (features) */
  modules: {
    signups: boolean;
    capacity: boolean;
    logistics: boolean;
    export: boolean;
    profile: boolean; // Profile data collection (e.g., passport for cross_border_agent)
    itinerary: boolean; // Agent itinerary (cross_border_agent only)
    flights: boolean;
  };
  /** Coordination sequence (ideal step order) */
  steps: TripSetupStep[];
  /** Minimal steps required to create trip */
  requiredForCreate: TripSetupStep[];
  /** Required attendee completeness for agent export (cross_border_agent only) */
  requiredForAgentExport?: {
    passportFields: string[]; // Locked list
    requireHandicap: boolean;
  };
  /** Required fields per step for readiness */
  requiredForReadiness: Partial<Record<TripSetupStep, string[]>>;
  /** Special rules */
  rules: {
    flightsOnlyAfterSignupsClosed?: boolean;
    descriptionNotes?: string[];
  };
  /** Legacy recipe (for backward compatibility) */
  recipe: TripRecipe;
};

/**
 * Scenario registry - all scenarios defined in one place
 */
export const SCENARIOS: Record<ScenarioKey, ScenarioDefinition> = {
  local_round: {
    key: "local_round",
    label: "Local round",
    shortLabel: "Local",
    description: "Everyone meets at the course",
    prompts: {
      questions: [
        {
          id: "organiserBooking",
          text: "Who's handling bookings?",
          options: [
            { value: false, label: "Everyone sorts themselves" },
            { value: true, label: "I'm booking / need a roster" },
          ],
        },
        {
          id: "travelCoordination",
          text: "How are people getting there?",
          options: [
            { value: false, label: "Meet at course" },
            { value: true, label: "We're travelling together" },
          ],
        },
        {
          id: "crossBorderAgent",
          text: "Does this require passports or a travel agent?",
          options: [
            { value: false, label: "No" },
            { value: true, label: "Yes (passport / ferry / agent)" },
          ],
        },
      ],
    },
    defaults: {
      cutoffRule: "nightBefore",
      cutoffDays: 1,
      capacity: null,
    },
    modules: {
      signups: true,
      capacity: false,
      logistics: false,
      export: false,
      profile: false,
      itinerary: false,
      flights: false,
    },
    steps: ["basics", "course", "signups"],
    requiredForCreate: ["basics", "course"],
    requiredForReadiness: {
      basics: ["trip_date", "name"],
      course: ["course_id"],
      signups: ["cutoff_at"],
    },
    rules: {},
    recipe: {
      sections: {
        basics: true,
        signups: true,
        capacity: false,
        logistics: false,
        export: false,
        scoring: false,
        flights: false,
      },
      defaults: {
        capacity: null,
        cutoffRule: "nightBefore",
        cutoffDaysBefore: 1,
        ferryEnabled: false,
      },
      enabledActions: {
        exportRoster: false,
        exportAgentPack: false,
      },
    },
  },

  carpool_round: {
    key: "carpool_round",
    label: "Carpool round",
    shortLabel: "Carpool",
    description: "We're carpooling together (pickup point matters)",
    prompts: {
      questions: [
        {
          id: "organiserBooking",
          text: "Who's handling bookings?",
          options: [
            { value: false, label: "Everyone sorts themselves" },
            { value: true, label: "I'm booking / need a roster" },
          ],
        },
        {
          id: "travelCoordination",
          text: "How are people getting there?",
          options: [
            { value: false, label: "Meet at course" },
            { value: true, label: "We're travelling together" },
          ],
        },
        {
          id: "crossBorderAgent",
          text: "Does this require passports or a travel agent?",
          options: [
            { value: false, label: "No" },
            { value: true, label: "Yes (passport / ferry / agent)" },
          ],
        },
        {
          id: "carpool",
          text: "Are you carpooling?",
          options: [
            { value: true, label: "Yes, we're carpooling (pickup point matters)" },
            { value: false, label: "No" },
          ],
          when: (answers) => answers.travelCoordination === true && answers.crossBorderAgent !== true,
        },
      ],
    },
    defaults: {
      cutoffRule: "nightBefore",
      cutoffDays: 1,
      capacity: 16,
    },
    modules: {
      signups: true,
      capacity: true,
      logistics: true,
      export: false,
      profile: false,
      itinerary: false,
      flights: false,
    },
    steps: ["basics", "course", "signups", "capacity", "logistics"],
    requiredForCreate: ["basics", "course"],
    requiredForReadiness: {
      basics: ["trip_date", "name"],
      course: ["course_id"],
      signups: ["cutoff_at"],
      capacity: ["capacity"],
      logistics: ["meeting_point", "meet_time"],
    },
    rules: {},
    recipe: {
      sections: {
        basics: true,
        signups: true,
        capacity: true,
        logistics: true,
        export: false,
        scoring: false,
        flights: false,
      },
      defaults: {
        capacity: 16,
        cutoffRule: "nightBefore",
        cutoffDaysBefore: 1,
        ferryEnabled: false,
      },
      enabledActions: {
        exportRoster: false,
        exportAgentPack: false,
      },
    },
  },

  away_day: {
    key: "away_day",
    label: "Away day",
    shortLabel: "Away",
    description: "We're travelling together",
    prompts: {
      questions: [
        {
          id: "organiserBooking",
          text: "Who's handling bookings?",
          options: [
            { value: false, label: "Everyone sorts themselves" },
            { value: true, label: "I'm booking / need a roster" },
          ],
        },
        {
          id: "travelCoordination",
          text: "How are people getting there?",
          options: [
            { value: false, label: "Meet at course" },
            { value: true, label: "We're travelling together" },
          ],
        },
        {
          id: "crossBorderAgent",
          text: "Does this require passports or a travel agent?",
          options: [
            { value: false, label: "No" },
            { value: true, label: "Yes (passport / ferry / agent)" },
          ],
        },
      ],
    },
    defaults: {
      cutoffRule: "nightBefore",
      cutoffDays: 1,
      capacity: 16,
    },
    modules: {
      signups: true,
      capacity: true,
      logistics: true,
      export: false,
      profile: false,
      itinerary: false,
      flights: false,
    },
    steps: ["basics", "course", "signups", "capacity", "logistics"],
    requiredForCreate: ["basics", "course"],
    requiredForReadiness: {
      basics: ["trip_date", "name"],
      course: ["course_id"],
      signups: ["cutoff_at"],
      capacity: ["capacity"],
      logistics: ["meeting_point", "meet_time"],
    },
    rules: {},
    recipe: {
      sections: {
        basics: true,
        signups: true,
        capacity: true,
        logistics: true,
        export: false,
        scoring: false,
        flights: false,
      },
      defaults: {
        capacity: 16,
        cutoffRule: "nightBefore",
        cutoffDaysBefore: 1,
        ferryEnabled: false,
      },
      enabledActions: {
        exportRoster: false,
        exportAgentPack: false,
      },
    },
  },

  overnight_trip: {
    key: "overnight_trip",
    label: "Overnight trip",
    shortLabel: "Overnight",
    description: "Multi-day trip with accommodation",
    prompts: {
      questions: [
        {
          id: "organiserBooking",
          text: "Who's handling bookings?",
          options: [
            { value: false, label: "Everyone sorts themselves" },
            { value: true, label: "I'm booking / need a roster" },
          ],
        },
        {
          id: "travelCoordination",
          text: "How are people getting there?",
          options: [
            { value: false, label: "Meet at course" },
            { value: true, label: "We're travelling together" },
          ],
        },
        {
          id: "crossBorderAgent",
          text: "Does this require passports or a travel agent?",
          options: [
            { value: false, label: "No" },
            { value: true, label: "Yes (passport / ferry / agent)" },
          ],
        },
        {
          id: "overnight",
          text: "Is this an overnight trip?",
          options: [
            { value: true, label: "Yes, overnight" },
            { value: false, label: "No, day trip" },
          ],
          when: (answers) => answers.travelCoordination === true && answers.crossBorderAgent !== true,
        },
      ],
    },
    defaults: {
      cutoffRule: "nightBefore",
      cutoffDays: 1,
      capacity: 16,
    },
    modules: {
      signups: true,
      capacity: true,
      logistics: true,
      export: false,
      profile: false,
      itinerary: false,
      flights: false,
    },
    steps: ["basics", "course", "signups", "capacity", "logistics"],
    requiredForCreate: ["basics", "course"],
    requiredForReadiness: {
      basics: ["trip_date", "name"],
      course: ["course_id"],
      signups: ["cutoff_at"],
      capacity: ["capacity"],
      logistics: ["meeting_point", "meet_time"],
    },
    rules: {},
    recipe: {
      sections: {
        basics: true,
        signups: true,
        capacity: true,
        logistics: true,
        export: false,
        scoring: false,
        flights: false,
      },
      defaults: {
        capacity: 16,
        cutoffRule: "nightBefore",
        cutoffDaysBefore: 1,
        ferryEnabled: false,
      },
      enabledActions: {
        exportRoster: false,
        exportAgentPack: false,
      },
    },
  },

  organiser_booking: {
    key: "organiser_booking",
    label: "Organiser booking",
    shortLabel: "Booking",
    description: "I'm booking / need a roster",
    prompts: {
      questions: [
        {
          id: "organiserBooking",
          text: "Who's handling bookings?",
          options: [
            { value: false, label: "Everyone sorts themselves" },
            { value: true, label: "I'm booking / need a roster" },
          ],
        },
      ],
    },
    defaults: {
      cutoffRule: "nightBefore",
      cutoffDays: 1,
      capacity: 16,
    },
    modules: {
      signups: true,
      capacity: true,
      logistics: false,
      export: true,
      profile: false,
      itinerary: false,
      flights: false,
    },
    steps: ["basics", "course", "signups", "capacity", "export"],
    requiredForCreate: ["basics", "course"],
    requiredForReadiness: {
      basics: ["trip_date", "name"],
      course: ["course_id"],
      signups: ["cutoff_at"],
      capacity: ["capacity"],
    },
    rules: {},
    recipe: {
      sections: {
        basics: true,
        signups: true,
        capacity: true,
        logistics: false,
        export: true,
        scoring: false,
        flights: false,
      },
      defaults: {
        capacity: 16,
        cutoffRule: "nightBefore",
        cutoffDaysBefore: 1,
        ferryEnabled: false,
      },
      enabledActions: {
        exportRoster: true,
        exportAgentPack: false,
      },
    },
  },

  cross_border_agent: {
    key: "cross_border_agent",
    label: "Cross-border agent",
    shortLabel: "Batam",
    description: "Passport / ferry / agent required (e.g., Batam)",
    prompts: {
      questions: [
        {
          id: "organiserBooking",
          text: "Who's handling bookings?",
          options: [
            { value: false, label: "Everyone sorts themselves" },
            { value: true, label: "I'm booking / need a roster" },
          ],
        },
        {
          id: "travelCoordination",
          text: "How are people getting there?",
          options: [
            { value: false, label: "Meet at course" },
            { value: true, label: "We're travelling together" },
          ],
        },
        {
          id: "crossBorderAgent",
          text: "Does this require passports or a travel agent?",
          options: [
            { value: false, label: "No" },
            { value: true, label: "Yes (passport / ferry / agent)" },
          ],
        },
      ],
    },
    defaults: {
      cutoffRule: "daysBefore",
      cutoffDays: 3,
      capacity: 16,
    },
    modules: {
      signups: true,
      capacity: true,
      logistics: true,
      export: true,
      profile: true, // Passport data collection
      itinerary: true, // Agent itinerary
      flights: true,
    },
    steps: ["basics", "course", "signups", "capacity", "logistics", "export", "flights"],
    requiredForCreate: ["basics", "course"], // LOCKED: trip_date + course_id
    requiredForAgentExport: {
      passportFields: [
        "passport_full_name",
        "passport_number",
        "passport_nationality",
        "passport_date_of_birth",
        "passport_expiry_date",
      ],
      requireHandicap: true,
    },
    requiredForReadiness: {
      basics: ["trip_date", "course_id"], // LOCKED
      course: ["course_id"],
      signups: ["cutoff_at"],
      capacity: ["capacity"],
      logistics: ["meeting_point", "meet_time", "ferry_details"], // LOCKED: agent itinerary
      profile: ["passport_full_name", "passport_number", "passport_nationality", "passport_date_of_birth", "passport_expiry_date", "handicap"], // For all confirmed attendees
      itinerary: ["meeting_point", "meet_time", "ferry_details"], // LOCKED
    },
    rules: {
      flightsOnlyAfterSignupsClosed: true, // LOCKED
      descriptionNotes: [
        "Flights can only be generated after signups close",
        "Quartile method is default",
        "Manual edits persist; regenerate only by explicit action",
      ],
    },
    recipe: {
      sections: {
        basics: true,
        signups: true,
        capacity: true,
        logistics: true,
        export: true,
        scoring: false,
        flights: true,
      },
      defaults: {
        capacity: 16,
        cutoffRule: "daysBefore",
        cutoffDaysBefore: 3,
        ferryEnabled: true,
      },
      enabledActions: {
        exportRoster: true,
        exportAgentPack: true,
      },
    },
  },

  casual_round: {
    key: "casual_round",
    label: "Casual round",
    shortLabel: "Casual",
    description: "Minimal structure, no course required",
    prompts: {
      questions: [
        {
          id: "organiserBooking",
          text: "Who's handling bookings?",
          options: [
            { value: false, label: "Everyone sorts themselves" },
            { value: true, label: "I'm booking / need a roster" },
          ],
        },
        {
          id: "travelCoordination",
          text: "How are people getting there?",
          options: [
            { value: false, label: "Meet at course" },
            { value: true, label: "We're travelling together" },
          ],
        },
        {
          id: "crossBorderAgent",
          text: "Does this require passports or a travel agent?",
          options: [
            { value: false, label: "No" },
            { value: true, label: "Yes (passport / ferry / agent)" },
          ],
        },
      ],
    },
    defaults: {
      cutoffRule: "nightBefore",
      cutoffDays: 1,
      capacity: null,
    },
    modules: {
      signups: true,
      capacity: false,
      logistics: false,
      export: false,
      profile: false,
      itinerary: false,
      flights: false,
    },
    steps: ["basics", "signups"],
    requiredForCreate: ["basics"],
    requiredForReadiness: {
      basics: ["trip_date", "name"],
      signups: ["cutoff_at"],
    },
    rules: {},
    recipe: {
      sections: {
        basics: true,
        signups: true,
        capacity: false,
        logistics: false,
        export: false,
        scoring: false,
        flights: false,
      },
      defaults: {
        capacity: null,
        cutoffRule: "nightBefore",
        cutoffDaysBefore: 1,
        ferryEnabled: false,
      },
      enabledActions: {
        exportRoster: false,
        exportAgentPack: false,
      },
    },
  },
};

/**
 * Get scenario definition by key
 */
export function getScenario(key: ScenarioKey): ScenarioDefinition {
  return SCENARIOS[key];
}

/**
 * Get all scenario keys
 */
export function getAllScenarioKeys(): ScenarioKey[] {
  return Object.keys(SCENARIOS) as ScenarioKey[];
}
