import { useNexisStore } from "../store/useNexisStore";

export function TranscriptPanel() {
  const transcript = useNexisStore((state) => state.transcript);

  return (
    <div className="glass-panel flex h-full flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.45em] text-cyan-300/70">Conversation</p>
          <h2 className="text-lg text-white">Live Channel</h2>
        </div>
        <div className="rounded-full border border-cyan-400/30 px-3 py-1 text-xs text-cyan-200">
          Memory ready
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-auto pr-2">
        {transcript.map((entry) => (
          <div
            key={entry.id}
            className={
              entry.speaker === "nexis"
                ? "self-start rounded-2xl rounded-tl-sm bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50"
                : "self-end rounded-2xl rounded-tr-sm bg-white/10 px-4 py-3 text-sm text-white"
            }
          >
            {entry.text}
          </div>
        ))}
      </div>
    </div>
  );
}
