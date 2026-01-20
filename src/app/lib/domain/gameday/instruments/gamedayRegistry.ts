/**
 * GameDay Instrument Registry
 * 
 * Central registry for all GameDay instruments.
 */

import type { GameDayContext, GameDayInstrumentKey } from "../gamedayTypes";
import type { GameDayInstrumentDefinition } from "./gamedayInstrumentTypes";
import { LegacyRestBody } from "./legacyRestInstrument";
import { RoundHeaderBody } from "./roundHeaderInstrument";
import { SetupCourseTeeBody } from "./setupCourseTeeInstrument";
import { SetupRoundBody } from "./setupRoundInstrument";
import { FlightCheckBody } from "./flightCheckInstrument";
import { InPlayHudBody } from "./inPlayHudInstrument";
import { ScoreEntryPremiumBody } from "./scoreEntryPremiumInstrument";
import { RoundControlsBody } from "./roundControlsInstrument";

// Stub bodies for instruments not yet implemented
function StubBody() {
  return null;
}

export const gamedayRegistry: Record<GameDayInstrumentKey, GameDayInstrumentDefinition> = {
  round_header: {
    key: "round_header",
    title: "",
    helper: undefined,
    isAvailable: () => true,
    RenderBody: RoundHeaderBody,
  },
  setup_course_tee: {
    key: "setup_course_tee",
    title: "Course & tee",
    helper: undefined,
    isAvailable: (ctx: GameDayContext) => ctx.state === "pre_round",
    RenderBody: SetupCourseTeeBody,
  },
  setup_round: {
    key: "setup_round",
    title: "Round setup",
    helper: undefined,
    isAvailable: (ctx: GameDayContext) => ctx.state === "pre_round",
    RenderBody: SetupRoundBody,
  },
  flight_check: {
    key: "flight_check",
    title: "Flights",
    helper: undefined,
    isAvailable: (ctx: GameDayContext) => ctx.state === "pre_round",
    RenderBody: FlightCheckBody,
  },
  in_play_hud: {
    key: "in_play_hud",
    title: "",
    helper: undefined,
    isAvailable: (ctx: GameDayContext) => ctx.state === "in_play",
    RenderBody: InPlayHudBody,
  },
  score_entry_premium: {
    key: "score_entry_premium",
    title: "",
    helper: undefined,
    isAvailable: (ctx: GameDayContext) => ctx.state === "in_play",
    RenderBody: ScoreEntryPremiumBody,
  },
  round_controls: {
    key: "round_controls",
    title: "",
    helper: undefined,
    isAvailable: (ctx: GameDayContext) =>
      ctx.state === "in_play" ||
      ctx.state === "review" ||
      ctx.state === "published",
    RenderBody: RoundControlsBody,
  },
  legacy_rest: {
    key: "legacy_rest",
    title: "",
    helper: undefined,
    isAvailable: () => true,
    RenderBody: LegacyRestBody,
  },
};
