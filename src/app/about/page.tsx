export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 text-black">
      <h1 className="mb-6 text-3xl font-bold">About GolfBats</h1>

      <div className="space-y-5 text-base leading-relaxed">
        <p>
          GolfBats is a private noticeboard and coordination tool for our golf group.
        </p>

        <p>
          It exists to make organising golf easier — who’s playing, where we’re playing, when we’re
          playing, and the practical details around it.
        </p>

        <p>
          GolfBats is not a scoring system and doesn’t try to replace official handicap systems or
          competition software. It’s simply here to help us organise trips and keep everything in
          one place.
        </p>

        <section>
          <h2 className="text-xl font-semibold">What you can do on GolfBats</h2>
          <div className="mt-3 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">As a member, you can:</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-gray-800 space-y-1">
                <li>See upcoming and past trips</li>
                <li>Indicate whether you’re playing</li>
                <li>View trip logistics and notes</li>
                <li>Keep a simple personal profile</li>
                <li>View course and tee information</li>
                <li>See published summary results when relevant</li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900">Admins use GolfBats to:</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-gray-800 space-y-1">
                <li>Set up and manage trips</li>
                <li>Manage courses and tees</li>
                <li>Close or reopen trips</li>
                <li>Publish results</li>
                <li>Export coordination data when needed</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">How it’s designed</h2>
          <p className="mt-2">
            GolfBats is intentionally:
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm text-gray-800 space-y-1">
            <li>Private — only for members of the group</li>
            <li>Mobile-first — designed to be quick and easy on your phone</li>
            <li>Simple — focused on coordination, not clutter</li>
          </ul>
          <p className="mt-3">
            It’s a practical tool for real-world golf, nothing more complicated than that.
          </p>
        </section>
      </div>
    </main>
  );
}


