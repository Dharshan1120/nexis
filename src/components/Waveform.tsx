import { motion } from "framer-motion";

const bars = Array.from({ length: 20 }, (_, index) => index);

type WaveformProps = {
  level?: number;
};

export function Waveform({ level = 0.2 }: WaveformProps) {
  return (
    <div className="flex h-24 items-end justify-center gap-2">
      {bars.map((bar) => (
        <motion.div
          key={bar}
          className="w-2 rounded-full bg-gradient-to-t from-cyan-500/30 to-cyan-300"
          animate={{
            height: [
              `${12 + level * 35}%`,
              `${28 + ((bar * 7) % 22) + level * 40}%`,
              `${18 + level * 28}%`,
              `${34 + ((bar * 11) % 24) + level * 38}%`,
              `${12 + level * 35}%`
            ]
          }}
          transition={{
            duration: 1.8,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
            delay: bar * 0.045
          }}
        />
      ))}
    </div>
  );
}
