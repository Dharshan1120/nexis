/// <reference types="vite/client" />

interface Window {
  nexis: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
    close: () => Promise<void>;
    launchUrl: (url: string) => Promise<void>;
    executeCommand: (
      command: string
    ) => Promise<{ ok: boolean; response: string }>;
    transcribeAudio: (payload: {
      audioBytes: number[];
      mimeType: string;
      fileName: string;
    }) => Promise<{ text: string }>;
  };
}
