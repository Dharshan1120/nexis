import { motion } from "framer-motion";

const pulseVariants = {
  idle: {
    scale: [1, 1.04, 1],
    opacity: [0.7, 1, 0.7]
  },
  listening: {
    scale: [1, 1.12, 1.02],
    opacity: [0.85, 1, 0.9]
  },
  thinking: {
    scale: [1, 1.08, 1],
    rotate: [0, 90, 180]
  },
  speaking: {
    scale: [1, 1.15, 1.02],
    opacity: [0.8, 1, 0.85]
  },
  executing: {
    scale: [1, 1.1, 1],
    boxShadow: [
      "0 0 30px rgba(59, 231, 255, 0.35)",
      "0 0 60px rgba(59, 231, 255, 0.55)",
      "0 0 30px rgba(59, 231, 255, 0.35)"
    ]
  }
} as const;

type OrbProps = {
  mode: "idle" | "listening" | "thinking" | "speaking" | "executing";
  level?: number;
};

export function Orb({ mode, level = 0.2 }: OrbProps) {
  const intensity = Math.min(1, Math.max(0.08, level));

  return (
    <div className="relative flex h-[23rem] w-[23rem] items-center justify-center">
      <motion.div
        className="absolute h-full w-full rounded-full bg-cyan-500/10 blur-3xl"
        animate={pulseVariants[mode]}
        transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute h-[85%] w-[85%] rounded-full border border-cyan-400/40"
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
      />
      <motion.div
        className="absolute h-[70%] w-[70%] rounded-full border border-cyan-300/30"
        animate={{ rotate: -360 }}
        transition={{ duration: 14, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
      />
      <motion.div
        className="relative h-40 w-40 rounded-full border border-cyan-300/70 bg-[radial-gradient(circle_at_30%_30%,rgba(114,246,255,0.9),rgba(0,212,255,0.14)_42%,rgba(0,0,0,0.05)_70%)] shadow-glow"
        animate={{
          ...pulseVariants[mode],
          scale: [
            1 + intensity * 0.02,
            1.04 + intensity * 0.14,
            1 + intensity * 0.03
          ],
          boxShadow: [
            `0 0 ${28 + intensity * 35}px rgba(59, 231, 255, ${0.24 + intensity * 0.22})`,
            `0 0 ${52 + intensity * 55}px rgba(114, 246, 255, ${0.28 + intensity * 0.3})`,
            `0 0 ${28 + intensity * 35}px rgba(59, 231, 255, ${0.24 + intensity * 0.22})`
          ]
        }}
        transition={{ duration: mode === "speaking" ? 1.15 : 2.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />
    </div>
  );
}
