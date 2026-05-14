import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("nexis", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  launchUrl: (url: string) => ipcRenderer.invoke("assistant:launch-url", url),
  executeCommand: (command: string) =>
    ipcRenderer.invoke("assistant:execute-command", command),
  transcribeAudio: (payload: {
    audioBytes: number[];
    mimeType: string;
    fileName: string;
  }) => ipcRenderer.invoke("assistant:transcribe-audio", payload)
});
