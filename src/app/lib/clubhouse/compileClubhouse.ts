import type { Trip } from "../tripActions";

export type DataDensity = {
  hasAnyResults: boolean;
  hasAnyPhotos: boolean;
  hasAnyCompletedTrips: boolean;
};

export type TileState = "holding" | "active";

export type TileId =
  | "moment"
  | "celebration"
  | "moments"
  | "people"
  | "explore";

export type TileStates = Record<TileId, TileState>;

/**
 * Deterministic compiler for Clubhouse tile activation.
 * v1: People always active; others holding until data exists.
 */
export function compileClubhouse(
  trips: Trip[],
  currentUserId: string | null,
  todayYYYYMMDD: string
): { dataDensity: DataDensity; tileStates: TileStates } {
  const hasAnyCompletedTrips = trips.some((t) => t.date < todayYYYYMMDD);
  const hasAnyResults = trips.some((t) => {
    if (!t.result) return false;
    const myEntry = currentUserId
      ? t.attendees?.find((a) => a.memberId && a.memberId === currentUserId)
      : undefined;
    return myEntry?.status === "confirmed";
  });
  const hasAnyPhotos = false; // No photos table / query in v1; leave false

  const dataDensity: DataDensity = {
    hasAnyResults,
    hasAnyPhotos,
    hasAnyCompletedTrips,
  };

  const tileStates: TileStates = {
    people: "active",
    moment: hasAnyCompletedTrips || hasAnyResults ? "active" : "holding",
    celebration: hasAnyResults ? "active" : "holding",
    moments: hasAnyPhotos ? "active" : "holding",
    explore: "holding",
  };

  return { dataDensity, tileStates };
}
