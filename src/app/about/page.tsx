import MemberLayout from "../(member)/layout";
import { APP_VERSION } from "@/app/lib/appVersion";

function AboutContent() {
  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="text-2xl font-bold text-primary">About DayForeIt</h1>

      <div className="mt-4 space-y-6 text-sm leading-relaxed secondary-text">
        <p>
          DayForeIt is a simple way to organise a round of golf with people you know — so you can enjoy the day without admin getting in the way.
        </p>

        <p>
          It's built for real golfers playing real rounds: mates organising a Saturday game, a group travelling overseas, or a club running an official day. DayForeIt helps you coordinate the details, see who's playing, and record scores if you want — without turning golf into spreadsheets or noise.
        </p>

        <section className="space-y-2">
          <h2 className="font-medium text-primary">What DayForeIt is</h2>
          <ul className="list-disc list-outside pl-6 space-y-2 [list-style-type:disc]">
            <li>A group-first way to organise a round of golf</li>
            <li>Made for real rounds, not process</li>
            <li>Social and easygoing by default</li>
            <li>There to support the day, not dominate it</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-medium text-primary">What it's not</h2>
          <ul className="list-disc list-outside pl-6 space-y-2 [list-style-type:disc]">
            <li>Not a performance or analytics tool</li>
            <li>Not trying to change how you play golf</li>
          </ul>
        </section>

        <p>
          Whether you're hosting, joining, or just keeping an eye on what's coming up, DayForeIt stays out of the way and lets the round be the focus.
        </p>

        <section className="space-y-2">
          <h2 className="font-medium text-primary">Course data (v1)</h2>
          <ul className="list-disc list-outside pl-6 space-y-2 [list-style-type:disc]">
            <li>We use a third-party course database to help you find courses faster.</li>
            <li>Coverage varies by region — some courses may be missing while we expand the catalog.</li>
            <li>Course locations are approximate and used for planning, not precise on-course GPS.</li>
            <li>If you can&apos;t find a course, you can still organise the trip and fill in details manually.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-primary">Where DayForeIt is heading</h2>
          <p>
            DayForeIt is currently working towards v1.
          </p>
          <p>
            Right now, the focus is on making it easy to organise a round and keep everyone aligned on the day. Over the coming releases, you can expect:
          </p>
          <ul className="list-disc list-outside pl-6 space-y-2 [list-style-type:disc]">
            <li>Richer day-of coordination — clearer visibility of who's in, what's happening, and what's next</li>
            <li>Optional scoring and results — when you want to record a round, without forcing competition</li>
            <li>Season and group continuity — seeing how rounds fit together over time</li>
            <li>Lightweight handicap support — simple, practical tracking without complexity</li>
          </ul>
          <p>
            DayForeIt is being built carefully and iteratively. Features are added only when they improve the experience of the day itself.
          </p>
        </section>

        <p className="mt-6 pt-4 text-xs text-muted border-t border-border">
          Version: {APP_VERSION}
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






