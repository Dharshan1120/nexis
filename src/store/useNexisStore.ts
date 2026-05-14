import { create } from "zustand";

type AssistantMode = "idle" | "listening" | "thinking" | "speaking" | "executing";

type VoicePermission = "unknown" | "granted" | "denied" | "unsupported";

type TranscriptEntry = {
  id: string;
  speaker: "user" | "nexis";
  text: string;
};

type NexisState = {
  mode: AssistantMode;
  subtitle: string;
  transcript: TranscriptEntry[];
  voicePermission: VoicePermission;
  voiceStatus: string;
  activeMicLabel: string;
  micLevelLabel: string;
  setMode: (mode: AssistantMode) => void;
  setSubtitle: (subtitle: string) => void;
  setVoicePermission: (permission: VoicePermission) => void;
  setVoiceStatus: (status: string) => void;
  setActiveMicLabel: (label: string) => void;
  setMicLevelLabel: (label: string) => void;
  addTranscript: (speaker: TranscriptEntry["speaker"], text: string) => void;
};

export const useNexisStore = create<NexisState>((set) => ({
  mode: "idle",
  subtitle: "Hi, Dharshan. What do you want to do now?",
  voicePermission: "unknown",
  voiceStatus: "Voice offline",
  activeMicLabel: "Windows default microphone",
  micLevelLabel: "No audio detected",
  transcript: [
    {
      id: crypto.randomUUID(),
      speaker: "nexis",
      text: "Hi, Dharshan. What do you want to do now?"
    }
  ],
  setMode: (mode) => set({ mode }),
  setSubtitle: (subtitle) => set({ subtitle }),
  setVoicePermission: (voicePermission) => set({ voicePermission }),
  setVoiceStatus: (voiceStatus) => set({ voiceStatus }),
  setActiveMicLabel: (activeMicLabel) => set({ activeMicLabel }),
  setMicLevelLabel: (micLevelLabel) => set({ micLevelLabel }),
  addTranscript: (speaker, text) =>
    set((state) => ({
      transcript: [...state.transcript, { id: crypto.randomUUID(), speaker, text }]
    }))
}));
