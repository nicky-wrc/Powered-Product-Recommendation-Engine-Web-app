"""Shared event weights for tracking and order checkout."""

_EVENT_WEIGHT: dict[str, int] = {
    "view": 1,
    "click": 2,
    "add_to_cart": 3,
    "purchase": 5,
    "search": 1,
}


def interaction_weight(event_type: str, metadata: dict | None) -> int:
    base = _EVENT_WEIGHT[event_type]
    if not metadata:
        return base
    raw = metadata.get("quantity")
    if isinstance(raw, int):
        q = max(1, min(raw, 99))
        return base * q
    return base
