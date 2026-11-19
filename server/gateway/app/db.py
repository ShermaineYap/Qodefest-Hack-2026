import json
import sqlite3
from pathlib import Path

from app.models import AgentMessage, Analysis, StoredMessage

SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at TEXT NOT NULL,
    client TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    payload TEXT NOT NULL
);
"""

ANALYSIS_COLUMNS = (
    ("status", "TEXT NOT NULL DEFAULT ''"),
    ("reply", "TEXT NOT NULL DEFAULT ''"),
    ("reasons", "TEXT NOT NULL DEFAULT '[]'"),
    ("model", "TEXT NOT NULL DEFAULT ''"),
)


def connect(db_path: str) -> sqlite3.Connection:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db(db_path: str) -> None:
    with connect(db_path) as conn:
        conn.executescript(SCHEMA)
        existing = {row[1] for row in conn.execute("PRAGMA table_info(messages)")}
        for name, declaration in ANALYSIS_COLUMNS:
            if name not in existing:
                conn.execute(f"ALTER TABLE messages ADD COLUMN {name} {declaration}")


def insert_message(
    db_path: str, message: AgentMessage, analysis: Analysis, received_at: str
) -> StoredMessage:
    payload = message.model_dump(exclude={"image"})
    if message.image:
        payload["image"] = {"mime": message.image.split(";")[0][5:], "chars": len(message.image)}
    with connect(db_path) as conn:
        cur = conn.execute(
            "INSERT INTO messages"
            " (received_at, client, kind, text, url, payload, status, reply, reasons, model)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                received_at,
                message.client,
                message.kind,
                message.text,
                message.url,
                json.dumps(payload),
                analysis.status,
                analysis.reply,
                json.dumps(analysis.reasons),
                analysis.model,
            ),
        )
        return StoredMessage(
            id=cur.lastrowid,
            received_at=received_at,
            status=analysis.status,
            reply=analysis.reply,
            reasons=analysis.reasons,
            model=analysis.model,
        )


def list_messages(db_path: str, limit: int) -> list[dict]:
    with connect(db_path) as conn:
        rows = conn.execute(
            "SELECT id, received_at, client, kind, text, url, payload, status, reply, reasons, model"
            " FROM messages ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "received_at": row["received_at"],
            "client": row["client"],
            "kind": row["kind"],
            "text": row["text"],
            "url": row["url"],
            "status": row["status"] or None,
            "reply": row["reply"],
            "reasons": json.loads(row["reasons"] or "[]"),
            "model": row["model"],
            "payload": json.loads(row["payload"]),
        }
        for row in rows
    ]
