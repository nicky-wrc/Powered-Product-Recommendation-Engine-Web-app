"""Gift registry API — create, public slug, add items (with/without variants)."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app


def _register(client: TestClient) -> str:
    email = f"gr_{uuid.uuid4().hex[:12]}@example.com"
    r = client.post(
        "/api/auth/register",
        json={"name": "Gift Registry Test", "email": email, "password": "secret12"},
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _product_without_variants(client: TestClient) -> str | None:
    r = client.get("/api/products", params={"limit": 50})
    assert r.status_code == 200
    for p in r.json()["products"]:
        if not p.get("has_variants"):
            return p["id"]
    return None


def _product_with_variant_ids(client: TestClient) -> tuple[str, str] | None:
    r = client.get("/api/products", params={"limit": 50})
    assert r.status_code == 200
    for p in r.json()["products"]:
        if not p.get("has_variants"):
            continue
        d = client.get(f"/api/products/{p['id']}")
        if d.status_code != 200:
            continue
        variants = d.json().get("product", {}).get("variants") or []
        if variants:
            return p["id"], variants[0]["id"]
    return None


def test_gift_registry_create_unauthorized() -> None:
    with TestClient(app) as client:
        r = client.post("/api/gift-registries", json={"title": "No auth"})
    assert r.status_code == 401


def test_gift_registry_public_slug_and_add_item() -> None:
    with TestClient(app) as client:
        token = _register(client)
        headers = {"Authorization": f"Bearer {token}"}

        r = client.post("/api/gift-registries", headers=headers, json={"title": "Wedding list"})
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["title"] == "Wedding list"
        registry_id = body["id"]
        slug = body["slug"]
        assert slug

        r = client.get("/api/gift-registries/mine", headers=headers)
        assert r.status_code == 200
        registries = r.json()["registries"]
        assert any(x["id"] == registry_id for x in registries)

        r = client.get(f"/api/gift-registries/slug/{slug}")
        assert r.status_code == 200
        assert r.json()["title"] == "Wedding list"
        assert r.json()["items"] == []

        pid = _product_without_variants(client)
        if pid is None:
            pytest.skip("No catalog product without variants")

        r = client.post(
            f"/api/gift-registries/{registry_id}/items",
            headers=headers,
            json={"product_id": pid, "quantity_requested": 2},
        )
        assert r.status_code == 201, r.text
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["quantity_requested"] == 2
        assert items[0]["product_id"] == pid


def test_gift_registry_add_item_variant_required() -> None:
    with TestClient(app) as client:
        pair = _product_with_variant_ids(client)
        if pair is None:
            pytest.skip("No variant product in catalog")
        product_id, variant_id = pair

        token = _register(client)
        headers = {"Authorization": f"Bearer {token}"}

        r = client.post("/api/gift-registries", headers=headers, json={"title": "Variant list"})
        assert r.status_code == 201
        registry_id = r.json()["id"]

        r = client.post(
            f"/api/gift-registries/{registry_id}/items",
            headers=headers,
            json={"product_id": product_id, "quantity_requested": 1},
        )
        assert r.status_code == 400

        r = client.post(
            f"/api/gift-registries/{registry_id}/items",
            headers=headers,
            json={"product_id": product_id, "variant_id": variant_id, "quantity_requested": 1},
        )
        assert r.status_code == 201, r.text
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["variant_id"] == variant_id
