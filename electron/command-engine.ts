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
  match: (text: string) => boolean;
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

function wordsOf(text: string) {
  return cleanCommand(text)
    .split(" ")
    .filter((word) => word.length > 0);
}

function levenshtein(a: string, b: string) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) {
    matrix[i][0] = i;
  }

  for (let j = 0; j < cols; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function similarity(a: string, b: string) {
  const left = cleanCommand(a);
  const right = cleanCommand(b);
  const longest = Math.max(left.length, right.length);
  if (longest === 0) {
    return 1;
  }

  return 1 - levenshtein(left, right) / longest;
}

function bestWindowSimilarity(input: string, phrase: string) {
  const inputWords = wordsOf(input);
  const phraseWords = wordsOf(phrase);
  if (inputWords.length === 0 || phraseWords.length === 0) {
    return 0;
  }

  const windowSize = phraseWords.length;
  let best = similarity(input, phrase);

  for (let i = 0; i <= inputWords.length - windowSize; i += 1) {
    const windowText = inputWords.slice(i, i + windowSize).join(" ");
    best = Math.max(best, similarity(windowText, phrase));
  }

  return best;
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
    match: (text) =>
      hasPhrase(text, ["open chrome", "launch chrome", "start chrome"]) ||
      (hasPhrase(text, ["open browser", "launch browser", "start browser"]) && hasActionWord(text)),
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
    match: (text) =>
      hasPhrase(text, ["open youtube", "launch youtube", "start youtube", "watch youtube", "play youtube"]) ||
      hasPhrase(text, ["open you tube", "watch you tube", "play you tube"]),
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
    match: (text) =>
      hasPhrase(text, ["open notepad", "launch notepad", "start notepad", "open note pad", "launch note pad"]),
    run: () => runDetached("notepad.exe")
  },
  {
    id: "close_notepad",
    response: "Closing Notepad.",
    match: (text) =>
      hasPhrase(text, ["close notepad", "kill notepad", "quit notepad", "close note pad", "kill note pad"]),
    run: () => killImage("notepad.exe")
  },
  {
    id: "open_file_manager",
    response: "Opening file manager.",
    match: (text) =>
      hasPhrase(text, [
        "open file manager",
        "launch file manager",
        "start file manager",
        "open file explorer",
        "launch file explorer",
        "open explorer",
        "show files",
        "open files"
      ]),
    run: () => runDetached("explorer.exe")
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

const fuzzyActionPhrases: Array<{ id: string; phrases: string[] }> = [
  {
    id: "open_chrome",
    phrases: ["open chrome", "launch chrome", "start chrome", "open browser", "need internet", "browse internet"]
  },
  {
    id: "close_chrome",
    phrases: ["close chrome", "kill chrome", "quit chrome"]
  },
  {
    id: "open_youtube",
    phrases: ["open youtube", "watch youtube", "play youtube", "open you tube", "watch videos"]
  },
  {
    id: "open_google",
    phrases: ["open google", "google search", "search google"]
  },
  {
    id: "open_notepad",
    phrases: ["open notepad", "launch notepad", "start notepad", "open note pad"]
  },
  {
    id: "close_notepad",
    phrases: ["close notepad", "kill notepad", "quit notepad", "close note pad"]
  },
  {
    id: "open_file_manager",
    phrases: ["open file manager", "open file explorer", "launch file explorer", "open explorer", "show files"]
  },
  {
    id: "open_calculator",
    phrases: ["open calculator", "open calc", "launch calculator"]
  },
  {
    id: "close_calculator",
    phrases: ["close calculator", "close calc", "kill calculator"]
  },
  {
    id: "open_paint",
    phrases: ["open paint", "open mspaint", "launch paint"]
  },
  {
    id: "open_vscode",
    phrases: ["open vs code", "open vscode", "open visual studio code", "launch vs code"]
  },
  {
    id: "open_whatsapp",
    phrases: ["open whatsapp", "open whats app", "launch whatsapp"]
  },
  {
    id: "open_downloads",
    phrases: ["open downloads", "downloads folder", "open downloads folder"]
  },
  {
    id: "open_documents",
    phrases: ["open documents", "documents folder", "open documents folder"]
  },
  {
    id: "open_pictures",
    phrases: ["open pictures", "pictures folder", "open pictures folder"]
  },
  {
    id: "mute_volume",
    phrases: ["mute volume", "mute sound", "silence volume"]
  },
  {
    id: "volume_up",
    phrases: ["volume up", "increase volume", "raise volume"]
  },
  {
    id: "volume_down",
    phrases: ["volume down", "decrease volume", "lower volume"]
  }
];

export function getActionCatalog() {
  return commandRegistry.map((definition) => ({
    id: definition.id,
    response: definition.response
  }));
}

export function looksLikeSystemCommand(command: string) {
  const normalized = cleanCommand(command);
  if (isNoiseProneCommand(normalized)) {
    return false;
  }

  return commandRegistry.some((definition) => definition.match(normalized));
}

export function resolveSystemCommand(command: string) {
  const normalized = cleanCommand(command);
  if (isNoiseProneCommand(normalized)) {
    return null;
  }

  const definition = commandRegistry.find((item) => item.match(normalized));

  if (!definition) {
    return null;
  }

  return {
    id: definition.id,
    response: definition.response,
    normalized
  };
}

export function suggestSystemAction(command: string): CommandSuggestion | null {
  const normalized = cleanCommand(command);
  if (!normalized || isNoiseProneCommand(normalized)) {
    return null;
  }

  let best: CommandSuggestion | null = null;

  for (const action of fuzzyActionPhrases) {
    const definition = commandRegistry.find((item) => item.id === action.id);
    if (!definition) {
      continue;
    }

    for (const phrase of action.phrases) {
      const confidence = bestWindowSimilarity(normalized, phrase);
      if (!best || confidence > best.confidence) {
        best = {
          actionId: action.id,
          response: definition.response,
          confidence,
          phrase,
          normalized
        };
      }
    }
  }

  if (!best || best.confidence < 0.66) {
    return null;
  }

  return best;
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

  const definition = commandRegistry.find((item) => item.match(normalized));

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

  const suggestion = suggestSystemAction(normalized);
  if (suggestion?.confidence && suggestion.confidence >= 0.91 && canExecutePlannedAction(suggestion.actionId, normalized, 0.91)) {
    const suggestedDefinition = commandRegistry.find((item) => item.id === suggestion.actionId);
    if (suggestedDefinition) {
      await suggestedDefinition.run(context);

      return {
        ok: true,
        response: suggestedDefinition.response,
        commandId: suggestedDefinition.id,
        normalized,
        source: "direct"
      };
    }
  }

  if (suggestion) {
    return {
      ok: false,
      response: getActionConfirmation(suggestion.actionId, command),
      commandId: suggestion.actionId,
      normalized,
      needsConfirmation: true,
      source: "fallback"
    };
  }

  return {
    ok: false,
    response: "I am not fully sure what you meant. Please say the command again.",
    normalized,
    source: "fallback"
  };
}
