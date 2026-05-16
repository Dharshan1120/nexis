/// <reference types="vite/client" />

interface Window {
  nexis: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
    close: () => Promise<void>;
    launchUrl: (url: string) => Promise<void>;
    executeCommand: (
      command: string
    ) => Promise<{ ok: boolean; response: string; commandId?: string; needsConfirmation?: boolean }>;
    transcribeAudio: (payload: {
      audioBytes: number[];
      mimeType: string;
      fileName: string;
    }) => Promise<{
      text: string;
      language?: string;
      duration?: number;
      avgLogprob?: number;
      noSpeechProb?: number;
      compressionRatio?: number;
      provider?: string;
    }>;
    getSystemStats: () => Promise<{
      cpu: string;
      ram: string;
      battery: string;
      network: string;
      runningApps: string;
      uptime: string;
    }>;
  };
}
