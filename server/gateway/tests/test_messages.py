import dataclasses

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.config import settings


@pytest.fixture
def client(tmp_path, monkeypatch):
    test_settings = dataclasses.replace(
        settings, db_path=str(tmp_path / "messages.db")
    )
    monkeypatch.setattr(main, "settings", test_settings)
    with TestClient(main.app) as c:
        yield c


def test_store_minimal_message(client):
    r = client.post("/agent/message", json={})
    assert r.status_code == 201
    body = r.json()
    assert body["id"] == 1
    assert body["received_at"]


def test_store_full_message_keeps_extras(client):
    r = client.post(
        "/agent/message",
        json={
            "v": 1,
            "client": "extension",
            "kind": "chat",
            "text": "hello",
            "url": "https://example.com",
            "ts": "2026-11-19T12:00:00Z",
            "extra": {"a": 1},
        },
    )
    assert r.status_code == 201
    row = client.get("/agent/messages").json()[0]
    assert row["client"] == "extension"
    assert row["kind"] == "chat"
    assert row["text"] == "hello"
    assert row["url"] == "https://example.com"
    assert row["payload"]["extra"] == {"a": 1}
    assert row["payload"]["ts"] == "2026-11-19T12:00:00Z"


def test_list_messages_newest_first(client):
    client.post("/agent/message", json={"text": "first"})
    client.post("/agent/message", json={"text": "second"})
    rows = client.get("/agent/messages").json()
    assert [row["text"] for row in rows] == ["second", "first"]


def test_list_respects_limit(client):
    for i in range(3):
        client.post("/agent/message", json={"text": f"m{i}"})
    rows = client.get("/agent/messages?limit=2").json()
    assert [row["text"] for row in rows] == ["m2", "m1"]


def test_limit_bounds_are_validated(client):
    assert client.get("/agent/messages?limit=0").status_code == 422
    assert client.get("/agent/messages?limit=101").status_code == 422


def test_text_length_is_validated(client):
    r = client.post("/agent/message", json={"text": "x" * 8001})
    assert r.status_code == 422
