import MemberLayout from "../(member)/layout";

function PrivacyContent() {
  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="text-2xl font-bold text-primary">Privacy</h1>

      <div className="mt-4 space-y-4 text-sm leading-relaxed secondary-text">
        <p>
          Your trust matters. Day Fore It is designed to collect only what's needed to make the app work — and nothing more.
        </p>

        <div>
          <div className="font-medium text-primary mb-1">What we collect</div>
          <p>We store basic information so the app can function properly, such as:</p>
          <ul className="ml-4 mt-1 list-disc space-y-1">
            <li>Your name and email</li>
            <li>Group memberships</li>
            <li>Rounds you host or join</li>
            <li>Scores and handicap information (if you choose to record them)</li>
          </ul>
          <p className="mt-1">That's it.</p>
        </div>

        <div>
          <div className="font-medium text-primary mb-1">What we don't do</div>
          <ul className="ml-4 list-disc space-y-1">
            <li>We don't sell your data</li>
            <li>We don't run ads</li>
            <li>We don't track you across the internet</li>
            <li>We don't collect unnecessary personal information</li>
          </ul>
          <p className="mt-1">
            Your data is used only to support the features you use inside Day Fore It.
          </p>
        </div>

        <div>
          <div className="font-medium text-primary mb-1">Who can see your information</div>
          <ul className="ml-4 list-disc space-y-1">
            <li>Your details are visible only to people in the same group or round, where relevant</li>
            <li>Scores and handicaps are visible within the context of a round or group — not publicly</li>
            <li>There is no public profile or searchable directory</li>
          </ul>
        </div>

        <div>
          <div className="font-medium text-primary mb-1">Data security</div>
          <p>
            Day Fore It uses modern, secure infrastructure to store and protect your data. Access is restricted by group membership and role, and sensitive operations are protected server-side.
          </p>
        </div>

        <div>
          <div className="font-medium text-primary mb-1">Your control</div>
          <ul className="ml-4 list-disc space-y-1">
            <li>You can leave groups and rounds at any time</li>
            <li>You control whether you record scores</li>
            <li>You control how much information you share within a group</li>
          </ul>
        </div>

        <p>
          If you ever have questions about how your data is used, or want something clarified or removed, you can contact us directly.
        </p>
      </div>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <MemberLayout>
      <PrivacyContent />
    </MemberLayout>
  );
}






