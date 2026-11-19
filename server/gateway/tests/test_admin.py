import dataclasses
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import app.insights as insights
import app.main as main
from app.config import settings
from app.db import connect, init_db
from app.insights import QueryRejected, run_readonly, validate_sql

TOKEN = "test-admin-token"


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", TOKEN)
    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.setenv("QWEN_API_KEY", "")
    test_settings = dataclasses.replace(settings, db_path=str(tmp_path / "messages.db"))
    monkeypatch.setattr(main, "settings", test_settings)
    with TestClient(main.app) as client:
        yield client, test_settings.db_path


def ask(client, question, token=TOKEN, history=None):
    return client.post(
        "/agent/admin/chat",
        json={"question": question, "history": history or []},
        headers={"X-Admin-Token": token},
    )


def seed(db_path, rows):
    init_db(db_path)
    with connect(db_path) as conn:
        for received_at, status, scam_status, text in rows:
            conn.execute(
                "INSERT INTO messages (received_at, client, kind, text, payload, status, scam_status)"
                " VALUES (?, 'extension', 'chat', ?, '{}', ?, ?)",
                (received_at, text, status, scam_status),
            )


def now_minus(days=0):
    stamp = datetime.now(timezone.utc) - timedelta(days=days)
    return stamp.isoformat(timespec="seconds")


def test_disabled_without_admin_token(app_client, monkeypatch):
    client, _ = app_client
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    response = ask(client, "what happened today?")
    assert response.status_code == 503
    assert response.json() == {"detail": "admin_disabled"}


def test_rejects_missing_and_wrong_token(app_client):
    client, _ = app_client
    assert ask(client, "what happened today?", token="").status_code == 401
    assert ask(client, "what happened today?", token="nope").status_code == 401


def test_summary_counts_today(app_client):
    client, db_path = app_client
    seed(
        db_path,
        [
            (now_minus(), "scam", "known_scam", "send the otp"),
            (now_minus(), "scam", "new_scam", "your parcel is blocked"),
            (now_minus(), "not_scam", "", "hi mum"),
        ],
    )
    response = ask(client, "What happened today?")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "summary"
    assert body["note"]
    assert body["row_count"] == 2
    assert {row["status"]: row["count"] for row in body["rows"]} == {
        "scam": 2,
        "not_scam": 1,
    }
    assert "3 messages checked" in body["answer"]
    assert "1 new scam" in body["answer"]
    assert "1 repeat" in body["answer"]
    assert body["sql"].startswith("SELECT")
    assert body["took_ms"] >= 0


def test_summary_yesterday_is_empty(app_client):
    client, db_path = app_client
    seed(db_path, [(now_minus(), "scam", "new_scam", "today only")])
    response = ask(client, "what happened yesterday?")
    body = response.json()
    assert body["row_count"] == 0
    assert "no messages were checked" in body["answer"]


def test_summary_window_all_time(app_client):
    client, db_path = app_client
    seed(
        db_path,
        [
            (now_minus(), "scam", "new_scam", "today"),
            (now_minus(10), "unsure", "", "ten days ago"),
        ],
    )
    body = ask(client, "how many messages in total?").json()
    counts = {row["status"]: row["count"] for row in body["rows"]}
    assert counts == {"scam": 1, "unsure": 1}


def test_model_path_runs_sql_and_explains(app_client, monkeypatch):
    client, db_path = app_client
    seed(db_path, [(now_minus(), "scam", "new_scam", "send the otp")])

    async def fake_sql(question, history):
        return "SELECT COUNT(*) AS scams FROM messages WHERE status = 'scam'"

    async def fake_explain(question, sql, columns, rows):
        return "There is one scam today."

    monkeypatch.setattr(insights, "_api_key", lambda: "test-key")
    monkeypatch.setattr(insights, "question_to_sql", fake_sql)
    monkeypatch.setattr(insights, "explain", fake_explain)
    body = ask(client, "how many scams today?").json()
    assert body["source"] == "model"
    assert body["answer"] == "There is one scam today."
    assert body["columns"] == ["scams"]
    assert body["rows"] == [{"scams": 1}]


def test_model_rejected_query_falls_back_to_summary(app_client, monkeypatch):
    client, db_path = app_client
    seed(db_path, [(now_minus(), "scam", "new_scam", "send the otp")])

    async def bad_sql(question, history):
        raise QueryRejected("only SELECT queries are allowed")

    monkeypatch.setattr(insights, "_api_key", lambda: "test-key")
    monkeypatch.setattr(insights, "question_to_sql", bad_sql)
    body = ask(client, "what happened today?").json()
    assert body["source"] == "summary"
    assert "rejected" in body["note"]
    assert body["row_count"] == 1


def test_question_is_required_and_bounded(app_client):
    client, _ = app_client
    assert ask(client, " ").status_code == 422
    assert ask(client, "x" * 501).status_code == 422


@pytest.mark.parametrize(
    "sql",
    [
        "DROP TABLE messages",
        "DELETE FROM messages",
        "SELECT 1; SELECT 2",
        "PRAGMA table_info(messages)",
        "ATTACH DATABASE '/tmp/x.db' AS x",
        "UPDATE messages SET status = 'not_scam'",
        "CREATE TABLE x (id INTEGER)",
        "select * from sqlite_master",
        "select * from sqlite_sequence",
    ],
)
def test_guardrails_reject_unsafe_queries(app_client, sql):
    _, db_path = app_client
    with pytest.raises(QueryRejected):
        run_readonly(db_path, sql)


def test_guardrails_allow_cte_and_cap_rows(app_client):
    _, db_path = app_client
    seed(db_path, [(now_minus(), "not_scam", "", f"row {i}") for i in range(250)])
    columns, rows, truncated = run_readonly(
        db_path,
        "WITH t AS (SELECT id FROM messages) SELECT COUNT(*) AS n FROM t",
    )
    assert columns == ["n"]
    assert rows == [{"n": 250}]

    columns, rows, truncated = run_readonly(db_path, "SELECT id, status FROM messages ORDER BY id")
    assert len(rows) == 200
    assert truncated is True
    assert columns == ["id", "status"]


def test_validate_sql_strips_fences_and_trailing_semicolon():
    assert (
        validate_sql("```sql\nSELECT COUNT(*) FROM messages;\n```")
        == "SELECT COUNT(*) FROM messages"
    )
    with pytest.raises(QueryRejected):
        validate_sql("SELECT 1 UNION SELECT 2; DROP TABLE messages")


def test_database_is_opened_read_only(app_client):
    _, db_path = app_client
    with pytest.raises(QueryRejected):
        run_readonly(db_path, "SELECT load_extension('x')")


def test_sqlite_authorizer_blocks_other_tables(tmp_path):
    conn = sqlite3.connect(tmp_path / "other.db")
    conn.execute("CREATE TABLE secrets (value TEXT)")
    conn.close()
    with pytest.raises(QueryRejected):
        run_readonly(str(tmp_path / "other.db"), "SELECT value FROM secrets")
