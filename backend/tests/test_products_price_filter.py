"""Product list price range filters."""

from fastapi.testclient import TestClient

from app.main import app


def test_products_min_max_price_filters():
    with TestClient(app) as client:
        r = client.get("/api/products", params={"min_price": 5, "max_price": 500, "limit": 50})
    assert r.status_code == 200
    for p in r.json()["products"]:
        assert 5 <= p["price"] <= 500


def test_products_min_gt_max_422():
    with TestClient(app) as client:
        r = client.get("/api/products", params={"min_price": 100, "max_price": 10})
    assert r.status_code == 422
