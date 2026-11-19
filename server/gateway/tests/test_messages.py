import dataclasses

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.agent import AgentUnavailable, _parse_reply
from app.config import settings

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


def test_list_returns_analysis(client):
    post(client, text="hello")
    row = client.get("/agent/messages?limit=5").json()[0]
    assert row["status"] == "not_scam"
    assert row["reply"]
    assert row["model"] == "mock"


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
