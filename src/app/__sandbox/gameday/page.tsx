export default function GameDaySandboxPage() {
  return (
    <div className="fixed inset-0 flex flex-col">
      <div
        className="absolute top-0 left-0 right-0 z-10 px-4 py-2 bg-surface/95 border-b border-border text-xs flex justify-between items-center"
      >
        <span>Sandbox: GameDay Prototype</span>
        <a
          href="/sandbox/gameday/index.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground hover:text-muted no-underline"
        >
          Open raw
        </a>
      </div>
      <iframe
        src="/sandbox/gameday/index.html"
        className="border-0 w-full flex-1 mt-9"
        title="GameDay Prototype"
      />
    </div>
  );
}
