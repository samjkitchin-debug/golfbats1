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
 * Logistics subtype enum - determines which logistics editor to render
 */
export type LogisticsSubtype =
  | "meet_at_course"
  | "pickup_carpool"
  | "agent_ferry_itinerary";

/**
 * Helper functions for question conditions
 */
const whenTravelCoordinationAndNotAgentBooking = (answers: Partial<ScenarioAnswers>): boolean => {
  return answers.travelCoordination === true && answers.bookingResponsibility !== "agent";
};

const whenOrganiserOrAgentBooking = (answers: Partial<ScenarioAnswers>): boolean => {
  return answers.bookingResponsibility === "organiser" || answers.bookingResponsibility === "agent";
};

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
      id: keyof ScenarioAnswers | "overnight" | "carpool" | "requiredMemberInfo";
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
  /** Logistics subtype - determines which logistics editor to render (only set if modules.logistics === true) */
  logisticsSubtype?: LogisticsSubtype;
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
          id: "bookingResponsibility",
          text: "Who is arranging the bookings for this trip?",
          options: [
            { value: "everyone", label: "Everyone arranges their own" },
            { value: "organiser", label: "I'm arranging it for the group" },
            { value: "agent", label: "An external organiser/agent is arranging it" },
          ],
        },
        {
          id: "requiredMemberInfo",
          text: "What information do you need from people to make the booking?",
          options: [
            { value: [], label: "No special information needed" },
            { value: ["handicap"], label: "Handicap only" },
            { value: ["passport_full_name", "passport_number", "passport_nationality", "passport_date_of_birth", "passport_expiry_date", "handicap"], label: "Passport details and handicap" },
          ],
          when: whenOrganiserOrAgentBooking,
        },
        {
          id: "travelCoordination",
          text: "How are people getting there?",
          options: [
            { value: false, label: "Meet at course" },
            { value: true, label: "We're travelling together" },
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
    logisticsSubtype: undefined, // logistics disabled
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
          id: "bookingResponsibility",
          text: "Who is arranging the bookings for this trip?",
          options: [
            { value: "everyone", label: "Everyone arranges their own" },
            { value: "organiser", label: "I'm arranging it for the group" },
            { value: "agent", label: "An external organiser/agent is arranging it" },
          ],
        },
        {
          id: "requiredMemberInfo",
          text: "What information do you need from people to make the booking?",
          options: [
            { value: [], label: "No special information needed" },
            { value: ["handicap"], label: "Handicap only" },
            { value: ["passport_full_name", "passport_number", "passport_nationality", "passport_date_of_birth", "passport_expiry_date", "handicap"], label: "Passport details and handicap" },
          ],
          when: whenOrganiserOrAgentBooking,
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
          id: "carpool",
          text: "Are you carpooling?",
          options: [
            { value: true, label: "Yes, we're carpooling (pickup point matters)" },
            { value: false, label: "No" },
          ],
          when: whenTravelCoordinationAndNotAgentBooking,
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
          id: "bookingResponsibility",
          text: "Who is arranging the bookings for this trip?",
          options: [
            { value: "everyone", label: "Everyone arranges their own" },
            { value: "organiser", label: "I'm arranging it for the group" },
            { value: "agent", label: "An external organiser/agent is arranging it" },
          ],
        },
        {
          id: "requiredMemberInfo",
          text: "What information do you need from people to make the booking?",
          options: [
            { value: [], label: "No special information needed" },
            { value: ["handicap"], label: "Handicap only" },
            { value: ["passport_full_name", "passport_number", "passport_nationality", "passport_date_of_birth", "passport_expiry_date", "handicap"], label: "Passport details and handicap" },
          ],
          when: whenOrganiserOrAgentBooking,
        },
        {
          id: "travelCoordination",
          text: "How are people getting there?",
          options: [
            { value: false, label: "Meet at course" },
            { value: true, label: "We're travelling together" },
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
    logisticsSubtype: "pickup_carpool",
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
          id: "bookingResponsibility",
          text: "Who is arranging the bookings for this trip?",
          options: [
            { value: "everyone", label: "Everyone arranges their own" },
            { value: "organiser", label: "I'm arranging it for the group" },
            { value: "agent", label: "An external organiser/agent is arranging it" },
          ],
        },
        {
          id: "requiredMemberInfo",
          text: "What information do you need from people to make the booking?",
          options: [
            { value: [], label: "No special information needed" },
            { value: ["handicap"], label: "Handicap only" },
            { value: ["passport_full_name", "passport_number", "passport_nationality", "passport_date_of_birth", "passport_expiry_date", "handicap"], label: "Passport details and handicap" },
          ],
          when: whenOrganiserOrAgentBooking,
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
          id: "overnight",
          text: "Is this an overnight trip?",
          options: [
            { value: true, label: "Yes, overnight" },
            { value: false, label: "No, day trip" },
          ],
          when: whenTravelCoordinationAndNotAgentBooking,
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
    logisticsSubtype: "pickup_carpool",
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
    description: "Organiser or agent is arranging bookings",
    prompts: {
      questions: [
        {
          id: "bookingResponsibility",
          text: "Who is arranging the bookings for this trip?",
          options: [
            { value: "everyone", label: "Everyone arranges their own" },
            { value: "organiser", label: "I'm arranging it for the group" },
            { value: "agent", label: "An external organiser/agent is arranging it" },
          ],
        },
        {
          id: "requiredMemberInfo",
          text: "What information do you need from people to make the booking?",
          options: [
            { value: [], label: "No special information needed" },
            { value: ["handicap"], label: "Handicap only" },
            { value: ["passport_full_name", "passport_number", "passport_nationality", "passport_date_of_birth", "passport_expiry_date", "handicap"], label: "Passport details and handicap" },
          ],
          when: whenOrganiserOrAgentBooking,
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
    logisticsSubtype: undefined, // logistics disabled
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
    shortLabel: "Agent",
    description: "External agent arranging bookings requiring passport information",
    prompts: {
      questions: [
        {
          id: "bookingResponsibility",
          text: "Who is arranging the bookings for this trip?",
          options: [
            { value: "everyone", label: "Everyone arranges their own" },
            { value: "organiser", label: "I'm arranging it for the group" },
            { value: "agent", label: "An external organiser/agent is arranging it" },
          ],
        },
        {
          id: "requiredMemberInfo",
          text: "What information do you need from people to make the booking?",
          options: [
            { value: [], label: "No special information needed" },
            { value: ["handicap"], label: "Handicap only" },
            { value: ["passport_full_name", "passport_number", "passport_nationality", "passport_date_of_birth", "passport_expiry_date", "handicap"], label: "Passport details and handicap" },
          ],
          when: whenOrganiserOrAgentBooking,
        },
        {
          id: "travelCoordination",
          text: "How are people getting there?",
          options: [
            { value: false, label: "Meet at course" },
            { value: true, label: "We're travelling together" },
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
    logisticsSubtype: "agent_ferry_itinerary",
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
      logistics: ["meeting_point", "meet_time"], // Itinerary details derived from transportMode
      profile: ["passport_full_name", "passport_number", "passport_nationality", "passport_date_of_birth", "passport_expiry_date", "handicap"], // For all confirmed attendees
      itinerary: ["meeting_point", "meet_time"], // Itinerary details derived from transportMode
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
          id: "bookingResponsibility",
          text: "Who is arranging the bookings for this trip?",
          options: [
            { value: "everyone", label: "Everyone arranges their own" },
            { value: "organiser", label: "I'm arranging it for the group" },
            { value: "agent", label: "An external organiser/agent is arranging it" },
          ],
        },
        {
          id: "requiredMemberInfo",
          text: "What information do you need from people to make the booking?",
          options: [
            { value: [], label: "No special information needed" },
            { value: ["handicap"], label: "Handicap only" },
            { value: ["passport_full_name", "passport_number", "passport_nationality", "passport_date_of_birth", "passport_expiry_date", "handicap"], label: "Passport details and handicap" },
          ],
          when: whenOrganiserOrAgentBooking,
        },
        {
          id: "travelCoordination",
          text: "How are people getting there?",
          options: [
            { value: false, label: "Meet at course" },
            { value: true, label: "We're travelling together" },
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
    logisticsSubtype: undefined, // logistics disabled
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

/**
 * Derived variant - overlays booking/organisation details on top of scenario shape
 */
export type DerivedVariant = {
  bookingMode: "self_pay" | "organiser" | "delegate"; // "everyone" -> "self_pay", "organiser" -> "organiser", "agent" -> "delegate"
  crossBorder: boolean; // courseCountry != homeCountry
  requiresPassport: boolean; // crossBorder OR requiredMemberInfo includes passport
  enableExport: boolean; // bookingMode != "self_pay"
  enableProfile: boolean; // requiresPassport OR requiredMemberInfo non-empty
  enableItinerary: boolean; // (requiresPassport && (travelAny||overnight)) OR bookingMode=="delegate"
  enableFlights: boolean; // enableItinerary && requiresPassport
  logisticsSubtype?: LogisticsSubtype; // overlay rules
  cutoffRule?: "nightBefore" | "daysBefore"; // overlay rules
  cutoffDays?: number; // overlay rules (daysBefore=3 when passport+bookingMode!=self_pay)
};

/**
 * Derive variant overlay from answers and options
 */
export function deriveVariant(
  answers: Partial<ScenarioAnswers>,
  opts?: { courseCountry?: string | null; homeCountry?: string }
): DerivedVariant {
  const homeCountry = opts?.homeCountry ?? "SG";
  const courseCountry = opts?.courseCountry;
  const crossBorder = courseCountry !== null && courseCountry !== undefined && courseCountry !== homeCountry;
  
  // Booking mode mapping (computed first for Policy B)
  const bookingMode = 
    answers.bookingResponsibility === "organiser" ? "organiser" :
    answers.bookingResponsibility === "agent" ? "delegate" :
    "self_pay";
  
  // Compute hasPassportInRequiredInfo for Policy B
  const hasPassportInRequiredInfo = answers.requiredMemberInfo?.some(f => f.includes("passport")) ?? false;
  
  // Policy B: Passport gating
  const cc = (opts?.courseCountry ?? null)?.toUpperCase?.() ?? null;
  
  let requiresPassport = false;
  if (cc === "ID") {
    requiresPassport = true;
  } else if (cc === "MY") {
    requiresPassport = bookingMode !== "self_pay";
  } else {
    requiresPassport = hasPassportInRequiredInfo;
  }
  
  // Compute effective travel flags
  const travelTogether = (answers.travelMode === "together") || (answers.travelCoordination === true);
  const travelAny = (answers.travelMode === "together" || answers.travelMode === "mixed") || (answers.travelCoordination === true);
  const overnight = travelTogether && answers.overnight === true;
  
  const enableExport = bookingMode !== "self_pay";
  const enableProfile = requiresPassport || (answers.requiredMemberInfo && answers.requiredMemberInfo.length > 0) || false;
  const enableItinerary = (requiresPassport && (travelAny || overnight)) || bookingMode === "delegate";
  const enableFlights = enableItinerary && requiresPassport;
  
  // Logistics subtype overlay
  let logisticsSubtype: LogisticsSubtype | undefined;
  if (enableItinerary && requiresPassport && bookingMode === "delegate") {
    logisticsSubtype = "agent_ferry_itinerary";
  } else if (answers.carpool === true) {
    logisticsSubtype = "pickup_carpool";
  } else if (travelAny || overnight) {
    logisticsSubtype = "meet_at_course";
  }
  
  // Cutoff overlay
  let cutoffRule: "nightBefore" | "daysBefore" | undefined;
  let cutoffDays: number | undefined;
  if (requiresPassport && bookingMode !== "self_pay") {
    cutoffRule = "daysBefore";
    cutoffDays = 3;
  }
  
  return {
    bookingMode,
    crossBorder,
    requiresPassport,
    enableExport,
    enableProfile,
    enableItinerary,
    enableFlights,
    logisticsSubtype,
    cutoffRule,
    cutoffDays,
  };
}

/**
 * Apply variant overlay to scenario definition
 * Returns a NEW object (does not mutate SCENARIOS registry)
 */
export function applyVariant(
  def: ScenarioDefinition,
  variant: DerivedVariant
): ScenarioDefinition & { derivedVariant: DerivedVariant } {
  // Overlay modules
  const modules = {
    ...def.modules,
    export: def.modules.export || variant.enableExport,
    profile: def.modules.profile || variant.enableProfile,
    itinerary: def.modules.itinerary || variant.enableItinerary,
    flights: def.modules.flights || variant.enableFlights,
  };
  
  // Overlay logistics subtype
  const logisticsSubtype = variant.logisticsSubtype ?? def.logisticsSubtype;
  
  // Overlay defaults
  const defaults = {
    ...def.defaults,
    cutoffRule: variant.cutoffRule ?? def.defaults.cutoffRule,
    cutoffDays: variant.cutoffDays ?? def.defaults.cutoffDays,
  };
  
  // Overlay requiredForReadiness
  const requiredForReadiness = { ...def.requiredForReadiness };
  if (variant.enableProfile && def.requiredForAgentExport) {
    // Ensure profile step readiness includes passport fields
    if (!requiredForReadiness.profile) {
      requiredForReadiness.profile = [];
    }
    const existingProfile = requiredForReadiness.profile;
    const passportFields = def.requiredForAgentExport.passportFields;
    const newProfileFields = [...existingProfile];
    for (const field of passportFields) {
      if (!newProfileFields.includes(field)) {
        newProfileFields.push(field);
      }
    }
    requiredForReadiness.profile = newProfileFields;
  }
  
  return {
    ...def,
    modules,
    logisticsSubtype,
    defaults,
    requiredForReadiness,
    derivedVariant: variant,
  };
}

/**
 * Get effective scenario (base scenario + variant overlay)
 */
export function getEffectiveScenario(
  key: ScenarioKey,
  answers: Partial<ScenarioAnswers>,
  opts?: { courseCountry?: string | null; homeCountry?: string }
): ScenarioDefinition & { derivedVariant: DerivedVariant } {
  const def = getScenario(key);
  const variant = deriveVariant(answers, opts);
  return applyVariant(def, variant);
}
