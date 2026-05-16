from __future__ import annotations

import json
import os
import sqlite3
import sys
import tempfile
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"
DB_PATH = DATA_DIR / "nexis_memory.db"
WHISPER_MODEL = None
WHISPER_LOAD_ERROR: str | None = None
WHISPER_LOADING = False


def ensure_database() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                summary TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()
    finally:
        connection.close()


def list_memories() -> list[dict[str, Any]]:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            "SELECT id, category, content, metadata, created_at FROM memories ORDER BY created_at DESC LIMIT 25"
        ).fetchall()
        return [
            {
                "id": row["id"],
                "category": row["category"],
                "content": row["content"],
                "metadata": json.loads(row["metadata"]),
                "created_at": row["created_at"],
            }
            for row in rows
        ]
    finally:
        connection.close()


def create_memory(payload: dict[str, Any]) -> dict[str, Any]:
    connection = sqlite3.connect(DB_PATH)
    try:
        cursor = connection.execute(
            "INSERT INTO memories (category, content, metadata) VALUES (?, ?, ?)",
            (
                payload["category"],
                payload["content"],
                json.dumps(payload.get("metadata", {})),
            ),
        )
        connection.commit()
        return {"id": cursor.lastrowid, "stored": True}
    finally:
        connection.close()


def run_command(text: str) -> dict[str, Any]:
    normalized = text.strip().lower()

    if normalized == "open chrome":
        return {"ok": True, "response": "Launching Chrome."}

    if normalized.startswith("remember "):
        return {"ok": True, "response": "Stored."}

    return {"ok": False, "response": "Command not recognized yet."}


def _load_whisper_background() -> None:
    """Load the Whisper model in a background thread at startup."""
    global WHISPER_MODEL, WHISPER_LOAD_ERROR, WHISPER_LOADING
    WHISPER_LOADING = True

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        WHISPER_LOAD_ERROR = (
            "faster-whisper not installed. Run: pip install -r python/requirements.txt"
        )
        print(f"[speech] FATAL: {WHISPER_LOAD_ERROR}", flush=True)
        WHISPER_LOADING = False
        return

    model_size = os.getenv("NEXIS_WHISPER_MODEL", "base.en")
    device = os.getenv("NEXIS_WHISPER_DEVICE", "cpu")
    compute_type = os.getenv("NEXIS_WHISPER_COMPUTE_TYPE", "int8")

    print(
        f"[speech] pre-loading Whisper model '{model_size}' on {device}/{compute_type} ...",
        flush=True,
    )
    t0 = time.monotonic()
    try:
        WHISPER_MODEL = WhisperModel(model_size, device=device, compute_type=compute_type)
        elapsed = time.monotonic() - t0
        print(f"[speech] Whisper model ready in {elapsed:.1f}s", flush=True)
    except Exception as exc:  # noqa: BLE001
        WHISPER_LOAD_ERROR = str(exc)
        print(f"[speech] model load failed: {exc}", flush=True)
    finally:
        WHISPER_LOADING = False


def get_whisper_model() -> Any:
    if WHISPER_LOAD_ERROR:
        raise RuntimeError(f"Whisper model failed to load: {WHISPER_LOAD_ERROR}")
    if WHISPER_MODEL is None:
        raise RuntimeError(
            "Whisper model is still loading — please retry in a moment"
        )
    return WHISPER_MODEL


def suffix_for_mime(mime_type: str) -> str:
    if "wav" in mime_type:
        return ".wav"
    if "mp4" in mime_type or "m4a" in mime_type:
        return ".m4a"
    if "ogg" in mime_type:
        return ".ogg"
    return ".webm"


def transcribe_audio(payload: dict[str, Any]) -> dict[str, Any]:
    audio_bytes = payload.get("audioBytes") or payload.get("audio_bytes")
    if not isinstance(audio_bytes, list) or not audio_bytes:
        return {"ok": False, "error": "Missing audioBytes"}

    mime_type = str(payload.get("mimeType") or payload.get("mime_type") or "audio/webm")
    audio_data = bytes(max(0, min(255, int(value))) for value in audio_bytes)

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix_for_mime(mime_type)) as temp_file:
        temp_file.write(audio_data)
        temp_path = temp_file.name

    try:
        model = get_whisper_model()
        segments, info = model.transcribe(
            temp_path,
            beam_size=5,
            best_of=5,
            condition_on_previous_text=False,
            language="en",
            vad_filter=True,
            vad_parameters={
                "min_silence_duration_ms": 500,
                "speech_pad_ms": 250,
            },
        )
        segment_list = list(segments)
        text = " ".join(segment.text.strip() for segment in segment_list).strip()
        avg_logprob_values = [
            segment.avg_logprob for segment in segment_list if isinstance(segment.avg_logprob, float)
        ]
        no_speech_values = [
            segment.no_speech_prob for segment in segment_list if isinstance(segment.no_speech_prob, float)
        ]

        def average(values: list[float]) -> float | None:
            return sum(values) / len(values) if values else None

        return {
            "ok": True,
            "provider": "faster-whisper",
            "text": text,
            "language": getattr(info, "language", "en"),
            "duration": getattr(info, "duration", None),
            "avgLogprob": average(avg_logprob_values),
            "noSpeechProb": average(no_speech_values),
        }
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


class NexisHandler(BaseHTTPRequestHandler):
    server_version = "NEXISCore/0.1"

    def _send_json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict[str, Any]:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length) if content_length else b"{}"
        return json.loads(raw_body.decode("utf-8") or "{}")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send_json({}, HTTPStatus.NO_CONTENT)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            whisper_status = "loading" if WHISPER_LOADING else ("error" if WHISPER_LOAD_ERROR else ("ready" if WHISPER_MODEL is not None else "not-started"))
            self._send_json({
                "status": "ok",
                "service": "nexis-core",
                "whisper": whisper_status,
                "whisper_error": WHISPER_LOAD_ERROR,
            })
            return

        if self.path == "/memory":
            self._send_json(list_memories())
            return

        self._send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802
        if self.path == "/memory":
            payload = self._read_json()
            if "category" not in payload or "content" not in payload:
                self._send_json({"error": "Missing category or content"}, HTTPStatus.BAD_REQUEST)
                return

            self._send_json(create_memory(payload), HTTPStatus.CREATED)
            return

        if self.path == "/command":
            payload = self._read_json()
            self._send_json(run_command(payload.get("text", "")))
            return

        if self.path == "/transcribe":
            payload = self._read_json()
            try:
                result = transcribe_audio(payload)
                status = HTTPStatus.OK if result.get("ok") else HTTPStatus.BAD_REQUEST
                self._send_json(result, status)
            except Exception as error:  # noqa: BLE001
                self._send_json(
                    {"ok": False, "error": str(error), "provider": "faster-whisper"},
                    HTTPStatus.SERVICE_UNAVAILABLE,
                )
            return

        self._send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def log_message(self, format: str, *args: Any) -> None:
        return


def main() -> None:
    # Suppress the unauthenticated HF Hub warning by ensuring HF_TOKEN flows through.
    # If not set, at least silence the stderr noise — it's non-fatal.
    if not os.getenv("HF_TOKEN") and not os.getenv("HUGGING_FACE_HUB_TOKEN"):
        os.environ["HUGGINGFACE_HUB_VERBOSITY"] = "error"

    print(f"[python] Python {sys.version.split()[0]} — pid {os.getpid()}", flush=True)
    ensure_database()

    # Start Whisper model loading in the background BEFORE the server starts serving.
    # This way /health responds immediately and the model is warm by the time
    # the first /transcribe request arrives.
    loader = threading.Thread(target=_load_whisper_background, daemon=True, name="whisper-loader")
    loader.start()

    server = ThreadingHTTPServer(("127.0.0.1", 8765), NexisHandler)
    print("NEXIS Python core online at http://127.0.0.1:8765", flush=True)
    print("[python] /health endpoint ready — Whisper model loading in background.", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
