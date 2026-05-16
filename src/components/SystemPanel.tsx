import { useEffect } from "react";
import { useNexisStore } from "../store/useNexisStore";

export function SystemPanel() {
  const voiceStatus = useNexisStore((state) => state.voiceStatus);
  const activeMicLabel = useNexisStore((state) => state.activeMicLabel);
  const micLevelLabel = useNexisStore((state) => state.micLevelLabel);
  const systemStats = useNexisStore((state) => state.systemStats);
  const setSystemStats = useNexisStore((state) => state.setSystemStats);

  useEffect(() => {
    let disposed = false;

    async function refreshStats() {
      try {
        const stats = await window.nexis.getSystemStats();
        if (!disposed) {
          setSystemStats(stats);
        }
      } catch {
        // System telemetry is non-critical; NEXIS should keep talking if a probe fails.
      }
    }

    void refreshStats();
    const interval = window.setInterval(refreshStats, 5000);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [setSystemStats]);

  const stats = [
    { label: "Voice Pipeline", value: voiceStatus },
    { label: "Microphone", value: activeMicLabel },
    { label: "Mic Activity", value: micLevelLabel },
    { label: "CPU", value: systemStats.cpu },
    { label: "RAM", value: systemStats.ram },
    { label: "Battery", value: systemStats.battery },
    { label: "Network", value: systemStats.network },
    { label: "Uptime", value: systemStats.uptime },
    { label: "Running Apps", value: systemStats.runningApps },
    { label: "Memory Core", value: "Synced" },
    { label: "Response Mode", value: "Companion" }
  ];

  return (
    <div className="glass-panel p-5">
      <p className="text-xs uppercase tracking-[0.45em] text-cyan-300/70">Systems</p>
      <div className="mt-4 grid gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="shrink-0 text-sm text-steel">{stat.label}</span>
            <span className="truncate text-right text-sm text-cyan-200" title={stat.value}>{stat.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
