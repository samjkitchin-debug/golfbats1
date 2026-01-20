/**
 * GameDay Domain Types
 * 
 * Canonical DTO for normalizing GameDay round shape.
 */

export type GameDayState = "pre_round" | "in_play" | "review" | "published";

export type GameDayKind = "group_trip" | "hosted_round";

export type GameDayInstrumentKey =
  | "round_header"
  | "setup_course_tee"
  | "setup_round"
  | "flight_check"
  | "in_play_hud"
  | "score_entry_premium"
  | "round_controls"
  | "legacy_rest";

export type GameDaySnapshot = {
  playOrder: number[];
  currentHoleNumber: number;
  nextHoleNumber: number | null;
  coursePack: any | null;
};

export type GameDayContext = {
  roundId: number;
  kind: GameDayKind;
  state: GameDayState;
  flags: {
    isInPlay: boolean;
    isPublished: boolean;
    canCloseNow: boolean;
  };
  snapshot: GameDaySnapshot;
  round: any; // Keep full round for now
  coursePack: any | null;
};

export type GameDayPolicy = {
  canEditStartHole: boolean;
  canStartRound: boolean;
  canCloseRound: boolean;
  canPublishRound: boolean;
};
