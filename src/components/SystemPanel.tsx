import { useNexisStore } from "../store/useNexisStore";

export function SystemPanel() {
  const voiceStatus = useNexisStore((state) => state.voiceStatus);
  const activeMicLabel = useNexisStore((state) => state.activeMicLabel);
  const micLevelLabel = useNexisStore((state) => state.micLevelLabel);
  const stats = [
    { label: "Voice Pipeline", value: voiceStatus },
    { label: "Microphone", value: activeMicLabel },
    { label: "Mic Activity", value: micLevelLabel },
    { label: "Memory Core", value: "Synced" },
    { label: "Response Mode", value: "Companion" }
  ];

  return (
    <div className="glass-panel p-5">
      <p className="text-xs uppercase tracking-[0.45em] text-cyan-300/70">Systems</p>
      <div className="mt-4 grid gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="text-sm text-steel">{stat.label}</span>
            <span className="text-sm text-cyan-200">{stat.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
