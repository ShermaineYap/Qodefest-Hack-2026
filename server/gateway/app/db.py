import json
import sqlite3
from pathlib import Path

from app.models import AgentMessage, StoredMessage

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


def connect(db_path: str) -> sqlite3.Connection:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db(db_path: str) -> None:
    with connect(db_path) as conn:
        conn.executescript(SCHEMA)


def insert_message(
    db_path: str, message: AgentMessage, received_at: str
) -> StoredMessage:
    payload = message.model_dump_json()
    with connect(db_path) as conn:
        cur = conn.execute(
            "INSERT INTO messages (received_at, client, kind, text, url, payload)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (
                received_at,
                message.client,
                message.kind,
                message.text,
                message.url,
                payload,
            ),
        )
        return StoredMessage(id=cur.lastrowid, received_at=received_at)


def list_messages(db_path: str, limit: int) -> list[dict]:
    with connect(db_path) as conn:
        rows = conn.execute(
            "SELECT id, received_at, client, kind, text, url, payload"
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
            "payload": json.loads(row["payload"]),
        }
        for row in rows
    ]
