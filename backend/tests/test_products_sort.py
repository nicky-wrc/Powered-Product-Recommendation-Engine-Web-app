"""Product list sort query parameter."""

from fastapi.testclient import TestClient

from app.main import app


def test_products_sort_price_asc_ordered():
    with TestClient(app) as client:
        r = client.get("/api/products", params={"limit": 100, "sort": "price_asc"})
    assert r.status_code == 200
    body = r.json()
    products = body["products"]
    if len(products) >= 2:
        prices = [p["price"] for p in products]
        assert prices == sorted(prices)


def test_products_invalid_sort_422():
    with TestClient(app) as client:
        r = client.get("/api/products", params={"sort": "not_a_sort"})
    assert r.status_code == 422
