from app.scoring import tier_for


def test_tier_boundaries() -> None:
    assert tier_for(0) == "LOW"
    assert tier_for(44) == "LOW"
    assert tier_for(45) == "MEDIUM"
    assert tier_for(79) == "MEDIUM"
    assert tier_for(80) == "HIGH"
    assert tier_for(100) == "HIGH"
