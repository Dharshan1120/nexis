import { FormEvent, useState } from "react";
import { useNexisStore } from "../store/useNexisStore";

export function CommandDeck() {
  const [command, setCommand] = useState("");
  const setMode = useNexisStore((state) => state.setMode);
  const setSubtitle = useNexisStore((state) => state.setSubtitle);
  const addTranscript = useNexisStore((state) => state.addTranscript);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = command.trim();
    if (!trimmed) {
      return;
    }

    addTranscript("user", trimmed);
    setMode("executing");
    setSubtitle("Processing command...");

    const result = await window.nexis.executeCommand(trimmed);

    addTranscript("nexis", result.response);
    setSubtitle(result.response);
    setMode(result.ok ? "speaking" : "idle");
    setCommand("");
  };

  return (
    <div className="glass-panel p-5">
      <p className="text-xs uppercase tracking-[0.45em] text-cyan-300/70">Command Deck</p>
      <form className="mt-4 flex gap-3" onSubmit={handleSubmit}>
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="Type if voice is off..."
          className="flex-1 rounded-2xl border border-cyan-400/20 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-steel focus:border-cyan-300/50"
        />
        <button
          type="submit"
          className="rounded-2xl border border-cyan-300/40 bg-cyan-400/10 px-5 py-3 text-sm text-cyan-100 transition hover:bg-cyan-300/20"
        >
          Execute
        </button>
      </form>
    </div>
  );
}
