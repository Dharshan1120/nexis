import { useEffect, useRef, useState } from "react";
import { useNexisStore } from "../store/useNexisStore";

const standbyLines = [
  "Ready when you are.",
  "NEXIS online.",
  "Standing by.",
  "Good to see you again.",
  "Welcome back.",
  "Systems quiet. I am here."
];

function randomStandbyLine() {
  return standbyLines[Math.floor(Math.random() * standbyLines.length)];
}

function cleanTranscript(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/^(nexis|nexus|next is|axis)[, ]+/i, "")
    .trim();
}

function containsForeignScript(text: string) {
  return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0600-\u06ff\u0400-\u04ff]/u.test(text);
}

function isEnglishLanguage(language?: string) {
  if (!language) {
    return true;
  }

  const normalized = language.toLowerCase().trim();
  return normalized === "en" || normalized === "eng" || normalized === "english";
}

function isLowSignalTranscript(text: string) {
  const normalized = text.toLowerCase().replace(/[^\w\s]/g, "").trim();
  const ignored = new Set([
    "okay",
    "ok",
    "hmm",
    "um",
    "uh",
    "sorry",
    "thanks",
    "thank you"
  ]);

  if (ignored.has(normalized)) {
    return true;
  }

  return normalized.length < 3;
}

function shouldRejectTranscription(result: {
  text: string;
  language?: string;
  duration?: number;
  avgLogprob?: number;
  noSpeechProb?: number;
  compressionRatio?: number;
}) {
  const text = cleanTranscript(result.text);

  if (!text || isLowSignalTranscript(text)) {
    return "Low-signal voice fragment ignored";
  }

  if (containsForeignScript(text)) {
    return "Non-English/noisy transcript rejected";
  }

  if (!isEnglishLanguage(result.language)) {
    return "Non-English transcript rejected";
  }

  if (typeof result.noSpeechProb === "number" && result.noSpeechProb > 0.95) {
    return "Background audio rejected";
  }

  if (typeof result.compressionRatio === "number" && result.compressionRatio > 4) {
    return "Unstable transcript rejected";
  }

  return null;
}

function speakBriefly(text: string, onStart?: () => void, onEnd?: () => void) {
  if (!("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.02;
  utterance.pitch = 0.94;
  utterance.volume = 1;
  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
}

export function useVoiceAssistant() {
  const [isListening, setIsListening] = useState(true);
  const [isSupported] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0.18);
  const [deviceLabel, setDeviceLabel] = useState("Windows default microphone");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcribingRef = useRef(false);
  const voiceArmedRef = useRef(true);
  const speakingRef = useRef(false);
  const pendingChunksRef = useRef<Blob[]>([]);
  const levelRef = useRef(0);
  const lastSpeechAtRef = useRef(0);
  const lastInteractionAtRef = useRef(Date.now());
  const recorderStartedAtRef = useRef(0);
  const lastTranscriptRef = useRef("");
  const lastTranscriptAtRef = useRef(0);
  const setMode = useNexisStore((state) => state.setMode);
  const setSubtitle = useNexisStore((state) => state.setSubtitle);
  const addTranscript = useNexisStore((state) => state.addTranscript);
  const setVoicePermission = useNexisStore((state) => state.setVoicePermission);
  const setVoiceStatus = useNexisStore((state) => state.setVoiceStatus);
  const setActiveMicLabel = useNexisStore((state) => state.setActiveMicLabel);
  const setMicLevelLabel = useNexisStore((state) => state.setMicLevelLabel);

  const stopRecorder = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
  };

  const startRecorder = () => {
    const stream = streamRef.current;
    if (
      !stream ||
      !voiceArmedRef.current ||
      speakingRef.current ||
      transcribingRef.current ||
      (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive")
    ) {
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType });
    pendingChunksRef.current = [];
    recorderStartedAtRef.current = Date.now();
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        pendingChunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      const duration = Date.now() - recorderStartedAtRef.current;
      const blob = new Blob(pendingChunksRef.current, { type: mimeType });
      pendingChunksRef.current = [];
      mediaRecorderRef.current = null;

      if (blob.size > 1000 && duration > 550 && voiceArmedRef.current) {
        void handleTranscription(blob);
      }
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsListening(true);
    setMode("listening");
    setVoiceStatus("Listening");
    setSubtitle("I am listening.");
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let dataArray: Uint8Array | null = null;
    let animationFrame = 0;
    let activityInterval = 0;

    async function startMicMonitor() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMicLevelLabel("Browser mic API unavailable");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        streamRef.current = stream;
        const trackLabel = stream.getAudioTracks()[0]?.label?.trim();
        if (trackLabel) {
          setDeviceLabel(trackLabel);
          setActiveMicLabel(trackLabel);
        }

        setVoicePermission("granted");
        setIsListening(true);
        setMode("idle");
        setVoiceStatus("Always listening");
        setSubtitle(randomStandbyLine());

        audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.82;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        source.connect(analyser);

        const tick = () => {
          if (!analyser || !dataArray) {
            return;
          }

          analyser.getByteFrequencyData(dataArray);
          const average =
            dataArray.reduce((sum, value) => sum + value, 0) / (dataArray.length * 255);
          levelRef.current = average;
          setAudioLevel(Math.max(0.08, Math.min(1, average * 3.5)));

          if (average > 0.1) {
            setMicLevelLabel("Strong audio");
          } else if (average > 0.035) {
            setMicLevelLabel("Audio detected");
          } else {
            setMicLevelLabel("Quiet");
          }

          animationFrame = window.requestAnimationFrame(tick);
        };

        tick();
      } catch (error) {
        setMicLevelLabel("Mic permission blocked");
        setMicError(error instanceof Error ? error.message : "Microphone access failed");
        setVoicePermission("denied");
      }
    }

    void startMicMonitor();

    activityInterval = window.setInterval(() => {
      if (!voiceArmedRef.current || speakingRef.current || transcribingRef.current) {
        return;
      }

      const now = Date.now();
      const level = levelRef.current;
      const activeRecorder = mediaRecorderRef.current;

      if (level > 0.04) {
        lastSpeechAtRef.current = now;
        lastInteractionAtRef.current = now;
        startRecorder();
      }

      if (activeRecorder?.state === "recording") {
        const recordingFor = now - recorderStartedAtRef.current;
        const silenceFor = now - lastSpeechAtRef.current;
        if (recordingFor > 7600 || (recordingFor > 1000 && silenceFor > 1200)) {
          stopRecorder();
        }
      }

      if (!activeRecorder && now - lastInteractionAtRef.current > 18000) {
        setMode("idle");
        setVoiceStatus("Standby");
        setSubtitle(randomStandbyLine());
        lastInteractionAtRef.current = now;
      }
    }, 180);

    return () => {
      window.clearInterval(activityInterval);
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      stopRecorder();
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      void audioContext?.close();
    };
  }, [
    setActiveMicLabel,
    setMicLevelLabel,
    setMode,
    setSubtitle,
    setVoicePermission,
    setVoiceStatus
  ]);

  const handleTranscription = async (blob: Blob) => {
    if (transcribingRef.current || blob.size < 1500) {
      return;
    }

    transcribingRef.current = true;
    setMode("thinking");
    setVoiceStatus("Interpreting voice input");
    setSubtitle("Processing your voice...");

    try {
      const buffer = await blob.arrayBuffer();
      const result = await window.nexis.transcribeAudio({
        audioBytes: Array.from(new Uint8Array(buffer)),
        mimeType: blob.type || "audio/webm",
        fileName: "nexis-voice.webm"
      });

      const rejectionReason = shouldRejectTranscription(result);
      if (rejectionReason) {
        const rejectedText = cleanTranscript(result.text);
        setVoiceStatus(rejectionReason);
        setSubtitle(rejectedText ? `${rejectionReason}: ${rejectedText}` : "Ignoring uncertain audio.");
        return;
      }

      const text = cleanTranscript(result.text);

      const now = Date.now();
      const sameAsLast = text.toLowerCase() === lastTranscriptRef.current.toLowerCase();
      if (sameAsLast && now - lastTranscriptAtRef.current < 3500) {
        setVoiceStatus("Duplicate voice fragment ignored");
        setSubtitle("Still listening.");
        return;
      }

      lastTranscriptRef.current = text;
      lastTranscriptAtRef.current = now;

      if (isLowSignalTranscript(text)) {
        setVoiceStatus("Low-signal voice fragment ignored");
        setSubtitle("Still listening.");
        return;
      }

      addTranscript("user", `Heard: ${text}`);
      setSubtitle(`Heard: ${text}`);
      setInterimTranscript(text);

      const normalized = text.toLowerCase();
      if (
        normalized.includes("pause mic") ||
        normalized.includes("stop listening") ||
        normalized.includes("turn off listening") ||
        normalized.includes("turn off mic")
      ) {
        addTranscript("nexis", "Voice paused.");
        voiceArmedRef.current = false;
        setIsListening(false);
        speakBriefly("Voice paused.", undefined, () => {
          setMode("idle");
          setVoiceStatus("Voice paused");
          setSubtitle("Voice paused. I am standing by.");
        });
        return;
      }

      const commandResult = await window.nexis.executeCommand(text);
      addTranscript("nexis", commandResult.response);
      setMode(commandResult.ok || commandResult.needsConfirmation ? "speaking" : "idle");
      setVoiceStatus(
        commandResult.needsConfirmation
          ? "Awaiting confirmation"
          : commandResult.ok
            ? "Responding"
            : "Companion standby"
      );
      setSubtitle(commandResult.response);
      lastInteractionAtRef.current = Date.now();
      speakBriefly(
        commandResult.response,
        () => {
          speakingRef.current = true;
          setMode("speaking");
        },
        () => {
          speakingRef.current = false;
          if (voiceArmedRef.current) {
            setMode("idle");
            setVoiceStatus("Always listening");
            setSubtitle(randomStandbyLine());
          }
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transcription failed";
      setMicError(message);
      if (message.includes("429")) {
        setVoiceStatus("Groq rate limit hit");
        setSubtitle("Groq is busy. Holding the channel for a moment.");
      } else {
        setVoiceStatus("Groq transcription failed");
        setSubtitle(message);
      }
    } finally {
      transcribingRef.current = false;
      setInterimTranscript("");
    }
  };

  const startListening = async () => {
    voiceArmedRef.current = true;
    setMicError(null);
    setIsListening(true);
    setMode("idle");
    setVoiceStatus("Always listening");
    setSubtitle(randomStandbyLine());
  };

  const stopListening = async () => {
    voiceArmedRef.current = false;
    setIsListening(false);
    stopRecorder();
    setMode("idle");
    setVoiceStatus("Voice paused");
    setSubtitle("Voice paused. I am standing by.");
    setInterimTranscript("");
  };

  return {
    audioLevel,
    deviceLabel,
    interimTranscript,
    isListening,
    isSupported,
    micError,
    startListening,
    stopListening
  };
}
