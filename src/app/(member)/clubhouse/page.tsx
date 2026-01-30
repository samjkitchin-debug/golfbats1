"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadTrips, type Trip } from "../../lib/tripActions";
import { compileClubhouse, type TileId, type TileStates } from "../../lib/clubhouse/compileClubhouse";
import { logClubhouseEvent } from "../../lib/clubhouseEvents";

function getTodaySGT(): string {
  const now = new Date();
  const sgtOffset = 8 * 60 * 60 * 1000;
  return new Date(now.getTime() + sgtOffset).toISOString().slice(0, 10);
}

const TILE_CONFIG: { id: TileId; label: string; href: string; stripTitle: string; stripPreview: string }[] = [
  { id: "moment", label: "Moment", href: "/clubhouse/moment", stripTitle: "", stripPreview: "" },
  { id: "celebration", label: "Celebration", href: "/clubhouse/celebration", stripTitle: "Highlights", stripPreview: "Highlights from recent rounds" },
  { id: "moments", label: "Photos", href: "/clubhouse/moments", stripTitle: "From the course", stripPreview: "Photos and moments as they happen" },
  { id: "people", label: "People", href: "/clubhouse/people", stripTitle: "The group", stripPreview: "Everyone who plays in this group" },
  { id: "explore", label: "Explore", href: "/clubhouse/explore", stripTitle: "Explore", stripPreview: "" },
];

const STRIP_TILE_IDS: TileId[] = ["celebration", "moments", "people"];

const HERO_PRIMARY = "Inside the clubhouse";
const HERO_SUBLINE = "Moments, highlights, and people from your group";
const EXPLORE_COPY = "Explore the wider clubhouse";

/** Content inset for text alignment (hero + strips). Full-bleed surfaces sit behind. */
const CONTENT_INSET = "px-5";

/**
 * FullBleed wrapper: escapes parent container to viewport width (Clubhouse page only).
 * Use for hero + strips so gradient and paper reach the screen edges.
 */
function FullBleed({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative left-1/2 right-1/2 ml-[-50vw] mr-[-50vw] w-screen min-h-full bg-[rgb(var(--bg))]">
      {children}
    </div>
  );
}

export default function ClubhousePage() {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [approvedGroups, setApprovedGroups] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);

  useEffect(() => {
    document.title = "DayForeIt - Clubhouse";
  }, []);

  useEffect(() => {
    async function loadBootstrap() {
      try {
        const res = await fetch("/api/me/bootstrap", { credentials: "include" });
        if (!res.ok) {
          if (res.status === 401) {
            setLoadingBootstrap(false);
            return;
          }
          throw new Error("Failed to load bootstrap data");
        }
        const bootstrap = await res.json();
        setCurrentUserId(bootstrap.userId);
        setApprovedGroups(bootstrap.approvedGroups || []);
        setActiveGroupId(bootstrap.activeGroupId ?? bootstrap.approvedGroups?.[0]?.id ?? null);
      } catch {
        // Non-fatal
      } finally {
        setLoadingBootstrap(false);
      }
    }
    loadBootstrap();
  }, []);

  useEffect(() => {
    if (!activeGroupId) return;
    async function loadTripsForGroup() {
      try {
        const groupTrips = await loadTrips(activeGroupId!, false);
        setTrips(groupTrips);
      } catch {
        setTrips([]);
      }
    }
    loadTripsForGroup();
  }, [activeGroupId]);

  const todaySGT = useMemo(() => getTodaySGT(), []);
  const { tileStates } = useMemo(
    () => compileClubhouse(trips, currentUserId, todaySGT),
    [trips, currentUserId, todaySGT]
  );

  const clubhouseOpenedRef = useRef(false);
  const clubhouseOpenedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (loadingBootstrap || !activeGroupId) return;
    if (clubhouseOpenedRef.current) return;
    clubhouseOpenedRef.current = true;
    clubhouseOpenedAtRef.current = Date.now();
    logClubhouseEvent({ event_type: "clubhouse_opened", group_id: activeGroupId });
  }, [loadingBootstrap, activeGroupId]);

  useEffect(() => {
    function logExit() {
      const openedAt = clubhouseOpenedAtRef.current;
      const dwellMs = openedAt != null ? Date.now() - openedAt : undefined;
      logClubhouseEvent({
        event_type: "clubhouse_exited",
        group_id: activeGroupId ?? null,
        metadata: dwellMs != null ? { dwell_ms: dwellMs } : undefined,
      });
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") logExit();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      logExit();
    };
  }, [activeGroupId]);

  function handleTileClick(tileId: TileId) {
    if (activeGroupId) {
      logClubhouseEvent({ event_type: "tile_entered", group_id: activeGroupId, tile_id: tileId });
    }
    // Navigation handled by Link
  }

  if (loadingBootstrap) {
    return (
      <div className="pb-24 px-5 pt-4">
        <h1 className="text-xl font-semibold text-foreground">Clubhouse</h1>
        <p className="mt-2 text-sm text-muted">Loading…</p>
      </div>
    );
  }

  const hasNoGroups = approvedGroups.length === 0;

  return (
    <div
      className={
        hasNoGroups
          ? `pb-24 pt-4 w-full ${CONTENT_INSET}`
          : "pb-24 min-h-full overflow-x-hidden"
      }
    >
      {hasNoGroups ? (
        <>
          <div className="mb-4">
            <h1 className="text-xl font-semibold text-foreground">Clubhouse</h1>
            <p className="mt-1 text-xs text-muted">Around the group</p>
          </div>
          <div className="py-10 text-center">
            <p className="text-sm text-muted">Join or create a group to see the Clubhouse.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Link
                href="/join"
                className="rounded-md border border-border bg-surface/60 px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
              >
                Join group
              </Link>
              <Link
                href="/groups/create"
                className="rounded-md btn-anticipation px-4 py-2 text-sm font-medium"
              >
                Create group
              </Link>
            </div>
          </div>
        </>
      ) : (
        <FullBleed>
          {/* Hero wash: gradient on outermost element, full-bleed, no inset, no radius */}
          <div className="clubhouse-hero relative min-h-[35vh] w-full flex flex-col pt-6 pb-28 rounded-none overflow-visible">
            {/* Faint overlay: radial behind headline area + bottom fade into paper */}
            <div
              className="absolute inset-0 pointer-events-none rounded-none"
              style={{
                backgroundImage:
                  "radial-gradient(ellipse 75% 45% at 50% 82%, rgba(255,253,248,0.2), transparent 52%), linear-gradient(to top, rgb(253,251,246), transparent 32%)",
              }}
            />
            <div className={`relative flex flex-1 flex-col min-h-0 ${CONTENT_INSET}`}>
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-foreground/95">Clubhouse</span>
                <div className="flex items-center gap-1.5 text-[11px] text-foreground/70">
                  <Link href="/join" className="hover:text-foreground">
                    Join group
                  </Link>
                  <span aria-hidden>·</span>
                  <Link href="/groups/create" className="hover:text-foreground">
                    Create group
                  </Link>
                </div>
              </div>
              <Link
                href={TILE_CONFIG[0].href}
                onClick={() => handleTileClick(TILE_CONFIG[0].id)}
                className="mt-auto pt-5 flex flex-col text-left"
              >
                <h2 className="text-2xl font-semibold text-foreground tracking-tight">
                  {HERO_PRIMARY}
                </h2>
                <p className="mt-1 text-sm text-foreground/80">{HERO_SUBLINE}</p>
              </Link>
            </div>
          </div>

          {/* Strips: editorial sections, hairline between; no box containers */}
          <div className="space-y-0 pb-6 -mt-12">
            {STRIP_TILE_IDS.map((tileId, stripIndex) => {
              const tile = TILE_CONFIG.find((t) => t.id === tileId)!;
              return (
                <section
                  key={tile.id}
                  className={`clubhouse-strip w-full py-4 px-0 ${stripIndex === 0 ? "mt-10" : "mt-5"} ${stripIndex > 0 ? "border-t border-border/70" : ""}`}
                >
                  <div className={`flex items-center justify-between mb-1.5 ${CONTENT_INSET}`}>
                    <h3 className="text-sm font-semibold text-foreground">{tile.stripTitle}</h3>
                    <Link
                      href={tile.href}
                      onClick={() => handleTileClick(tile.id)}
                      className="text-xs font-medium text-muted hover:text-foreground"
                    >
                      View
                    </Link>
                  </div>
                  <p className={`text-xs text-muted/90 mb-3 ${CONTENT_INSET}`}>
                    {tile.stripPreview}
                  </p>
                  <div
                    className={`flex gap-3 overflow-x-auto overflow-y-hidden pb-1 scrollbar-hide snap-x snap-mandatory ${CONTENT_INSET}`}
                  >
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <Link
                        key={i}
                        href={tile.href}
                        onClick={() => handleTileClick(tile.id)}
                        className="flex-shrink-0 w-[140px] aspect-[4/5] rounded-xl overflow-hidden flex flex-col justify-end bg-gradient-to-t from-foreground/[0.08] to-foreground/[0.03] snap-start"
                      >
                        <span className="text-[9px] text-muted/70 px-2 pb-2 text-left">
                          {tile.stripTitle}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}

            {/* Explore: editorial */}
            <section className="mt-5 py-4 px-0 w-full border-t border-border/70">
              <Link
                href={TILE_CONFIG.find((t) => t.id === "explore")!.href}
                onClick={() => handleTileClick("explore")}
                className="block text-center py-2"
              >
                <span className="text-sm font-medium text-foreground/90">{EXPLORE_COPY}</span>
              </Link>
            </section>
          </div>
        </FullBleed>
      )}
    </div>
  );
}
