import { shell } from "electron";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export type CommandResult = {
  ok: boolean;
  response: string;
  commandId?: string;
  normalized?: string;
};

type CommandContext = {
  quitApp: () => void;
  minimizeWindow: () => void;
};

type CommandDefinition = {
  id: string;
  response: string;
  match: (text: string) => boolean;
  run: (context: CommandContext) => Promise<void> | void;
};

function cleanCommand(command: string) {
  return command
    .toLowerCase()
    .replace(/[^\w\s:/.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
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
    match: (text) => hasAny(text, ["open chrome", "launch chrome"]) || (text.includes("open") && text.includes("browser")),
    run: () => openApp("chrome")
  },
  {
    id: "close_chrome",
    response: "Closing Chrome.",
    match: (text) => text.includes("close chrome") || text.includes("kill chrome"),
    run: () => killImage("chrome.exe")
  },
  {
    id: "open_youtube",
    response: "Opening YouTube.",
    match: (text) => text.includes("youtube") || text.includes("you tube"),
    run: () => void shell.openExternal("https://www.youtube.com")
  },
  {
    id: "open_google",
    response: "Opening Google.",
    match: (text) => text.includes("open google") || text.includes("google search"),
    run: () => void shell.openExternal("https://www.google.com")
  },
  {
    id: "open_notepad",
    response: "Opening Notepad.",
    match: (text) => text.includes("open notepad") || (text.includes("open") && text.includes("note")),
    run: () => runDetached("notepad.exe")
  },
  {
    id: "close_notepad",
    response: "Closing Notepad.",
    match: (text) => text.includes("close notepad") || (text.includes("close") && text.includes("note")),
    run: () => killImage("notepad.exe")
  },
  {
    id: "open_calculator",
    response: "Opening Calculator.",
    match: (text) => text.includes("open calculator") || text.includes("open calc"),
    run: () => openApp("calc")
  },
  {
    id: "close_calculator",
    response: "Closing Calculator.",
    match: (text) => text.includes("close calculator") || text.includes("close calc"),
    run: () => killImage("CalculatorApp.exe")
  },
  {
    id: "open_paint",
    response: "Opening Paint.",
    match: (text) => text.includes("open paint") || text.includes("open mspaint"),
    run: () => runDetached("mspaint.exe")
  },
  {
    id: "open_vscode",
    response: "Opening VS Code.",
    match: (text) => text.includes("open vscode") || text.includes("open vs code") || text.includes("open visual studio code"),
    run: () => openApp("code")
  },
  {
    id: "open_whatsapp",
    response: "Opening WhatsApp.",
    match: (text) => text.includes("open whatsapp") || text.includes("open whats app"),
    run: () => void shell.openExternal("whatsapp://")
  },
  {
    id: "open_downloads",
    response: "Opening Downloads.",
    match: (text) => text.includes("open downloads") || text.includes("downloads folder"),
    run: () => openKnownFolder("downloads")
  },
  {
    id: "open_desktop",
    response: "Opening Desktop.",
    match: (text) => text.includes("open desktop") || text.includes("desktop folder"),
    run: () => openKnownFolder("desktop")
  },
  {
    id: "open_documents",
    response: "Opening Documents.",
    match: (text) => text.includes("open documents") || text.includes("documents folder"),
    run: () => openKnownFolder("documents")
  },
  {
    id: "open_pictures",
    response: "Opening Pictures.",
    match: (text) => text.includes("open pictures") || text.includes("pictures folder"),
    run: () => openKnownFolder("pictures")
  },
  {
    id: "mute_volume",
    response: "Muted.",
    match: (text) => text.includes("mute") || text.includes("silence volume"),
    run: () => sendVolumeKey(173)
  },
  {
    id: "volume_up",
    response: "Volume up.",
    match: (text) => text.includes("volume up") || text.includes("increase volume"),
    run: () => sendVolumeKey(175)
  },
  {
    id: "volume_down",
    response: "Volume down.",
    match: (text) => text.includes("volume down") || text.includes("decrease volume"),
    run: () => sendVolumeKey(174)
  },
  {
    id: "lock_screen",
    response: "Locking screen.",
    match: (text) => text.includes("lock screen") || text.includes("lock pc") || text.includes("lock computer"),
    run: () => runDetached("rundll32.exe", ["user32.dll,LockWorkStation"])
  },
  {
    id: "minimize_nexis",
    response: "Minimizing.",
    match: (text) => text.includes("minimize nexis") || text.includes("hide nexis"),
    run: (context) => context.minimizeWindow()
  },
  {
    id: "close_nexis",
    response: "Going offline.",
    match: (text) => text.includes("close nexis") || text.includes("exit nexis") || text.includes("quit nexis"),
    run: (context) => context.quitApp()
  },
  {
    id: "pause_mic",
    response: "Voice paused.",
    match: (text) =>
      text.includes("pause mic") ||
      text.includes("stop listening") ||
      text.includes("turn off listening") ||
      text.includes("turn off mic"),
    run: () => undefined
  },
  {
    id: "start_mic",
    response: "Voice ready.",
    match: (text) => text.includes("start mic") || text.includes("start listening"),
    run: () => undefined
  },
  {
    id: "shutdown_pc",
    response: "For safety, say confirm shutdown PC.",
    match: (text) => text.includes("shutdown") && !text.includes("confirm shutdown"),
    run: () => undefined
  },
  {
    id: "confirm_shutdown_pc",
    response: "Shutting down.",
    match: (text) => text.includes("confirm shutdown"),
    run: () => runDetached("shutdown.exe", ["/s", "/t", "5"])
  },
  {
    id: "restart_pc",
    response: "For safety, say confirm restart PC.",
    match: (text) => text.includes("restart") && !text.includes("confirm restart"),
    run: () => undefined
  },
  {
    id: "confirm_restart_pc",
    response: "Restarting.",
    match: (text) => text.includes("confirm restart"),
    run: () => runDetached("shutdown.exe", ["/r", "/t", "5"])
  }
];

export function looksLikeSystemCommand(command: string) {
  const normalized = cleanCommand(command);
  return commandRegistry.some((definition) => definition.match(normalized));
}

export async function executeSystemCommand(
  command: string,
  context: CommandContext
): Promise<CommandResult> {
  const normalized = cleanCommand(command);
  const definition = commandRegistry.find((item) => item.match(normalized));

  if (!definition) {
    return {
      ok: false,
      response: "Command not mapped yet.",
      normalized
    };
  }

  await definition.run(context);

  return {
    ok: true,
    response: definition.response,
    commandId: definition.id,
    normalized
  };
}
