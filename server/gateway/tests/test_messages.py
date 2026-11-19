import dataclasses

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.agent import AgentUnavailable, _parse_reply
from app.config import settings
from app.models import Analysis

PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.setenv("QWEN_API_KEY", "")
    test_settings = dataclasses.replace(
        settings, db_path=str(tmp_path / "messages.db")
    )
    monkeypatch.setattr(main, "settings", test_settings)
    with TestClient(main.app) as c:
        yield c


def post(http, **body):
    return http.post("/agent/message", json=body)


def test_stores_and_replies(client):
    r = post(client, v=1, client="extension", text="hello there")
    assert r.status_code == 201
    body = r.json()
    assert body["id"] == 1
    assert body["received_at"]
    assert body["status"] == "not_scam"
    assert body["reply"]
    assert body["model"] == "mock"
    assert isinstance(body["reasons"], list)


def test_scam_signals_raise_status(client):
    r = post(
        client,
        text="Your account is blocked. Send the OTP and click this link to pay now.",
    )
    assert r.json()["status"] == "scam"


def test_single_signal_is_unsure(client):
    r = post(client, text="please verify your parcel fee")
    assert r.json()["status"] == "unsure"


def test_sensitive_ask_is_scam(client):
    r = post(client, text="Your account is blocked. Send the OTP now.")
    body = r.json()
    assert body["status"] == "scam"
    assert body["reasons"]


def test_image_only_is_unsure(client):
    r = post(client, image=PNG)
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "unsure"
    row = client.get("/agent/messages").json()[0]
    assert row["payload"]["image"]["mime"] == "image/png"
    assert "image" not in row["payload"] or row["payload"]["image"] != PNG


def test_non_image_data_url_is_rejected(client):
    r = post(client, image="data:text/html;base64,PGgxPmhpPC9oMT4=")
    assert r.status_code == 422


def test_model_failure_is_503(client, monkeypatch):
    async def boom(message):
        raise AgentUnavailable("down")

    monkeypatch.setattr(main, "analyze", boom)
    r = post(client, text="hi")
    assert r.status_code == 503
    assert r.json() == {"detail": "agent_unavailable"}


def test_first_scam_is_new(client):
    body = post(client, text="Your account is blocked. Send the OTP now.").json()
    assert body["status"] == "scam"
    assert body["scam_status"] == "new_scam"
    assert "new scam" in body["scam_note"]
    assert body["first_seen_id"] is None
    assert body["first_seen_at"] is None


def test_repeated_scam_is_known(client):
    first = post(client, text="Your account is blocked. Send the OTP now.").json()
    second = post(client, text="  your ACCOUNT is blocked.   send the otp now. ").json()
    assert second["status"] == "scam"
    assert second["scam_status"] == "known_scam"
    assert second["first_seen_id"] == first["id"]
    assert second["first_seen_at"] == first["received_at"]
    assert first["received_at"] in second["scam_note"]


def test_repeat_scam_survives_a_weaker_model_answer(client, monkeypatch):
    first = post(client, text="Your account is blocked. Send the OTP now.").json()

    async def unsure(_message):
        return Analysis(status="unsure", reply="Not enough evidence.", model="stub")

    monkeypatch.setattr(main, "analyze", unsure)
    second = post(client, text="Your account is blocked. Send the OTP now.").json()
    assert second["status"] == "scam"
    assert second["scam_status"] == "known_scam"
    assert second["reply"] != "Not enough evidence."
    assert second["first_seen_id"] == first["id"]


def test_not_scam_has_no_scam_status(client):
    body = post(client, text="hello there").json()
    assert body["status"] == "not_scam"
    assert body["scam_status"] is None
    assert body["scam_note"] == ""


def test_url_only_messages_dedupe_by_url(client):
    url = "https://example.com/claim-prize-otp"
    first = post(client, url=url).json()
    second = post(client, url=url.upper()).json()
    assert first["status"] == "scam"
    assert first["scam_status"] == "new_scam"
    assert second["scam_status"] == "known_scam"
    assert second["first_seen_id"] == first["id"]


def test_list_returns_analysis(client):
    post(client, text="hello")
    row = client.get("/agent/messages?limit=5").json()[0]
    assert row["status"] == "not_scam"
    assert row["reply"]
    assert row["model"] == "mock"
    assert row["scam_status"] is None


def test_list_returns_scam_novelty(client):
    first = post(client, text="Your account is blocked. Send the OTP now.").json()
    post(client, text="Your account is blocked. Send the OTP now.")
    row = client.get("/agent/messages?limit=5").json()[0]
    assert row["status"] == "scam"
    assert row["scam_status"] == "known_scam"
    assert row["first_seen_id"] == first["id"]
    assert row["first_seen_at"] == first["received_at"]


def test_init_db_migrates_and_backfills_old_rows(tmp_path):
    from app import db

    path = str(tmp_path / "legacy.db")
    with db.connect(path) as conn:
        conn.execute(
            "CREATE TABLE messages ("
            " id INTEGER PRIMARY KEY AUTOINCREMENT,"
            " received_at TEXT NOT NULL,"
            " client TEXT NOT NULL DEFAULT '',"
            " kind TEXT NOT NULL DEFAULT '',"
            " text TEXT NOT NULL DEFAULT '',"
            " url TEXT NOT NULL DEFAULT '',"
            " payload TEXT NOT NULL,"
            " status TEXT NOT NULL DEFAULT '',"
            " reply TEXT NOT NULL DEFAULT '',"
            " reasons TEXT NOT NULL DEFAULT '[]',"
            " model TEXT NOT NULL DEFAULT '')"
        )
        conn.execute(
            "INSERT INTO messages (received_at, text, payload, status)"
            " VALUES ('2026-11-19T05:44:53+00:00', 'Send the OTP now', '{}', 'scam')"
        )

    db.init_db(path)

    with db.connect(path) as conn:
        row = conn.execute("SELECT fingerprint, scam_status FROM messages").fetchone()
    assert row["fingerprint"] == db.fingerprint("Send the OTP now", "")
    assert row["scam_status"] == ""


def test_parse_reply_accepts_json_and_fences():
    analysis = _parse_reply('```json\n{"status":"scam","reply":"Go back.","reasons":["otp"]}\n```')
    assert analysis.status == "scam"
    assert analysis.reply == "Go back."
    assert analysis.reasons == ["otp"]


def test_parse_reply_rejects_garbage():
    with pytest.raises(AgentUnavailable):
        _parse_reply("not json")
    with pytest.raises(AgentUnavailable):
        _parse_reply('{"status":"maybe","reply":"x"}')
