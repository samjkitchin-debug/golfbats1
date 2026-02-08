/**
 * Trip Details blocks selector — pure projection of "what to show" by stage.
 * Single source of truth for Trip Details header blocks; no React.
 * See docs/canon/trip-details-snapshot-header.md.
 */

import type { Trip } from "../../tripActions";
import type { TripSnapshot } from "../../trips/tripSnapshot";

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
        opensOnLabel: string;
        canEdit: boolean;
        showOpenNow: boolean;
      };
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
  signups: { opensOnLabel: string; showOpenNow: boolean };
  /** Resolved host line (snapshot.hostLine ?? hostLabel) for identity block */
  hostLineDisplay?: string | null;
}): TripDetailsBlock[] {
  const { stage, snapshot, trip, canEdit, signups, hostLineDisplay } = args;

  if (stage !== "post_create" || !snapshot) {
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

  // Sign-ups gate: "Sign-ups open on …" + flags
  if (signups.opensOnLabel) {
    blocks.push({
      kind: "signups_gate",
      content: {
        opensOnLabel: signups.opensOnLabel,
        canEdit,
        showOpenNow: signups.showOpenNow,
      },
    });
  }

  return blocks;
}
