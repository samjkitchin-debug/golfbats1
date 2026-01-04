"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadCourses, type Course } from "../../lib/courseActions";
import { getTripCourseText } from "../../lib/tripDisplay";
import { loadTrips, type Trip } from "../../lib/tripActions";

type RoundResult = {
  id: number;
  course: string;
  date: string;
  format: string;
  leaderboard: { name: string; points?: number; gross?: number }[];
  notes?: string;
};

type SeasonStat = {
  name: string;
  wins: number;
  podiums: number;
  avgPoints: number;
};

function Medal({ index }: { index: number }) {
  const medals = ["🥇", "🥈", "🥉"];
  return <span className="mr-1">{medals[index] ?? "•"}</span>;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr + "T00:00:00");
    const formatter = new Intl.DateTimeFormat("en-SG", {
      timeZone: "Asia/Singapore",
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    return formatter.format(date);
  } catch {
    return dateStr;
  }
}

function tripToRoundResult(trip: Trip, courses: Course[]): RoundResult | null {
  if (!trip.result || !trip.result.leaderboard || trip.result.leaderboard.length === 0) {
    return null;
  }

  const courseText = getTripCourseText(trip, courses);
  const leaderboard = trip.result.leaderboard.map((entry) => {
    // Handle both points and other metrics
    const points = entry.points;
    return {
      name: entry.name,
      points: points !== undefined ? points : undefined,
      gross: undefined, // Can be extended if needed
    };
  });

  return {
    id: trip.id,
    course: courseText.title,
    date: formatDate(trip.date),
    format: trip.format,
    leaderboard,
    notes: trip.result.notes,
  };
}

function calculateSeasonStats(rounds: RoundResult[]): SeasonStat[] {
  const statsMap = new Map<string, { points: number[]; wins: number; podiums: number }>();

  for (const round of rounds) {
    if (!round.leaderboard || round.leaderboard.length === 0) continue;

    // Sort by points (descending)
    const sorted = [...round.leaderboard].sort((a, b) => {
      const aPoints = a.points ?? 0;
      const bPoints = b.points ?? 0;
      return bPoints - aPoints;
    });

    // Track all points for average calculation (once per player per round)
    for (const entry of round.leaderboard) {
      if (entry.points !== undefined) {
        const existing = statsMap.get(entry.name) || { points: [], wins: 0, podiums: 0 };
        existing.points.push(entry.points);
        statsMap.set(entry.name, existing);
      }
    }

    // Track wins and podiums (top 3)
    for (let i = 0; i < Math.min(3, sorted.length); i++) {
      const player = sorted[i];
      if (player) {
        const existing = statsMap.get(player.name) || { points: [], wins: 0, podiums: 0 };
        if (i === 0) {
          existing.wins += 1;
        }
        existing.podiums += 1;
        statsMap.set(player.name, existing);
      }
    }
  }

  const stats: SeasonStat[] = Array.from(statsMap.entries()).map(([name, data]) => {
    const avgPoints = data.points.length > 0
      ? data.points.reduce((sum, p) => sum + p, 0) / data.points.length
      : 0;

    return {
      name,
      wins: data.wins,
      podiums: data.podiums,
      avgPoints,
    };
  });

  // Sort by avg points (descending)
  return stats.sort((a, b) => b.avgPoints - a.avgPoints);
}

export default function ResultsPage() {
  const [trips, setTrips] = useState<Trip[]>(() => loadTrips());
  const [courses, setCourses] = useState<Course[]>(() => loadCourses());

  useEffect(() => {
    function syncAll() {
      setTrips(loadTrips());
      setCourses(loadCourses());
    }
    syncAll();
    window.addEventListener("storage", syncAll);
    window.addEventListener("focus", syncAll);
    return () => {
      window.removeEventListener("storage", syncAll);
      window.removeEventListener("focus", syncAll);
    };
  }, []);

  const roundsWithResults = useMemo(() => {
    const results = trips
      .map((trip) => ({ trip, round: tripToRoundResult(trip, courses) }))
      .filter((r): r is { trip: Trip; round: RoundResult } => r.round !== null)
      .sort((a, b) => {
        // Sort by trip date descending (most recent first)
        const dateA = new Date(a.trip.date + "T00:00:00");
        const dateB = new Date(b.trip.date + "T00:00:00");
        return dateB.getTime() - dateA.getTime();
      })
      .map((r) => r.round);
    return results;
  }, [trips, courses]);

  const latestRound = useMemo(() => roundsWithResults[0] || null, [roundsWithResults]);
  const recentRounds = useMemo(() => roundsWithResults.slice(0, 10), [roundsWithResults]);
  const seasonStandings = useMemo(() => calculateSeasonStats(roundsWithResults), [roundsWithResults]);
  return (
    <div className="space-y-4">
      {/* Header */}
      <header>
        <h1 className="text-xl font-semibold text-brand-black">Results</h1>
        <p className="text-sm text-gray-600">Leaderboards and bragging rights</p>
      </header>

      {roundsWithResults.length === 0 ? (
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-600">No results published yet.</div>
          <div className="mt-2 text-xs text-gray-500">
            Results will appear here once trips are completed and results are published.
          </div>
        </div>
      ) : (
        <>
          {/* Latest Result */}
          {latestRound && (
            <section className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-medium text-gray-600">Latest</h2>
                  <p className="mt-1 font-semibold text-brand-black">
                    {latestRound.course} — {latestRound.format}
                  </p>
                  <p className="text-sm text-gray-600">{latestRound.date}</p>
                </div>

                <span className="text-xs rounded-full bg-gray-100 px-2 py-1 text-gray-600">
                  Round #{latestRound.id}
                </span>
              </div>

              <ul className="mt-3 space-y-1 text-sm">
                {latestRound.leaderboard.slice(0, 3).map((p, i) => (
                  <li key={p.name} className="flex items-center justify-between">
                    <span>
                      <Medal index={i} />
                      {p.name}
                    </span>

                    <span className="text-gray-700">
                      {latestRound.format === "Stableford" ? (
                        <>{p.points} pts</>
                      ) : (
                        <>{p.gross} gross</>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              {latestRound.notes ? (
                <p className="mt-3 text-sm text-gray-600 italic">"{latestRound.notes}"</p>
              ) : null}
            </section>
          )}

          {/* Season Standings */}
          {seasonStandings.length > 0 && (
            <section className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="text-sm font-medium text-gray-600">Season</h2>
              <p className="mt-1 font-semibold text-brand-black">Standings</p>

              <div className="mt-3 space-y-2">
                {seasonStandings.map((s, idx) => (
                  <div
                    key={s.name}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div>
                      <p className="font-semibold text-brand-black">
                        {idx + 1}. {s.name}
                      </p>
                      <p className="text-xs text-gray-600">
                        Wins: {s.wins} · Podiums: {s.podiums}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-brand-black">{s.avgPoints.toFixed(1)}</p>
                      <p className="text-xs text-gray-500">avg pts</p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-xs text-gray-500">
                (Averages based on recorded rounds here — Golf GameBook remains handicap source.)
              </p>
            </section>
          )}

          {/* Recent Rounds */}
          {recentRounds.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-gray-600">Recent rounds</h2>

              {recentRounds.map((r) => (
                <Link
                  key={r.id}
                  href={`/results/${r.id}`}
                  className="block rounded-xl border bg-white p-4 shadow-sm hover:bg-gray-50"
                >
                  <p className="font-semibold text-brand-black">
                    {r.course} — {r.format}
                  </p>
                  <p className="text-sm text-gray-600">{r.date}</p>

                  <div className="mt-3 space-y-1 text-sm">
                    {r.leaderboard.slice(0, 3).map((p, i) => (
                      <div key={p.name} className="flex items-center justify-between">
                        <span>
                          <Medal index={i} />
                          {p.name}
                        </span>
                        <span className="text-gray-700">
                          {r.format === "Stableford"
                            ? `${p.points} pts`
                            : `${p.gross} gross`}
                        </span>
                      </div>
                    ))}
                  </div>
                </Link>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
