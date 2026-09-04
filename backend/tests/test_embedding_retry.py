"""Rate-limit handling and resumability.

Both were real failures, not hypotheticals: an hour-long run reached 96 of 258
chunks, was refused with a 429, and lost all 96 because nothing retried and
nothing had been written yet.
"""
import httpx
import pytest

import app.engines.embeddings as embeddings


class FakeResponse:
    def __init__(self, status_code, payload=None, headers=None):
        self.status_code = status_code
        self._payload = payload or {}
        self.headers = headers or {}
        self.request = httpx.Request("POST", "https://example.test")

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                f"HTTP {self.status_code}", request=self.request, response=self
            )


def ok_payload(n):
    return {"embeddings": [{"values": [1.0, 0.0, 0.0]} for _ in range(n)]}


@pytest.fixture(autouse=True)
def no_sleeping(monkeypatch):
    monkeypatch.setattr(embeddings.time, "sleep", lambda _s: None)


@pytest.fixture(autouse=True)
def a_key(monkeypatch):
    settings = embeddings.get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", "test-key", raising=False)


def test_a_rate_limit_is_retried_not_fatal(monkeypatch):
    calls = {"n": 0}

    def fake_post(*_args, **_kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return FakeResponse(429)
        return FakeResponse(200, ok_payload(2))

    monkeypatch.setattr(embeddings.httpx, "post", fake_post)
    vectors = embeddings.embed_texts(["a", "b"])
    assert len(vectors) == 2
    assert calls["n"] == 2


def test_a_transient_server_error_is_retried(monkeypatch):
    calls = {"n": 0}

    def fake_post(*_args, **_kwargs):
        calls["n"] += 1
        return FakeResponse(503) if calls["n"] < 3 else FakeResponse(200, ok_payload(1))

    monkeypatch.setattr(embeddings.httpx, "post", fake_post)
    assert len(embeddings.embed_texts(["a"])) == 1
    assert calls["n"] == 3


def test_it_gives_up_eventually_rather_than_looping(monkeypatch):
    calls = {"n": 0}

    def fake_post(*_args, **_kwargs):
        calls["n"] += 1
        return FakeResponse(429)

    monkeypatch.setattr(embeddings.httpx, "post", fake_post)
    with pytest.raises(httpx.HTTPStatusError):
        embeddings.embed_texts(["a"])
    assert calls["n"] == embeddings.EMBED_ATTEMPTS


def test_a_client_error_is_not_retried(monkeypatch):
    """A bad key or malformed request will not fix itself; fail fast."""
    calls = {"n": 0}

    def fake_post(*_args, **_kwargs):
        calls["n"] += 1
        return FakeResponse(400)

    monkeypatch.setattr(embeddings.httpx, "post", fake_post)
    with pytest.raises(httpx.HTTPStatusError):
        embeddings.embed_texts(["a"])
    assert calls["n"] == 1


def test_retry_after_is_honoured(monkeypatch):
    waits = []
    monkeypatch.setattr(embeddings.time, "sleep", lambda s: waits.append(s))
    calls = {"n": 0}

    def fake_post(*_args, **_kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return FakeResponse(429, headers={"retry-after": "90"})
        return FakeResponse(200, ok_payload(1))

    monkeypatch.setattr(embeddings.httpx, "post", fake_post)
    embeddings.embed_texts(["a"])
    assert waits == [90]


def test_an_empty_batch_costs_nothing(monkeypatch):
    def explode(*_args, **_kwargs):
        raise AssertionError("should not call the API for an empty batch")

    monkeypatch.setattr(embeddings.httpx, "post", explode)
    assert embeddings.embed_texts([]) == []


def test_returned_vectors_are_unit_length(monkeypatch):
    monkeypatch.setattr(
        embeddings.httpx,
        "post",
        lambda *a, **k: FakeResponse(200, {"embeddings": [{"values": [3.0, 4.0]}]}),
    )
    vector = embeddings.embed_texts(["a"])[0]
    assert sum(v * v for v in vector) == pytest.approx(1.0)
