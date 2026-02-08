/**
 * Trip Details blocks selector — pure projection of "what to show" by stage.
 * Single source of truth for Trip Details header blocks; no React.
 * See docs/canon/trip-details-snapshot-header.md.
 *
 * Trip Details is a projection (post-BaseCamp). No lanes/instruments here; edits via kebab only.
 */

import { canEditMeetDetails } from "../../permissions";
import type { Trip } from "../../tripActions";
import type { TripSnapshot } from "../../trips/tripSnapshot";
import { getCanonicalMeet } from "../../trips/tripSnapshot";

export type TripDetailsBlock =
  | {
      kind: "identity";
      title?: string;
      rows: Array<{ key: string; label: string; value: string }>;
      actions?: Array<{ id: string; label: string }>;
    }
  | {
      kind: "trip_shape";
      title?: string;
      rows: Array<{ key: string; label: string; value: string }>;
    }
  | {
      kind: "signups_gate";
      title?: string;
      content: {
        /** When false/undefined: show "Sign-ups open on …" + Open now. When true: show "Sign-ups close on …" + Change only. */
        isOpenNow?: boolean;
        opensOnLabel: string;
        canEdit: boolean;
        showOpenNow: boolean;
        /** When isOpenNow: label for close date line (formatted date or "Not set yet"). */
        closesOnLabel?: string;
        /** When isOpenNow: YMD for the close-date editor (effective close date). */
        closesOnDateYmd?: string | null;
        /** When true: show "Sign-ups are closed." + Reopen action (manual close override). */
        isManuallyClosed?: boolean;
      };
    }
  | {
      kind: "meet";
      meetTimeLabel: string | null;
      meetingPointLabel: string | null;
      hasMeetDetails: boolean;
      primaryAction?: { id: "set_meet_details"; label: "Set meet details" };
    }
  | { kind: "spacer" };

export type TripDetailsStage =
  | "post_create"
  | "signups_open"
  | "locked"
  | "completed";

export function selectTripDetailsBlocks(args: {
  stage: TripDetailsStage;
  snapshot: TripSnapshot | null;
  trip: Trip;
  canEdit: boolean;
  /** Current member id (for meet-details permission). Pass null if unknown. */
  currentMemberId?: string | null;
  /** Whether scoring has started (for meet-details permission). */
  scoringStarted?: boolean;
  signups: {
    opensOnLabel: string;
    showOpenNow: boolean;
    /** Canonical "sign-ups are open now" (e.g. manual open or past open moment). When true, gate shows close semantics. */
    signupsOpenNow?: boolean;
    /** Formatted close date when open (or "Not set yet"). */
    closesOnLabel?: string;
    /** Close date YMD for edit UI when open. */
    closesOnDateYmd?: string | null;
    /** When true, organiser manually closed (override); gate shows "Sign-ups are closed." + Reopen. */
    signupsManuallyClosed?: boolean;
  };
  /** Resolved host line (snapshot.hostLine ?? hostLabel) for identity block */
  hostLineDisplay?: string | null;
}): TripDetailsBlock[] {
  const { stage, snapshot, trip, canEdit, currentMemberId, scoringStarted, signups, hostLineDisplay } = args;

  const allowLockedWithManualClose = stage === "locked" && (signups.signupsManuallyClosed === true);
  if ((stage !== "post_create" && stage !== "signups_open" && !allowLockedWithManualClose) || !snapshot) {
    return [];
  }

  const blocks: TripDetailsBlock[] = [];

  // Identity: title, then exactly: (1) golf club only, (2) date, (3) trip type + host. No group name duplication.
  const identityRows: Array<{ key: string; label: string; value: string }> = [];

  // Line 1: Golf club / venue only (strip group name from metaLine when present as "Group · Course")
  const meta = (snapshot.metaLine ?? "").trim();
  const courseOnly =
    meta.includes(" · ") ? meta.split(" · ").slice(1).join(" · ").trim() : meta;
  if (courseOnly) {
    identityRows.push({ key: "venue", label: "", value: courseOnly });
  }

  // Line 2: Date (unchanged)
  if (snapshot.dateLine) {
    identityRows.push({ key: "dateLine", label: "", value: snapshot.dateLine });
  }

  // Line 3: "{Trip type} · Hosted by {Host name}" from canonical trip discriminator and host
  const isHostedRound =
    trip.scenarioKey === "hosted_round" || trip.tripOrigin === "member";
  const tripTypeLabel = isHostedRound ? "Hosted round" : "Group trip";
  const hostedByRaw = hostLineDisplay ?? trip.hostedByLabel ?? "";
  const hostName = hostedByRaw.replace(/^Hosted by\s*/i, "").trim();
  const tripTypeHostValue = hostName
    ? `${tripTypeLabel} · Hosted by ${hostName}`
    : tripTypeLabel;
  identityRows.push({ key: "tripTypeHost", label: "", value: tripTypeHostValue });

  const renameLabel =
    !trip.tripName || trip.tripName.trim() === "" || snapshot.title === "Group trip"
      ? "Add name"
      : "Rename";

  blocks.push({
    kind: "identity",
    title: snapshot.title,
    rows: identityRows,
    ...(canEdit && { actions: [{ id: "rename", label: renameLabel }] }),
  });

  // Trip shape: Format + Capacity only (no spots/confirmed in post_create)
  const tripShapeRows = snapshot.rows.filter(
    (r) => r.key === "format" || r.key === "capacity"
  );
  if (tripShapeRows.length > 0) {
    blocks.push({
      kind: "trip_shape",
      rows: tripShapeRows,
    });
  }

  // Sign-ups gate: manually closed (Reopen) | open now (close on … + Change) | scheduled (open on … + Change/Open now).
  const showSignupsGate = signups.signupsManuallyClosed || signups.opensOnLabel || signups.signupsOpenNow;
  if (showSignupsGate) {
    blocks.push({
      kind: "signups_gate",
      content: {
        isManuallyClosed: signups.signupsManuallyClosed ?? false,
        isOpenNow: signups.signupsOpenNow ?? false,
        opensOnLabel: signups.opensOnLabel,
        canEdit,
        showOpenNow: signups.showOpenNow,
        ...(signups.signupsOpenNow && {
          closesOnLabel: signups.closesOnLabel ?? "Not set yet",
          closesOnDateYmd: signups.closesOnDateYmd ?? null,
        }),
      },
    });
  }

  // Meet block: sign-ups open only. Read-only meet time + meeting point; single CTA when missing.
  if (stage === "signups_open") {
    const { meetTime12, meetTimeRaw, meetingPoint } = getCanonicalMeet(trip);
    const meetTimeLabel = meetTime12 ?? null;
    const meetingPointLabel = (meetingPoint?.trim() ?? "") || null;
    const hasMeetDetails = Boolean(meetTimeRaw && meetingPoint?.trim());
    const maySetMeetDetails =
      !hasMeetDetails &&
      (typeof scoringStarted === "boolean"
        ? canEditMeetDetails(currentMemberId ?? null, trip, scoringStarted)
        : canEdit);
    blocks.push({
      kind: "meet",
      meetTimeLabel,
      meetingPointLabel,
      hasMeetDetails,
      ...(maySetMeetDetails && {
        primaryAction: { id: "set_meet_details", label: "Set meet details" },
      }),
    });
  }

  return blocks;
}
