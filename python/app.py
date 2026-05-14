from __future__ import annotations

import json
import sqlite3
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"
DB_PATH = DATA_DIR / "nexis_memory.db"


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
            self._send_json({"status": "ok", "service": "nexis-core"})
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

        self._send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def log_message(self, format: str, *args: Any) -> None:
        return


def main() -> None:
    ensure_database()
    server = ThreadingHTTPServer(("127.0.0.1", 8765), NexisHandler)
    print("NEXIS Python core online at http://127.0.0.1:8765")
    server.serve_forever()


if __name__ == "__main__":
    main()
