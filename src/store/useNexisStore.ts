import { create } from "zustand";

type AssistantMode = "idle" | "listening" | "thinking" | "speaking" | "executing";

type VoicePermission = "unknown" | "granted" | "denied" | "unsupported";

type TranscriptEntry = {
  id: string;
  speaker: "user" | "nexis";
  text: string;
};

type SystemStats = {
  cpu: string;
  ram: string;
  battery: string;
  network: string;
  runningApps: string;
  uptime: string;
};

type NexisState = {
  mode: AssistantMode;
  subtitle: string;
  transcript: TranscriptEntry[];
  voicePermission: VoicePermission;
  voiceStatus: string;
  activeMicLabel: string;
  micLevelLabel: string;
  systemStats: SystemStats;
  setMode: (mode: AssistantMode) => void;
  setSubtitle: (subtitle: string) => void;
  setVoicePermission: (permission: VoicePermission) => void;
  setVoiceStatus: (status: string) => void;
  setActiveMicLabel: (label: string) => void;
  setMicLevelLabel: (label: string) => void;
  setSystemStats: (stats: SystemStats) => void;
  addTranscript: (speaker: TranscriptEntry["speaker"], text: string) => void;
};

const startupGreetings = [
  "Welcome back.",
  "Good to see you again.",
  "NEXIS online.",
  "Ready when you are.",
  "Systems awake, Dharshan.",
  "Standing by."
];

const startupGreeting = startupGreetings[Math.floor(Math.random() * startupGreetings.length)];

export const useNexisStore = create<NexisState>((set) => ({
  mode: "idle",
  subtitle: startupGreeting,
  voicePermission: "unknown",
  voiceStatus: "Voice offline",
  activeMicLabel: "Windows default microphone",
  micLevelLabel: "No audio detected",
  systemStats: {
    cpu: "--",
    ram: "--",
    battery: "--",
    network: "--",
    runningApps: "--",
    uptime: "--"
  },
  transcript: [
    {
      id: crypto.randomUUID(),
      speaker: "nexis",
      text: startupGreeting
    }
  ],
  setMode: (mode) => set({ mode }),
  setSubtitle: (subtitle) => set({ subtitle }),
  setVoicePermission: (voicePermission) => set({ voicePermission }),
  setVoiceStatus: (voiceStatus) => set({ voiceStatus }),
  setActiveMicLabel: (activeMicLabel) => set({ activeMicLabel }),
  setMicLevelLabel: (micLevelLabel) => set({ micLevelLabel }),
  setSystemStats: (systemStats) => set({ systemStats }),
  addTranscript: (speaker, text) =>
    set((state) => ({
      transcript: [...state.transcript, { id: crypto.randomUUID(), speaker, text }]
    }))
}));
