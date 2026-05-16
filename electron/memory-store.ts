import fs from "node:fs";
import path from "node:path";

export type MemoryRecord = {
  id: string;
  type: "profile" | "preference" | "fact" | "interaction" | "command";
  content: string;
  importance: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

type MemoryFile = {
  memories: MemoryRecord[];
};

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

export class MemoryStore {
  private readonly filePath: string;
  private memories: MemoryRecord[] = [];

  constructor(storageDir: string) {
    this.filePath = path.join(storageDir, "nexis-memory.json");
    this.load();
  }

  add(memory: Omit<MemoryRecord, "id" | "createdAt">) {
    const record: MemoryRecord = {
      ...memory,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };

    this.memories = [record, ...this.memories].slice(0, 500);
    this.save();
    return record;
  }

  recent(limit = 12) {
    return this.memories.slice(0, limit);
  }

  relevant(query: string, limit = 8) {
    const terms = new Set(tokenize(query));
    if (terms.size === 0) {
      return this.recent(limit);
    }

    return this.memories
      .map((memory) => {
        const score = tokenize(memory.content).reduce(
          (total, word) => total + (terms.has(word) ? 1 : 0),
          memory.importance
        );
        return { memory, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.memory);
  }

  contextFor(query: string) {
    const memories = this.relevant(query, 10);
    if (memories.length === 0) {
      return "No stored memory yet.";
    }

    return memories
      .map((memory) => `- [${memory.type}] ${memory.content}`)
      .join("\n");
  }

  private load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.memories = [];
        return;
      }

      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as MemoryFile;
      this.memories = Array.isArray(parsed.memories) ? parsed.memories : [];
    } catch {
      this.memories = [];
    }
  }

  private save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(
      this.filePath,
      JSON.stringify({ memories: this.memories }, null, 2),
      "utf8"
    );
  }
}
