export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 text-black">
      <h1 className="mb-6 text-3xl font-bold">Privacy Policy</h1>

      <div className="space-y-5 text-base leading-relaxed">
        <p>
          GolfBats is a private golf club coordination tool. We respect your
          privacy and only collect information required to operate the service.
        </p>

        <h2 className="text-xl font-semibold">What we collect</h2>
        <ul className="list-disc pl-5">
          <li>Your name and email address (via sign-in)</li>
          <li>Optional profile details you choose to provide</li>
          <li>Trip participation and RSVP information</li>
          <li>Declared handicap and per-trip handicap snapshots</li>
        </ul>

        <h2 className="text-xl font-semibold">What we do not do</h2>
        <ul className="list-disc pl-5">
          <li>We do not sell or share your data</li>
          <li>We do not use advertising or tracking pixels</li>
          <li>We do not collect unnecessary personal information</li>
        </ul>

        <h2 className="text-xl font-semibold">Sensitive information</h2>
        <p>
          Certain information (such as passport details) may be required for
          travel coordination in the future. These fields are currently disabled
          and will only be enabled once appropriate security controls are in
          place.
        </p>

        <h2 className="text-xl font-semibold">Access</h2>
        <p>
          This application is intended for invited members only. Access may be
          revoked at any time by administrators.
        </p>

        <h2 className="text-xl font-semibold">Contact</h2>
        <p>
          If you have any questions about privacy or data usage, please contact
          the club administrator.
        </p>
      </div>
    </main>
  );
}
