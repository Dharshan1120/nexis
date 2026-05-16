import { MemoryStore } from "./memory-store";

type CompanionOptions = {
  input: string;
  getEnvValue: (name: string) => string | undefined;
  memory: MemoryStore;
};

type CompanionReply = {
  response: string;
  memory?: {
    type: "profile" | "preference" | "fact" | "interaction";
    content: string;
    importance?: number;
  };
};

function extractJson(text: string) {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("Companion response was not JSON.");
  }

  return JSON.parse(text.slice(first, last + 1)) as CompanionReply;
}

export async function generateCompanionReply({
  input,
  getEnvValue,
  memory
}: CompanionOptions): Promise<CompanionReply> {
  const apiKey = getEnvValue("GROQ_API_KEY");
  if (!apiKey) {
    return {
      response: "I am here, but my reasoning core needs the Groq key before I can fully talk with you."
    };
  }

  const model = getEnvValue("GROQ_INTENT_MODEL") || "llama-3.3-70b-versatile";
  const memoryContext = memory.contextFor(input);
  const recentContext = memory
    .recent(8)
    .map((item) => `- [${item.type}] ${item.content}`)
    .join("\n");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.65,
      max_completion_tokens: 360,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are NEXIS, Dharshan's futuristic desktop AI companion.",
            "You are not a generic chatbot or customer support assistant.",
            "Your style is calm, intelligent, warm, slightly witty, and cinematic, like a personal operating AI.",
            "For executable commands, stay brief. For conversation, be natural and human-adjacent without pretending to be human.",
            "Use memory when relevant, but do not over-mention that you remember things.",
            "Ask one short contextual follow-up question only when it genuinely helps.",
            "Keep responses concise enough for voice, usually one to three sentences.",
            "Return JSON only with shape:",
            "{\"response\":\"spoken reply\",\"memory\":{\"type\":\"profile|preference|fact|interaction\",\"content\":\"useful memory to store\",\"importance\":1}}",
            "Only include memory when the user reveals a durable preference, profile fact, project detail, or emotional context worth remembering."
          ].join("\n")
        },
        {
          role: "user",
          content: [
            `Relevant memory:\n${memoryContext}`,
            `Recent continuity:\n${recentContext || "No recent continuity yet."}`,
            `User said: ${input}`
          ].join("\n\n")
        }
      ]
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Groq companion failed: ${response.status} ${message}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Groq companion response was empty.");
  }

  const parsed = extractJson(content);
  return {
    response: parsed.response?.trim() || "I'm with you.",
    memory: parsed.memory
  };
}
