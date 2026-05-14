import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { executeSystemCommand } from "./command-engine";

let mainWindow: BrowserWindow | null = null;
let pythonService: ChildProcessWithoutNullStreams | null = null;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

app.commandLine.appendSwitch("enable-features", "MediaStream");

function setupPermissions() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === "media") {
      callback(true);
      return;
    }

    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === "media") {
      return true;
    }

    return false;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    title: "NEXIS",
    vibrancy: "under-window",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function startPythonService() {
  const backendPath = path.join(app.getAppPath(), "python", "app.py");
  pythonService = spawn("python", [backendPath], {
    cwd: app.getAppPath(),
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1"
    }
  });

  pythonService.stdout.on("data", (data) => {
    console.log(`[python] ${data}`.trim());
  });

  pythonService.stderr.on("data", (data) => {
    console.error(`[python:error] ${data}`.trim());
  });
}

function loadLocalEnv() {
  const envPaths = [path.join(app.getAppPath(), ".env"), path.join(app.getAppPath(), ".env.local")];
  const merged: Record<string, string> = {};

  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const content = fs.readFileSync(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const index = line.indexOf("=");
      if (index === -1) {
        continue;
      }

      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^"(.*)"$/, "$1");
      merged[key] = value;
    }
  }

  return merged;
}

function getEnvValue(name: string) {
  return process.env[name] || loadLocalEnv()[name];
}

async function transcribeWithGroq(
  audioBytes: number[],
  mimeType: string,
  fileName: string
): Promise<{ text: string }> {
  const apiKey = getEnvValue("GROQ_API_KEY");
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY in .env");
  }

  const blob = new Blob([new Uint8Array(audioBytes)], { type: mimeType || "audio/webm" });
  const form = new FormData();
  form.append("file", blob, fileName || "nexis-voice.webm");
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "en");
  form.append("temperature", "0");
  form.append("response_format", "json");
  form.append(
    "prompt",
    "Desktop assistant voice commands such as open chrome, open youtube, open notepad, pause mic, stop listening, turn off listening."
  );

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Groq transcription failed: ${response.status} ${message}`);
  }

  const payload = (await response.json()) as { text?: string };
  return { text: payload.text?.trim() || "" };
}

app.whenReady().then(() => {
  setupPermissions();
  createWindow();
  startPythonService();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  pythonService?.kill();
});

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:toggle-maximize", () => {
  if (!mainWindow) {
    return false;
  }

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }

  mainWindow.maximize();
  return true;
});

ipcMain.handle("window:close", () => {
  mainWindow?.close();
});

ipcMain.handle("assistant:launch-url", async (_event, url: string) => {
  await shell.openExternal(url);
});

ipcMain.handle("assistant:execute-command", async (_event, command: string) => {
  return executeSystemCommand(command, {
    minimizeWindow: () => mainWindow?.minimize(),
    quitApp: () => app.quit()
  });
});

ipcMain.handle(
  "assistant:transcribe-audio",
  async (_event, payload: { audioBytes: number[]; mimeType: string; fileName: string }) => {
    return transcribeWithGroq(payload.audioBytes, payload.mimeType, payload.fileName);
  }
);
