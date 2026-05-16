import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execFile, spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import {
  canExecutePlannedAction,
  executeSystemAction,
  executeSystemCommand,
  getActionConfirmation
} from "./command-engine";
import { classifyIntent } from "./intent-engine";
import { MemoryStore } from "./memory-store";
import { generateCompanionReply } from "./companion-engine";

let mainWindow: BrowserWindow | null = null;
let pythonService: ChildProcessWithoutNullStreams | null = null;
let memoryStore: MemoryStore | null = null;
let previousCpuSample = sampleCpu();
let localWhisperAvailable = false;
let pendingConfirmation: { actionId: string; heard: string; createdAt: number } | null = null;

const execFileAsync = promisify(execFile);

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
  const bundledVenvPython = path.join(app.getAppPath(), ".venv310", "Scripts", "python.exe");
  const pythonExecutable = fs.existsSync(bundledVenvPython) ? bundledVenvPython : "python";

  console.log(`[speech] spawning Python backend: ${pythonExecutable}`);
  console.log(`[speech] backend script: ${backendPath}`);

  const localEnv = loadLocalEnv();
  const hfToken = process.env.HF_TOKEN || localEnv.HF_TOKEN || "";

  pythonService = spawn(pythonExecutable, [backendPath], {
    cwd: app.getAppPath(),
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      // Pass HuggingFace token so model downloads are authenticated (suppresses rate-limit warning)
      ...(hfToken ? { HF_TOKEN: hfToken } : { HUGGINGFACE_HUB_VERBOSITY: "error" })
    }
  });

  pythonService.stdout.on("data", (data) => {
    console.log(`[python] ${data}`.trim());
  });

  pythonService.stderr.on("data", (data) => {
    console.error(`[python:error] ${data}`.trim());
  });

  pythonService.on("error", (err) => {
    console.error(`[speech] Python process failed to start: ${err.message}`);
  });

  pythonService.on("exit", (code, signal) => {
    console.warn(`[speech] Python process exited: code=${code} signal=${signal}`);
    localWhisperAvailable = false;
  });
}

async function waitForPythonReady(timeoutMs = 180000, intervalMs = 800): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  console.log(`[speech] waiting for Python backend + Whisper model (timeout: ${timeoutMs}ms)`);

  while (Date.now() < deadline) {
    attempt++;
    try {
      const response = await fetch("http://127.0.0.1:8765/health", { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        const body = (await response.json()) as { status?: string; whisper?: string; whisper_error?: string };

        if (body.whisper === "error") {
          console.error(`[speech] Whisper model failed to load: ${body.whisper_error ?? "unknown error"}`);
          return false;
        }

        if (body.whisper === "ready") {
          console.log(`[speech] Python backend + Whisper ready after ${attempt} poll(s)`);
          return true;
        }

        // Still loading — log every 5 attempts (~4s) to avoid spam
        if (attempt === 1 || attempt % 5 === 0) {
          console.log(`[speech] /health attempt ${attempt}: whisper=${body.whisper ?? "unknown"} (model loading...)`);
        }
      } else {
        if (attempt === 1 || attempt % 5 === 0) {
          console.warn(`[speech] /health attempt ${attempt}: HTTP ${response.status}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 1 || attempt % 5 === 0) {
        console.log(`[speech] /health attempt ${attempt}: ${msg} (server not up yet, retrying...)`);
      }
    }

    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }

  console.error(`[speech] Python backend + Whisper did not become ready within ${timeoutMs}ms`);
  return false;
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

function sampleCpu() {
  const cpus = os.cpus();
  const total = cpus.reduce((sum, cpu) => {
    const times = cpu.times;
    return sum + times.user + times.nice + times.sys + times.idle + times.irq;
  }, 0);
  const idle = cpus.reduce((sum, cpu) => sum + cpu.times.idle, 0);
  return { total, idle };
}

function readCpuUsage() {
  const current = sampleCpu();
  const totalDelta = current.total - previousCpuSample.total;
  const idleDelta = current.idle - previousCpuSample.idle;
  previousCpuSample = current;

  if (totalDelta <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
}

async function readBatteryStatus() {
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress"
    ]);
    const parsed = JSON.parse(stdout.trim() || "{}") as {
      EstimatedChargeRemaining?: number;
      BatteryStatus?: number;
    };

    if (typeof parsed.EstimatedChargeRemaining !== "number") {
      return "AC power";
    }

    const charging = parsed.BatteryStatus === 2 ? "charging" : "battery";
    return `${parsed.EstimatedChargeRemaining}% ${charging}`;
  } catch {
    return "Unavailable";
  }
}

async function readRunningApps() {
  try {
    const { stdout } = await execFileAsync("tasklist.exe", ["/FO", "CSV", "/NH"]);
    const names = stdout
      .split(/\r?\n/)
      .map((line) => line.match(/^"([^"]+)"/)?.[1])
      .filter(Boolean) as string[];
    const unique = Array.from(new Set(names))
      .filter((name) => !name.toLowerCase().includes("runtimebroker"))
      .slice(0, 7);
    return unique.join(", ") || "No apps detected";
  } catch {
    return "Unavailable";
  }
}

function readNetworkStatus() {
  const interfaces = os.networkInterfaces();
  const active = Object.entries(interfaces)
    .filter(([, entries]) => entries?.some((entry) => !entry.internal && entry.family === "IPv4"))
    .map(([name]) => name);

  return active.length > 0 ? active.slice(0, 2).join(", ") : "Offline";
}

function formatUptime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

async function readSystemStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = Math.round(((totalMem - freeMem) / totalMem) * 100);

  const [battery, runningApps] = await Promise.all([readBatteryStatus(), readRunningApps()]);

  return {
    cpu: `${readCpuUsage()}%`,
    ram: `${usedMem}%`,
    battery,
    network: readNetworkStatus(),
    runningApps,
    uptime: formatUptime(os.uptime())
  };
}

function getCommandContext() {
  return {
    minimizeWindow: () => mainWindow?.minimize(),
    quitApp: () => app.quit()
  };
}

function isConfirmation(input: string) {
  return /^(yes|yeah|yep|confirm|confirmed|do it|go ahead|proceed|please do|correct|that's right)\b/i.test(input.trim());
}

function isCancellation(input: string) {
  return /^(no|nope|cancel|stop|don't|do not|never mind|nevermind)\b/i.test(input.trim());
}

async function handleAssistantInput(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, response: "I did not catch that." };
  }

  const memory = memoryStore ?? new MemoryStore(app.getPath("userData"));
  memoryStore = memory;

  if (pendingConfirmation && Date.now() - pendingConfirmation.createdAt < 15000) {
    if (isConfirmation(trimmed)) {
      const confirmed = pendingConfirmation;
      pendingConfirmation = null;
      const result = await executeSystemAction(confirmed.actionId, getCommandContext(), confirmed.heard);
      memory.add({
        type: "command",
        content: `User confirmed action: ${confirmed.actionId}. Original transcript: ${confirmed.heard}.`,
        importance: 2,
        metadata: {
          commandId: confirmed.actionId,
          source: "confirmation"
        }
      });
      return {
        ...result,
        source: "confirmation" as const
      };
    }

    if (isCancellation(trimmed)) {
      pendingConfirmation = null;
      return {
        ok: true,
        response: "Cancelled.",
        source: "confirmation" as const
      };
    }
  } else {
    pendingConfirmation = null;
  }

  const directResult = await executeSystemCommand(trimmed, getCommandContext());
  if (directResult.ok) {
    pendingConfirmation = null;
    memory.add({
      type: "command",
      content: `User asked: ${trimmed}. NEXIS executed: ${directResult.commandId}.`,
      importance: 2,
      metadata: {
        commandId: directResult.commandId,
        source: "direct"
      }
    });
    return directResult;
  }

  if (directResult.needsConfirmation && directResult.commandId) {
    pendingConfirmation = {
      actionId: directResult.commandId,
      heard: trimmed,
      createdAt: Date.now()
    };
    return directResult;
  }

  try {
    const decision = await classifyIntent({
      input: trimmed,
      getEnvValue,
      memory
    });

    if (decision.mode === "action" && decision.actionId) {
      if (!canExecutePlannedAction(decision.actionId, trimmed, decision.confidence)) {
        if (decision.confidence >= 0.55) {
          pendingConfirmation = {
            actionId: decision.actionId,
            heard: trimmed,
            createdAt: Date.now()
          };
          return {
            ok: false,
            response: getActionConfirmation(decision.actionId, trimmed),
            commandId: decision.actionId,
            needsConfirmation: true,
            source: "ai" as const
          };
        }

        const companion = await generateCompanionReply({
          input: trimmed,
          getEnvValue,
          memory
        });

        memory.add({
          type: "interaction",
          content: `User: ${trimmed}. NEXIS treated this as conversation instead of executing ${decision.actionId}.`,
          importance: 1,
          metadata: {
            source: "action-safety",
            commandId: decision.actionId,
            reason: decision.reason,
            confidence: decision.confidence
          }
        });

        return {
          ok: true,
          response: companion.response,
          source: "ai" as const
        };
      }

      const result = await executeSystemAction(decision.actionId, getCommandContext(), trimmed);
      memory.add({
        type: "command",
        content: `User asked: ${trimmed}. NEXIS planned action: ${decision.actionId}.`,
        importance: 3,
        metadata: {
          commandId: decision.actionId,
          source: "ai",
          reason: decision.reason,
          confidence: decision.confidence
        }
      });
      return {
        ...result,
        response: decision.response?.trim() || result.response,
        source: "ai" as const
      };
    }

    if (decision.mode === "remember" && decision.memory?.content) {
      memory.add({
        type: decision.memory.type,
        content: decision.memory.content,
        importance: decision.memory.importance ?? 3,
        metadata: {
          source: "ai"
        }
      });
      return {
        ok: true,
        response: decision.response?.trim() || "Stored.",
        source: "ai" as const
      };
    }

    if (decision.mode === "recall") {
      return {
        ok: true,
        response: decision.response?.trim() || memory.contextFor(trimmed),
        source: "ai" as const
      };
    }

    if (decision.mode === "conversation") {
      const companion = await generateCompanionReply({
        input: trimmed,
        getEnvValue,
        memory
      });

      if (companion.memory?.content) {
        memory.add({
          type: companion.memory.type,
          content: companion.memory.content,
          importance: companion.memory.importance ?? 2,
          metadata: {
            source: "companion"
          }
        });
      }

      memory.add({
        type: "interaction",
        content: `User: ${trimmed}. NEXIS: ${companion.response}`,
        importance: 1,
        metadata: {
          source: "companion"
        }
      });
      return {
        ok: true,
        response: companion.response,
        source: "ai" as const
      };
    }

    if (decision.mode === "unknown") {
      const companion = await generateCompanionReply({
        input: trimmed,
        getEnvValue,
        memory
      });

      memory.add({
        type: "interaction",
        content: `User: ${trimmed}. NEXIS: ${companion.response}`,
        importance: 1,
        metadata: {
          source: "companion-fallback"
        }
      });

      return {
        ok: true,
        response: companion.response,
        source: "ai" as const
      };
    }

    return {
      ok: false,
      response: decision.response?.trim() || directResult.response,
      source: "ai" as const
    };
  } catch (error) {
    console.error(error);
    return {
      ...directResult,
      response:
        error instanceof Error && error.message.includes("429")
          ? "The intent engine is rate-limited. Try again in a moment."
          : directResult.response
    };
  }
}

async function transcribeWithGroq(
  audioBytes: number[],
  mimeType: string,
  fileName: string
): Promise<{
  text: string;
  language?: string;
  duration?: number;
  avgLogprob?: number;
  noSpeechProb?: number;
  compressionRatio?: number;
}> {
  const apiKey = getEnvValue("GROQ_API_KEY");
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY in .env");
  }

  const blob = new Blob([new Uint8Array(audioBytes)], { type: mimeType || "audio/webm" });
  const prompt = [
      "NEXIS is a Windows desktop assistant. The user may speak with an Indian/Sri Lankan accent through a phone microphone.",
      "Prefer clear desktop commands and app names over random filler words.",
      "Common commands: open chrome, close chrome, open browser, open youtube, open google, open notepad, close notepad, open file manager, open file explorer, open calculator, close calculator, open paint, open vs code, open whatsapp, open downloads, mute volume, volume up, volume down, pause mic, stop listening, confirm, cancel.",
      "If audio is unclear, transcribe only the words you are confident about."
    ].join(" ");
  const buildForm = (responseFormat: "json" | "verbose_json") => {
    const form = new FormData();
    form.append("file", blob, fileName || "nexis-voice.webm");
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "en");
    form.append("temperature", "0");
    form.append("response_format", responseFormat);
    form.append("prompt", prompt);
    return form;
  };

  const requestTranscription = (responseFormat: "json" | "verbose_json") =>
    fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: buildForm(responseFormat)
    });

  let response = await requestTranscription("verbose_json");

  if (!response.ok) {
    const message = await response.text();
    if (response.status === 400 && message.toLowerCase().includes("verbose")) {
      response = await requestTranscription("json");
    } else {
      throw new Error(`Groq transcription failed: ${response.status} ${message}`);
    }
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Groq transcription failed: ${response.status} ${message}`);
  }

  const payload = (await response.json()) as {
    text?: string;
    language?: string;
    duration?: number;
    segments?: Array<{
      avg_logprob?: number;
      no_speech_prob?: number;
      compression_ratio?: number;
    }>;
  };
  const segments = payload.segments ?? [];
  const scoredSegments = segments.filter(
    (segment) =>
      typeof segment.avg_logprob === "number" ||
      typeof segment.no_speech_prob === "number" ||
      typeof segment.compression_ratio === "number"
  );
  const average = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;

  return {
    text: payload.text?.trim() || "",
    language: payload.language,
    duration: payload.duration,
    avgLogprob: average(
      scoredSegments
        .map((segment) => segment.avg_logprob)
        .filter((value): value is number => typeof value === "number")
    ),
    noSpeechProb: average(
      scoredSegments
        .map((segment) => segment.no_speech_prob)
        .filter((value): value is number => typeof value === "number")
    ),
    compressionRatio: average(
      scoredSegments
        .map((segment) => segment.compression_ratio)
        .filter((value): value is number => typeof value === "number")
    )
  };
}

async function transcribeWithLocalWhisper(
  audioBytes: number[],
  mimeType: string,
  fileName: string
): Promise<{
  text: string;
  language?: string;
  duration?: number;
  avgLogprob?: number;
  noSpeechProb?: number;
  compressionRatio?: number;
  provider?: string;
}> {
  if (!localWhisperAvailable) {
    throw new Error("Local Faster-Whisper backend is not ready yet");
  }

  console.log(`[speech] sending ${audioBytes.length} bytes to local Faster-Whisper (mime: ${mimeType})`);

  let response: Response;
  try {
    response = await fetch("http://127.0.0.1:8765/transcribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        audioBytes,
        mimeType,
        fileName
      }),
      signal: AbortSignal.timeout(60000)
    });
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    console.error(`[speech] fetch to /transcribe failed: ${msg}`);
    // Backend went down — reset readiness so the next call re-checks
    localWhisperAvailable = false;
    throw new Error(`Transcription fetch failed: ${msg}`);
  }

  const payload = (await response.json()) as {
    ok?: boolean;
    error?: string;
    text?: string;
    language?: string;
    duration?: number;
    avgLogprob?: number;
    noSpeechProb?: number;
    compressionRatio?: number;
    provider?: string;
  };

  if (!response.ok || payload.ok === false) {
    console.error(`[speech] /transcribe error: HTTP ${response.status} — ${payload.error ?? "unknown"}`);
    throw new Error(payload.error || `Local Faster-Whisper failed: ${response.status}`);
  }

  console.log(`[speech] local Faster-Whisper result: "${payload.text?.slice(0, 60)}..." (lang: ${payload.language}, dur: ${payload.duration}s)`);

  return {
    text: payload.text?.trim() || "",
    language: payload.language,
    duration: payload.duration,
    avgLogprob: payload.avgLogprob,
    noSpeechProb: payload.noSpeechProb,
    compressionRatio: payload.compressionRatio,
    provider: payload.provider || "faster-whisper"
  };
}

async function transcribeAudio(
  audioBytes: number[],
  mimeType: string,
  fileName: string
): Promise<{
  text: string;
  language?: string;
  duration?: number;
  avgLogprob?: number;
  noSpeechProb?: number;
  compressionRatio?: number;
  provider?: string;
}> {
  const provider = (getEnvValue("NEXIS_STT_PROVIDER") || "local").toLowerCase();
  console.log(`[speech] transcribeAudio called — provider: ${provider}, localWhisperAvailable: ${localWhisperAvailable}, bytes: ${audioBytes.length}`);

  if (provider !== "groq") {
    try {
      const result = await transcribeWithLocalWhisper(audioBytes, mimeType, fileName);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[speech] local Faster-Whisper unavailable: ${msg}`);
      if (provider === "local") {
        const groqKey = getEnvValue("GROQ_API_KEY");
        if (!groqKey) {
          console.error("[speech] no GROQ_API_KEY fallback available — transcription failed");
          throw error;
        }
        console.log("[speech] falling back to Groq Whisper");
      }
    }
  }

  return transcribeWithGroq(audioBytes, mimeType, fileName);
}

app.whenReady().then(() => {
  setupPermissions();
  memoryStore = new MemoryStore(app.getPath("userData"));
  createWindow();
  startPythonService();

  // Probe the Python backend in the background — sets localWhisperAvailable
  // once the server is accepting connections so the first transcription call
  // never hits a cold ECONNREFUSED.
  void waitForPythonReady(180000, 800).then((ready) => {
    localWhisperAvailable = ready;
    if (ready) {
      console.log("[speech] local Faster-Whisper is available and ready");
    } else {
      console.warn("[speech] local Faster-Whisper did not become ready — will use Groq fallback");
    }
  });

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
  return handleAssistantInput(command);
});

ipcMain.handle(
  "assistant:transcribe-audio",
  async (_event, payload: { audioBytes: number[]; mimeType: string; fileName: string }) => {
    return transcribeAudio(payload.audioBytes, payload.mimeType, payload.fileName);
  }
);

ipcMain.handle("assistant:system-stats", () => {
  return readSystemStats();
});
