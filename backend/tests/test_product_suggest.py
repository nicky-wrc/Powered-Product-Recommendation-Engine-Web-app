"""Product search autocomplete API."""

from fastapi.testclient import TestClient

from app.main import app


def test_suggest_empty_query():
    with TestClient(app) as client:
        r = client.get("/api/products/suggest")
    assert r.status_code == 200
    assert r.json() == []


def test_suggest_returns_matches():
    with TestClient(app) as client:
        r = client.get("/api/products/suggest", params={"q": "a", "limit": 5})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    if len(data) > 0:
        row = data[0]
        assert "id" in row and "name" in row
        assert "category" in row
