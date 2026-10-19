from app.scoring import score_lead


def test_hot_outranks_cold():
    hot = score_lead(source="referral", company="BigCo", phone="1", email="a@b.c", value_minor=10_000_000)
    warm = score_lead(source="whatsapp", company="", phone="1", email="", value_minor=500_000)
    cold = score_lead(source="manual", company="", phone="", email="", value_minor=0)
    assert cold < warm < hot


def test_stays_in_bounds():
    lo = score_lead(source="manual", company="", phone="", email="", value_minor=0)
    hi = score_lead(source="referral", company="X", phone="1", email="a@b.c", value_minor=10**12)
    assert 1 <= lo <= 100
    assert 1 <= hi <= 100
