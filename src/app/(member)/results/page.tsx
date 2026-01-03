type RoundResult = {
  id: number;
  course: string;
  date: string;
  format: "Stableford" | "Strokeplay" | "Scramble";
  leaderboard: { name: string; points?: number; gross?: number }[];
  notes?: string;
};

type SeasonStat = {
  name: string;
  wins: number;
  podiums: number;
  avgPoints: number;
};

const latestRound: RoundResult = {
  id: 101,
  course: "Forest City",
  date: "Sat 10 Feb",
  format: "Stableford",
  leaderboard: [
    { name: "Sam", points: 38, gross: 84 },
    { name: "Alex", points: 36, gross: 88 },
    { name: "Mark", points: 35, gross: 86 },
  ],
  notes: "Windy. Greens quicker than expected.",
};

const seasonStandings: SeasonStat[] = [
  { name: "Sam", wins: 3, podiums: 6, avgPoints: 34.2 },
  { name: "Mark", wins: 2, podiums: 5, avgPoints: 33.1 },
  { name: "Alex", wins: 1, podiums: 4, avgPoints: 31.8 },
];

const recentRounds: RoundResult[] = [
  latestRound,
  {
    id: 100,
    course: "Palm Springs",
    date: "Sat 27 Jan",
    format: "Stableford",
    leaderboard: [
      { name: "Mark", points: 37, gross: 85 },
      { name: "Sam", points: 35, gross: 87 },
      { name: "Alex", points: 34, gross: 90 },
    ],
    notes: "Slow start, strong back 9.",
  },
  {
    id: 99,
    course: "Batam Island Country Club",
    date: "Sat 13 Jan",
    format: "Stableford",
    leaderboard: [
      { name: "Alex", points: 39, gross: 89 },
      { name: "Sam", points: 36, gross: 86 },
      { name: "Mark", points: 33, gross: 88 },
    ],
  },
];

function Medal({ index }: { index: number }) {
  const medals = ["🥇", "🥈", "🥉"];
  return <span className="mr-1">{medals[index] ?? "•"}</span>;
}

export default function ResultsPage() {
  return (
    <main className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <header>
          <h1 className="text-xl font-semibold">Results</h1>
          <p className="text-sm text-gray-500">Leaderboards and bragging rights</p>
        </header>

        {/* Latest Result */}
        <section className="bg-white rounded-lg p-4 shadow">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium text-gray-500">Latest</h2>
              <p className="mt-1 font-semibold">
                {latestRound.course} — {latestRound.format}
              </p>
              <p className="text-sm text-gray-600">{latestRound.date}</p>
            </div>

            <span className="text-xs rounded-full bg-gray-100 px-2 py-1 text-gray-600">
              Round #{latestRound.id}
            </span>
          </div>

          <ul className="mt-3 text-sm space-y-1">
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
            <p className="mt-3 text-sm text-gray-600 italic">“{latestRound.notes}”</p>
          ) : null}
        </section>

        {/* Season Standings */}
        <section className="bg-white rounded-lg p-4 shadow">
          <h2 className="text-sm font-medium text-gray-500">Season</h2>
          <p className="mt-1 font-semibold">Standings</p>

          <div className="mt-3 space-y-2">
            {seasonStandings.map((s, idx) => (
              <div
                key={s.name}
                className="flex items-center justify-between rounded border p-3"
              >
                <div>
                  <p className="font-semibold">
                    {idx + 1}. {s.name}
                  </p>
                  <p className="text-xs text-gray-600">
                    Wins: {s.wins} · Podiums: {s.podiums}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{s.avgPoints.toFixed(1)}</p>
                  <p className="text-xs text-gray-500">avg pts</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-gray-500">
            (Averages based on recorded rounds here — Golf GameBook remains handicap source.)
          </p>
        </section>

        {/* Recent Rounds */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-gray-500">Recent rounds</h2>

          {recentRounds.map((r) => (
  <a
    key={r.id}
    href={`/results/${r.id}`}
    className="block bg-white rounded-lg p-4 shadow hover:bg-gray-50"
  >
    <p className="font-semibold">
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
  </a>
))}
        </section>
      </div>
    </main>
  );
}
