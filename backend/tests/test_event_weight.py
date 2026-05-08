from app.services.interaction_weights import interaction_weight


def test_interaction_weight_default():
    assert interaction_weight("purchase", None) == 5
    assert interaction_weight("view", {}) == 1


def test_interaction_weight_quantity_multiplies():
    assert interaction_weight("purchase", {"quantity": 2}) == 10
    assert interaction_weight("add_to_cart", {"quantity": 3}) == 9


def test_interaction_weight_quantity_clamped():
    assert interaction_weight("purchase", {"quantity": 0}) == 5
    assert interaction_weight("purchase", {"quantity": 100}) == 5 * 99
