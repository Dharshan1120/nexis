# NEXIS

NEXIS is a futuristic desktop AI companion inspired by Jarvis-style operating assistants. This foundation includes:

- Electron desktop shell
- React + TypeScript holographic interface
- Tailwind + Framer Motion animation layer
- Python memory core with SQLite
- starter command execution bridge

## Run

```bash
npm install
python -m pip install -r python/requirements.txt
npm run dev
```

Faster-Whisper is optional but recommended for voice accuracy. NEXIS tries local Faster-Whisper first and falls back to Groq transcription when local STT is unavailable and `GROQ_API_KEY` is configured.

Useful `.env` voice settings:

```bash
NEXIS_STT_PROVIDER=local
NEXIS_WHISPER_MODEL=base.en
NEXIS_WHISPER_DEVICE=cpu
NEXIS_WHISPER_COMPUTE_TYPE=int8
```

## Current foundation

- cinematic orb UI
- live subtitle area
- transcript panel
- system panel
- command deck
- Electron window controls
- Python service startup
- local SQLite memory bootstrap
- local Faster-Whisper transcription endpoint
- AI intent pipeline for natural command understanding
- modular command registry for trusted PC actions
- local Electron memory store for recent context and behavior

## Next integrations

- real microphone streaming
- wake word detection
- Edge TTS or ElevenLabs playback
- Groq conversation routing
- Supabase memory sync
- Windows automation actions
- Python 3.11 environment for the full voice stack

## Intelligence Flow

```text
VOICE/TEXT INPUT
-> AI INTENT ENGINE
-> ACTION PLANNER
-> COMMAND EXECUTION
-> MEMORY UPDATE
-> NATURAL RESPONSE
```

The command registry remains the trusted execution layer. The AI layer can choose from registered actions, store memory, recall context, or respond briefly as a companion.
