import MemberLayout from "../(member)/layout";

function AboutContent() {
  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="text-2xl font-bold text-primary">About Day Fore It</h1>

      <div className="mt-4 space-y-4 text-sm leading-relaxed secondary-text">
        <p>
          Day Fore It is a simple way to organise a round of golf with people you know — and enjoy the day without admin getting in the way.
        </p>

        <p>
          It's built for real golfers playing real rounds: mates organising a Saturday game, a group heading overseas, or a club running an official day. Day Fore It helps you coordinate the details, keep track of who's playing, and record scores when you want to — without turning golf into spreadsheets or leaderboards.
        </p>

        <div>
          <div className="font-medium text-primary mb-1">What Day Fore It is</div>
          <ul className="ml-4 list-disc space-y-1">
            <li>A group-first golf coordination app</li>
            <li>Designed for rounds, not bureaucracy</li>
            <li>Calm, social, and personal — not competitive by default</li>
            <li>Built to support the day of golf, not distract from it</li>
          </ul>
        </div>

        <div>
          <div className="font-medium text-primary mb-1">What it's not</div>
          <ul className="ml-4 list-disc space-y-1">
            <li>It's not a betting app</li>
            <li>It's not a stat-obsessed performance tracker</li>
            <li>It's not trying to replace how you enjoy golf</li>
          </ul>
        </div>

        <div>
          <div className="font-medium text-primary mb-1">How it's designed</div>
          <p>
            Day Fore It is intentionally quiet and respectful:
          </p>
          <ul className="ml-4 mt-1 list-disc space-y-1">
            <li>You see what matters next, not everything at once</li>
            <li>Language is human and non-judgmental</li>
            <li>Scores, handicaps, and leaderboards are optional and contextual</li>
            <li>The app adapts as the day progresses — before, during, and after a round</li>
          </ul>
        </div>

        <p>
          Whether you're hosting, joining, or just keeping an eye on what's coming up, Day Fore It is there to support the day — not steal attention from it.
        </p>
      </div>
    </div>
  );
}

export default function AboutPage() {
  return (
    <MemberLayout>
      <AboutContent />
    </MemberLayout>
  );
}






