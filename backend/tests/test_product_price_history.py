"""Product price history API."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def test_product_price_history_unknown_product_404():
    with TestClient(app) as client:
        r = client.get(f"/api/products/{uuid4()}/price-history")
    assert r.status_code == 404


def test_product_price_history_days_validation():
    with TestClient(app) as client:
        r = client.get(f"/api/products/{uuid4()}/price-history", params={"days": 0})
    assert r.status_code == 422
