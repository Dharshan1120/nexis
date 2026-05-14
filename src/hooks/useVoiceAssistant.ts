import { useEffect, useRef, useState } from "react";
import { useNexisStore } from "../store/useNexisStore";

function speakBriefly(text: string) {
  if (!("speechSynthesis" in window)) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.02;
  utterance.pitch = 0.94;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

function looksLikeCommand(text: string) {
  const normalized = text.toLowerCase().trim();
  if (!normalized) {
    return false;
  }

  const commandHints = [
    "open",
    "close",
    "notepad",
    "chrome",
    "youtube",
    "google",
    "calculator",
    "calc",
    "paint",
    "vscode",
    "vs code",
    "visual studio code",
    "whatsapp",
    "downloads",
    "desktop",
    "documents",
    "pictures",
    "volume",
    "mute",
    "lock",
    "shutdown",
    "restart",
    "minimize",
    "hide",
    "exit",
    "quit",
    "pause mic",
    "stop listening",
    "turn off",
    "start mic",
    "start listening",
    "nexis",
    "nexus"
  ];

  return commandHints.some((hint) => normalized.includes(hint));
}

export function useVoiceAssistant() {
  const [isListening, setIsListening] = useState(false);
  const [isSupported] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0.18);
  const [deviceLabel, setDeviceLabel] = useState("Windows default microphone");
  const [manualPause, setManualPause] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcribingRef = useRef(false);
  const manualPauseRef = useRef(false);
  const pendingChunksRef = useRef<Blob[]>([]);
  const setMode = useNexisStore((state) => state.setMode);
  const setSubtitle = useNexisStore((state) => state.setSubtitle);
  const addTranscript = useNexisStore((state) => state.addTranscript);
  const setVoicePermission = useNexisStore((state) => state.setVoicePermission);
  const setVoiceStatus = useNexisStore((state) => state.setVoiceStatus);
  const setActiveMicLabel = useNexisStore((state) => state.setActiveMicLabel);
  const setMicLevelLabel = useNexisStore((state) => state.setMicLevelLabel);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let dataArray: Uint8Array | null = null;
    let animationFrame = 0;

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
        setVoiceStatus("Groq voice ready");
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

          setAudioLevel(Math.max(0.08, Math.min(1, average * 3.5)));

          if (average > 0.12) {
            setMicLevelLabel("Strong audio");
          } else if (average > 0.05) {
            setMicLevelLabel("Audio detected");
          } else {
            setMicLevelLabel("No audio detected");
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

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      void audioContext?.close();
    };
  }, [setActiveMicLabel, setMicLevelLabel, setVoicePermission, setVoiceStatus]);

  const handleTranscription = async (blob: Blob) => {
    if (transcribingRef.current || blob.size < 1500) {
      return;
    }

    transcribingRef.current = true;
    setMode("thinking");
    setVoiceStatus("Transcribing with Groq");
    setSubtitle("Transcribing...");

    try {
      const buffer = await blob.arrayBuffer();
      const result = await window.nexis.transcribeAudio({
        audioBytes: Array.from(new Uint8Array(buffer)),
        mimeType: blob.type || "audio/webm",
        fileName: "nexis-voice.webm"
      });

      const text = result.text.trim();
      if (!text) {
        setVoiceStatus("No speech detected");
        setSubtitle("Listening...");
        return;
      }

      const normalized = text.toLowerCase();
      if (!looksLikeCommand(text)) {
        setVoiceStatus("Ignoring background speech");
        setSubtitle("Press Start mic, then speak one command.");
        return;
      }

      addTranscript("user", `Heard: ${text}`);
      setSubtitle(`Heard: ${text}`);
      setInterimTranscript(text);

      if (
        normalized.includes("pause mic") ||
        normalized.includes("stop listening") ||
        normalized.includes("turn off listening") ||
        normalized.includes("turn off mic")
      ) {
        addTranscript("nexis", "Voice paused.");
        speakBriefly("Voice paused.");
        await stopListening();
        return;
      }

      const commandResult = await window.nexis.executeCommand(text);
      addTranscript("nexis", commandResult.response);
      setMode(commandResult.ok ? "speaking" : "idle");
      setVoiceStatus(commandResult.ok ? "Command executed" : "Awaiting next command");
      setSubtitle(commandResult.response);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      speakBriefly(commandResult.response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transcription failed";
      setMicError(message);
      if (message.includes("429")) {
        setVoiceStatus("Groq rate limit hit");
        setSubtitle("Groq is busy. Wait 5 seconds, then press Start mic again.");
      } else {
        setVoiceStatus("Groq transcription failed");
        setSubtitle(message);
      }
    } finally {
      transcribingRef.current = false;
      setIsListening(false);
      setMode("idle");
      setVoiceStatus("Voice paused");
      window.setTimeout(() => {
        setSubtitle("Press Start mic, then speak one command.");
        setInterimTranscript("");
      }, 900);
      mediaRecorderRef.current = null;
    }
  };

  const startListening = async () => {
    setManualPause(false);
    manualPauseRef.current = false;
    setMicError(null);
    setIsListening(true);
    setMode("listening");
    setVoiceStatus("Listening for one command");
    setSubtitle("Speak one command now...");

    const stream = streamRef.current;
    if (!stream) {
      setMicError("Microphone stream not ready");
      return;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType });
    pendingChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        pendingChunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      const blob = new Blob(pendingChunksRef.current, { type: mimeType });
      pendingChunksRef.current = [];
      if (blob.size > 0 && !manualPauseRef.current) {
        void handleTranscription(blob);
      }
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    window.setTimeout(() => {
      const activeRecorder = mediaRecorderRef.current;
      if (activeRecorder && activeRecorder.state === "recording") {
        activeRecorder.stop();
      }
    }, 3500);
  };

  const stopListening = async () => {
    setManualPause(true);
    manualPauseRef.current = true;
    setIsListening(false);
    setMode("idle");
    setVoiceStatus("Voice paused");
    setSubtitle("Voice paused.");
    setInterimTranscript("");

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
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
