import { getActionCatalog, resolveSystemCommand } from "./command-engine";
import { MemoryStore } from "./memory-store";

export type IntentDecision = {
  mode: "action" | "remember" | "recall" | "conversation" | "unknown";
  actionId?: string;
  response?: string;
  memory?: {
    type: "profile" | "preference" | "fact" | "interaction";
    content: string;
    importance?: number;
  };
  confidence: number;
  reason?: string;
};

type IntentOptions = {
  input: string;
  getEnvValue: (name: string) => string | undefined;
  memory: MemoryStore;
};

function extractJson(text: string) {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("AI intent response was not JSON.");
  }

  return JSON.parse(text.slice(first, last + 1)) as IntentDecision;
}

async function heuristicDecision(input: string): Promise<IntentDecision | null> {
  const normalized = input.toLowerCase().trim();
  const direct = await resolveSystemCommand(input);
  if (direct) {
    return {
      mode: "action",
      actionId: direct.id,
      confidence: 0.95,
      reason: "Matched local command registry."
    };
  }

  if (normalized.startsWith("remember ")) {
    return {
      mode: "remember",
      memory: {
        type: "fact",
        content: input.replace(/^remember\s+/i, "").trim(),
        importance: 3
      },
      response: "Stored.",
      confidence: 0.9
    };
  }

  return null;
}

export async function classifyIntent({
  input,
  getEnvValue,
  memory
}: IntentOptions): Promise<IntentDecision> {
  const heuristic = await heuristicDecision(input);
  if (heuristic) {
    return heuristic;
  }

  const apiKey = getEnvValue("GROQ_API_KEY");
  if (!apiKey) {
    return {
      mode: "unknown",
      response: "I need the Groq key before I can reason about that.",
      confidence: 0
    };
  }

  const actionCatalog = getActionCatalog();
  const model = getEnvValue("GROQ_INTENT_MODEL") || "llama-3.3-70b-versatile";

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_completion_tokens: 350,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are NEXIS, a concise AI operating assistant.",
            "Classify user input into one JSON object only.",
            "Do not behave like a chatbot when an action is appropriate.",
            "Infer intent from natural language. Example: 'I need internet' means open_chrome, and 'let's watch something' can mean open_youtube.",
            "Use mode action only when a listed action_id should be executed and the user clearly wants the computer to do something now.",
            "If the transcript is casual speech, unclear, a fragment, or likely misheard, use mode conversation instead of action.",
            "Never execute from vague words alone. 'notepad' alone, 'manager', 'manage it', 'I will manage it', or 'I don't need it' are not actions.",
            "For app actions, require a clear app/tool target plus an action meaning open, launch, start, close, quit, browse, watch, or play.",
            "Set confidence below 0.78 when the transcript is noisy or ambiguous.",
            "Use mode remember when the user asks you to remember useful personal context.",
            "Use mode recall when the user asks about prior memory.",
            "Use mode conversation for friendly companion talk, feelings, brainstorming, status checks, or anything that should not execute a system action.",
            "Allowed action ids:",
            JSON.stringify(actionCatalog),
            "Return shape:",
            "{\"mode\":\"action|remember|recall|conversation|unknown\",\"actionId\":\"optional_action_id\",\"response\":\"brief response\",\"memory\":{\"type\":\"profile|preference|fact|interaction\",\"content\":\"text\",\"importance\":1},\"confidence\":0.0,\"reason\":\"short\"}"
          ].join("\n")
        },
        {
          role: "user",
          content: [
            `Stored memory:\n${memory.contextFor(input)}`,
            `User input: ${input}`
          ].join("\n\n")
        }
      ]
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Groq intent failed: ${response.status} ${message}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Groq intent response was empty.");
  }

  const decision = extractJson(content);
  if (decision.mode === "action" && decision.actionId) {
    const validAction = actionCatalog.some((action) => action.id === decision.actionId);
    if (!validAction) {
      return {
        mode: "unknown",
        response: "I understood you, but that action is not available yet.",
        confidence: 0.2,
        reason: `Invalid action id: ${decision.actionId}`
      };
    }
  }

  return decision;
}
