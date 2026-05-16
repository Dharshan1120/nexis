import { shell } from "electron";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export type CommandResult = {
  ok: boolean;
  response: string;
  commandId?: string;
  normalized?: string;
  needsConfirmation?: boolean;
  source?: "direct" | "ai" | "fallback" | "confirmation";
};

type CommandContext = {
  quitApp: () => void;
  minimizeWindow: () => void;
};

type CommandDefinition = {
  id: string;
  response: string;
  run: (context: CommandContext) => Promise<void> | void;
};

export type CommandSuggestion = {
  actionId: string;
  response: string;
  confidence: number;
  phrase: string;
  normalized: string;
};

const appActionWords = [
  "open",
  "launch",
  "start",
  "close",
  "kill",
  "quit",
  "exit",
  "show",
  "go to",
  "browse",
  "search",
  "watch",
  "play",
  "need",
  "want"
];

function cleanCommand(command: string) {
  return command
    .toLowerCase()
    .replace(/[^\w\s:/.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPhrase(text: string, phrases: string[]) {
  return phrases.some((phrase) => {
    const pattern = escapeRegex(phrase).replace(/\s+/g, "\\s+");
    return new RegExp(`\\b${pattern}\\b`).test(text);
  });
}

function hasActionWord(text: string) {
  return hasPhrase(text, appActionWords);
}

function mentionsNotepad(text: string) {
  return hasPhrase(text, ["notepad", "note pad"]);
}

function mentionsFileManager(text: string) {
  return hasPhrase(text, ["file manager", "file explorer", "explorer", "files"]);
}

function isNoiseProneCommand(text: string) {
  const fillerPhrases = [
    "i will manage",
    "i'll manage",
    "home manager",
    "phone manager",
    "don't need it",
    "do not need it",
    "might be easy",
    "okay",
    "ok"
  ];

  return hasPhrase(text, fillerPhrases) && !hasActionWord(text);
}



function runDetached(command: string, args: string[] = []) {
  spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  }).unref();
}

function runPowerShell(command: string) {
  runDetached("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command]);
}

function openApp(appName: string) {
  runDetached("cmd.exe", ["/c", "start", "", appName]);
}

function killImage(imageName: string) {
  runDetached("taskkill.exe", ["/IM", imageName, "/F"]);
}

function openKnownFolder(folderName: "downloads" | "desktop" | "documents" | "pictures") {
  const home = os.homedir();
  const folderMap = {
    downloads: path.join(home, "Downloads"),
    desktop: path.join(home, "Desktop"),
    documents: path.join(home, "Documents"),
    pictures: path.join(home, "Pictures")
  };

  void shell.openPath(folderMap[folderName]);
}

function sendVolumeKey(code: 173 | 174 | 175) {
  runPowerShell(`(New-Object -ComObject WScript.Shell).SendKeys([char]${code})`);
}

const commandRegistry: CommandDefinition[] = [
  {
    id: "open_chrome",
    response: "Launching Chrome.",
    run: () => openApp("chrome")
  },
  {
    id: "close_chrome",
    response: "Closing Chrome.",
    run: () => killImage("chrome.exe")
  },
  {
    id: "open_youtube",
    response: "Opening YouTube.",
    run: () => void shell.openExternal("https://www.youtube.com")
  },
  {
    id: "open_google",
    response: "Opening Google.",
    run: () => void shell.openExternal("https://www.google.com")
  },
  {
    id: "open_notepad",
    response: "Opening Notepad.",
    run: () => runDetached("notepad.exe")
  },
  {
    id: "close_notepad",
    response: "Closing Notepad.",
    run: () => killImage("notepad.exe")
  },
  {
    id: "open_file_manager",
    response: "Opening file manager.",
    run: () => runDetached("explorer.exe")
  },
  {
    id: "open_calculator",
    response: "Opening Calculator.",
    run: () => openApp("calc")
  },
  {
    id: "close_calculator",
    response: "Closing Calculator.",
    run: () => killImage("CalculatorApp.exe")
  },
  {
    id: "open_paint",
    response: "Opening Paint.",
    run: () => runDetached("mspaint.exe")
  },
  {
    id: "open_vscode",
    response: "Opening VS Code.",
    run: () => openApp("code")
  },
  {
    id: "open_whatsapp",
    response: "Opening WhatsApp.",
    run: () => void shell.openExternal("whatsapp://")
  },
  {
    id: "open_downloads",
    response: "Opening Downloads.",
    run: () => openKnownFolder("downloads")
  },
  {
    id: "open_desktop",
    response: "Opening Desktop.",
    run: () => openKnownFolder("desktop")
  },
  {
    id: "open_documents",
    response: "Opening Documents.",
    run: () => openKnownFolder("documents")
  },
  {
    id: "open_pictures",
    response: "Opening Pictures.",
    run: () => openKnownFolder("pictures")
  },
  {
    id: "mute_volume",
    response: "Muted.",
    run: () => sendVolumeKey(173)
  },
  {
    id: "volume_up",
    response: "Volume up.",
    run: () => sendVolumeKey(175)
  },
  {
    id: "volume_down",
    response: "Volume down.",
    run: () => sendVolumeKey(174)
  },
  {
    id: "lock_screen",
    response: "Locking screen.",
    run: () => runDetached("rundll32.exe", ["user32.dll,LockWorkStation"])
  },
  {
    id: "minimize_nexis",
    response: "Minimizing.",
    run: (context) => context.minimizeWindow()
  },
  {
    id: "close_nexis",
    response: "Going offline.",
    run: (context) => context.quitApp()
  },
  {
    id: "pause_mic",
    response: "Voice paused.",
    run: () => undefined
  },
  {
    id: "start_mic",
    response: "Voice ready.",
    run: () => undefined
  },
  {
    id: "shutdown_pc",
    response: "For safety, say confirm shutdown PC.",
    run: () => undefined
  },
  {
    id: "confirm_shutdown_pc",
    response: "Shutting down.",
    run: () => runDetached("shutdown.exe", ["/s", "/t", "5"])
  },
  {
    id: "restart_pc",
    response: "For safety, say confirm restart PC.",
    run: () => undefined
  },
  {
    id: "confirm_restart_pc",
    response: "Restarting.",
    run: () => runDetached("shutdown.exe", ["/r", "/t", "5"])
  }
];



export function getActionCatalog() {
  return commandRegistry.map((definition) => ({
    id: definition.id,
    response: definition.response
  }));
}



export async function resolveSystemCommand(command: string) {
  const normalized = cleanCommand(command);
  if (isNoiseProneCommand(normalized)) {
    return null;
  }

  try {
    const response = await fetch("http://127.0.0.1:8765/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: command })
    });
    
    if (response.ok) {
      const result = await response.json() as { ok?: boolean; actionId?: string; confidence?: number };
      if (result.ok && result.actionId) {
        const definition = commandRegistry.find((item) => item.id === result.actionId);
        if (definition) {
          return {
            id: definition.id,
            response: definition.response,
            normalized
          };
        }
      }
    }
  } catch (error) {
    console.warn("[command-engine] Failed to contact Python intent engine for resolve", error);
  }

  return null;
}



export function getActionConfirmation(actionId: string, heard?: string) {
  const definition = commandRegistry.find((item) => item.id === actionId);
  if (!definition) {
    return "I am not fully sure what to do. Please say it again.";
  }

  const target = definition.response.replace(/\.$/, "").toLowerCase();
  const heardText = heard ? ` I heard "${heard}".` : "";
  return `${heardText} Confirm ${target}? Say confirm to run it, or cancel.`;
}

export function canExecutePlannedAction(actionId: string, input: string, confidence = 0) {
  const normalized = cleanCommand(input);

  if (isNoiseProneCommand(normalized)) {
    return false;
  }

  if (confidence < 0.78) {
    return false;
  }

  if (actionId.includes("notepad")) {
    return mentionsNotepad(normalized) && hasActionWord(normalized);
  }

  if (actionId === "open_file_manager") {
    return mentionsFileManager(normalized) && hasActionWord(normalized);
  }

  if (actionId.includes("chrome")) {
    return (
      hasPhrase(normalized, ["chrome", "browser", "internet", "browse", "web"]) && hasActionWord(normalized)
    );
  }

  if (actionId === "open_youtube") {
    return hasPhrase(normalized, ["youtube", "you tube", "watch video", "watch something"]) && hasActionWord(normalized);
  }

  return hasActionWord(normalized);
}

export async function executeSystemAction(
  actionId: string,
  context: CommandContext,
  normalized?: string
): Promise<CommandResult> {
  const definition = commandRegistry.find((item) => item.id === actionId);

  if (!definition) {
    return {
      ok: false,
      response: "Command not mapped yet.",
      commandId: actionId,
      normalized
    };
  }

  await definition.run(context);

  return {
    ok: true,
    response: definition.response,
    commandId: definition.id,
    normalized,
    source: "ai"
  };
}

export async function executeSystemCommand(
  command: string,
  context: CommandContext
): Promise<CommandResult> {
  const normalized = cleanCommand(command);
  if (isNoiseProneCommand(normalized)) {
    return {
      ok: false,
      response: "I heard you, but I will not run a command from that.",
      normalized,
      source: "fallback"
    };
  }

  try {
    const response = await fetch("http://127.0.0.1:8765/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: command })
    });

    if (response.ok) {
      const result = await response.json() as {
        ok?: boolean;
        actionId?: string;
        needsConfirmation?: boolean;
        confidence?: number;
      };

      if (result.ok && result.actionId) {
        const definition = commandRegistry.find((item) => item.id === result.actionId);
        if (definition) {
          await definition.run(context);
          return {
            ok: true,
            response: definition.response,
            commandId: definition.id,
            normalized,
            source: "direct"
          };
        }
      }

      if (result.needsConfirmation && result.actionId) {
        return {
          ok: false,
          response: getActionConfirmation(result.actionId, command),
          commandId: result.actionId,
          normalized,
          needsConfirmation: true,
          source: "fallback"
        };
      }
    }
  } catch (error) {
    console.warn("[command-engine] Failed to contact Python intent engine", error);
  }

  return {
    ok: false,
    response: "I am not fully sure what you meant. Please say the command again.",
    normalized,
    source: "fallback"
  };
}
