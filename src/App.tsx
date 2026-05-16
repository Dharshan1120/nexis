import { Mic, MicOff, Minus, Square, X } from "lucide-react";
import { motion } from "framer-motion";
import { Orb } from "./components/Orb";
import { Waveform } from "./components/Waveform";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { SystemPanel } from "./components/SystemPanel";
import { CommandDeck } from "./components/CommandDeck";
import { useNexisStore } from "./store/useNexisStore";
import { useVoiceAssistant } from "./hooks/useVoiceAssistant";

const modeLabels = {
  idle: "Companion standby",
  listening: "Listening channel open",
  thinking: "Reasoning through context",
  speaking: "Voice response active",
  executing: "Executing operation"
} as const;

export default function App() {
  const mode = useNexisStore((state) => state.mode);
  const subtitle = useNexisStore((state) => state.subtitle);
  const voiceStatus = useNexisStore((state) => state.voiceStatus);
  const activeMicLabel = useNexisStore((state) => state.activeMicLabel);
  const {
    audioLevel,
    deviceLabel,
    isListening,
    isSupported,
    micError,
    startListening,
    stopListening
  } = useVoiceAssistant();

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(13,44,69,0.95),rgba(5,8,22,1)_42%,rgba(3,5,15,1)_100%)] text-white">
      <div className="absolute inset-0 bg-grid bg-[size:80px_80px] opacity-25" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,231,255,0.12),transparent_45%)]" />

      <div className="relative flex min-h-screen flex-col px-6 py-5">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.55em] text-cyan-300/65">NEXIS</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[0.08em]">Desktop Intelligence Core</h1>
          </div>
          <div className="flex items-center gap-3">
            <button className="window-button" onClick={() => window.nexis.minimize()}>
              <Minus size={15} />
            </button>
            <button className="window-button" onClick={() => window.nexis.toggleMaximize()}>
              <Square size={13} />
            </button>
            <button className="window-button" onClick={() => window.nexis.close()}>
              <X size={15} />
            </button>
          </div>
        </header>

        <main className="grid flex-1 grid-cols-[1.4fr_0.95fr] gap-6">
          <section className="glass-panel relative overflow-hidden px-10 py-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,212,255,0.12),transparent_55%)]" />
            <div className="relative flex h-full flex-col items-center justify-between gap-8">
              <div className="flex w-full items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.45em] text-cyan-300/70">Core State</p>
                  <h2 className="mt-2 text-2xl">{modeLabels[mode]}</h2>
                  <p className="mt-3 text-sm text-steel">{voiceStatus}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs uppercase tracking-[0.25em] text-cyan-100">
                    {isListening ? "Live voice" : "Voice paused"}
                  </div>
                  <button
                    onClick={isListening ? stopListening : startListening}
                    className="flex items-center gap-2 rounded-full border border-cyan-300/40 bg-cyan-400/10 px-4 py-2 text-xs uppercase tracking-[0.25em] text-cyan-50 transition hover:bg-cyan-300/20"
                  >
                    {isListening ? <MicOff size={14} /> : <Mic size={14} />}
                    {isListening ? "Pause mic" : "Start mic"}
                  </button>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="flex flex-col items-center"
              >
                <Orb mode={mode} level={audioLevel} />
                <Waveform level={audioLevel} />
              </motion.div>

              <div className="w-full rounded-[2rem] border border-cyan-400/20 bg-black/20 px-6 py-5 text-center">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs uppercase tracking-[0.45em] text-cyan-300/65">Live Subtitle</p>
                  <p className="text-xs text-cyan-200/75">Mic: {deviceLabel || activeMicLabel}</p>
                </div>
                <motion.p
                  key={subtitle}
                  initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  className="mt-3 text-2xl text-cyan-50"
                >
                  {subtitle}
                </motion.p>
                {!isSupported ? (
                  <p className="mt-3 text-sm text-amber-300">
                    Speech recognition is not available in this Electron runtime yet.
                  </p>
                ) : null}
                {micError ? (
                  <p className="mt-3 text-sm text-amber-300">{micError}</p>
                ) : (
                  <p className="mt-3 text-sm text-steel">
                    If you use your phone as the microphone, set it as the Windows default input.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="grid min-h-0 grid-rows-[1.2fr_auto_auto] gap-6">
            <TranscriptPanel />
            <SystemPanel />
            <CommandDeck />
          </section>
        </main>
      </div>
    </div>
  );
}
