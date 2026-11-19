import hashlib
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
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '',
    reply TEXT NOT NULL DEFAULT '',
    reasons TEXT NOT NULL DEFAULT '[]',
    model TEXT NOT NULL DEFAULT '',
    fingerprint TEXT NOT NULL DEFAULT '',
    scam_status TEXT NOT NULL DEFAULT '',
    scam_note TEXT NOT NULL DEFAULT '',
    first_seen_id INTEGER,
    first_seen_at TEXT NOT NULL DEFAULT ''
);
"""

INDEXES = """
CREATE INDEX IF NOT EXISTS idx_messages_fingerprint
    ON messages (fingerprint, status);
"""

MESSAGE_COLUMNS = (
    ("status", "TEXT NOT NULL DEFAULT ''"),
    ("reply", "TEXT NOT NULL DEFAULT ''"),
    ("reasons", "TEXT NOT NULL DEFAULT '[]'"),
    ("model", "TEXT NOT NULL DEFAULT ''"),
    ("fingerprint", "TEXT NOT NULL DEFAULT ''"),
    ("scam_status", "TEXT NOT NULL DEFAULT ''"),
    ("scam_note", "TEXT NOT NULL DEFAULT ''"),
    ("first_seen_id", "INTEGER"),
    ("first_seen_at", "TEXT NOT NULL DEFAULT ''"),
)

NEW_SCAM_NOTE = "This is a new scam: we have not recorded this message before."
KNOWN_SCAM_NOTE = "This is a known scam: we first recorded it on {first_seen}."
KNOWN_SCAM_REPLY = (
    "This is a known scam we have seen before. Don't reply, don't click any links, "
    "and don't share passwords, OTPs or bank details."
)
KNOWN_SCAM_REASON = "matches a message already confirmed as a scam"


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
        for name, declaration in MESSAGE_COLUMNS:
            if name not in existing:
                conn.execute(f"ALTER TABLE messages ADD COLUMN {name} {declaration}")
        conn.executescript(INDEXES)
        # Rows stored before fingerprinting existed still need to match new repeats.
        for row in conn.execute("SELECT id, text, url FROM messages WHERE fingerprint = ''"):
            fp = fingerprint(row["text"], row["url"])
            if fp:
                conn.execute("UPDATE messages SET fingerprint = ? WHERE id = ?", (fp, row["id"]))


def fingerprint(text: str, url: str) -> str:
    normalized = " ".join(text.casefold().split())
    if not normalized:
        normalized = url.strip().casefold()
    if not normalized:
        return ""
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def insert_message(
    db_path: str, message: AgentMessage, analysis: Analysis, received_at: str
) -> StoredMessage:
    payload = message.model_dump(exclude={"image"})
    if message.image:
        payload["image"] = {"mime": message.image.split(";")[0][5:], "chars": len(message.image)}
    fp = fingerprint(message.text, message.url)

    with connect(db_path) as conn:
        first_seen = None
        if fp:
            first_seen = conn.execute(
                "SELECT id, received_at FROM messages"
                " WHERE fingerprint = ? AND status = 'scam'"
                " ORDER BY id LIMIT 1",
                (fp,),
            ).fetchone()

        status = analysis.status
        reply = analysis.reply
        reasons = analysis.reasons
        if first_seen:
            # An exact repeat of a stored scam stays a scam even if the model is unsure today.
            scam_status = "known_scam"
            first_seen_id = first_seen["id"]
            first_seen_at = first_seen["received_at"]
            scam_note = KNOWN_SCAM_NOTE.format(first_seen=first_seen_at)
            if status != "scam":
                status = "scam"
                reply = KNOWN_SCAM_REPLY
                reasons = [KNOWN_SCAM_REASON]
        elif status == "scam":
            scam_status = "new_scam"
            first_seen_id = None
            first_seen_at = None
            scam_note = NEW_SCAM_NOTE
        else:
            scam_status = None
            first_seen_id = None
            first_seen_at = None
            scam_note = ""

        cur = conn.execute(
            "INSERT INTO messages"
            " (received_at, client, kind, text, url, payload, status, reply, reasons, model,"
            " fingerprint, scam_status, scam_note, first_seen_id, first_seen_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                received_at,
                message.client,
                message.kind,
                message.text,
                message.url,
                json.dumps(payload),
                status,
                reply,
                json.dumps(reasons),
                analysis.model,
                fp,
                scam_status or "",
                scam_note,
                first_seen_id,
                first_seen_at or "",
            ),
        )
        return StoredMessage(
            id=cur.lastrowid,
            received_at=received_at,
            status=status,
            reply=reply,
            reasons=reasons,
            model=analysis.model,
            scam_status=scam_status,
            scam_note=scam_note,
            first_seen_id=first_seen_id,
            first_seen_at=first_seen_at,
        )


def list_messages(db_path: str, limit: int) -> list[dict]:
    with connect(db_path) as conn:
        rows = conn.execute(
            "SELECT id, received_at, client, kind, text, url, payload, status, reply, reasons,"
            " model, scam_status, scam_note, first_seen_id, first_seen_at"
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
            "scam_status": row["scam_status"] or None,
            "scam_note": row["scam_note"],
            "first_seen_id": row["first_seen_id"],
            "first_seen_at": row["first_seen_at"] or None,
            "payload": json.loads(row["payload"]),
        }
        for row in rows
    ]
