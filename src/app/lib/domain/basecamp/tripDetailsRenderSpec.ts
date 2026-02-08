/**
 * Trip Details render spec — stage-aware projection filtering.
 * Selector-driven visibility layer. Trip remains one canonical record;
 * only what is surfaced changes by stage.
 */

export type TripDetailsStage = "post_create" | "signups_open" | "locked" | "completed";

export type TripDetailsRenderSpec = {
  stage: TripDetailsStage;
  showAnchorBand: boolean;
  suppressInstrumentKeys: string[];
  chromaHiddenKeys: string[];
};

/**
 * Select render spec for Trip Details / BaseCamp landing based on event state.
 * Uses existing event state; no new domain states.
 */
export function selectTripDetailsRenderSpec(args: {
  eventState: string;
  trip: { decisionLogistics?: { meetTime?: string; meetingPoint?: string }; logistics?: { meetTime?: string; meetingPoint?: string } };
}): TripDetailsRenderSpec {
  const { eventState, trip } = args;

  let stage: TripDetailsStage;
  if (eventState === "signups_open") {
    stage = "signups_open";
  } else if (eventState === "locked") {
    stage = "locked";
  } else if (eventState === "completed") {
    stage = "completed";
  } else {
    stage = "post_create";
  }

  if (stage === "post_create") {
    return {
      stage: "post_create",
      showAnchorBand: false,
      suppressInstrumentKeys: ["meet_details"],
      chromaHiddenKeys: ["meet_time", "meeting_point"],
    };
  }

  return {
    stage,
    showAnchorBand: true,
    suppressInstrumentKeys: [],
    chromaHiddenKeys: [],
  };
}
