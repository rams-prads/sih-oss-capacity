"""Calibration, predictive validation, and the endpoints that expose them."""
import random

import pytest

from app.engines.calibration import MIN_RESPONSES_TO_CALIBRATE, calibrate_items
from app.engines.irt import b_to_authored_difficulty, probability_correct
from app.engines.psychometrics import response_corpus, topic_abilities
from app.engines.validation import auc, cross_validate, expected_calibration_error, score


def synthetic_corpus(n_officers=90, n_items=25, seed=42):
    """A bank with known truth, so calibration can be checked against it."""
    rng = random.Random(seed)
    truth = {i: (rng.uniform(-2, 2), rng.uniform(0.6, 2.2)) for i in range(n_items)}
    authored = {
        i: b_to_authored_difficulty(b + rng.gauss(0, 0.8)) for i, (b, _a) in truth.items()
    }
    responses = []
    for u in range(n_officers):
        theta = rng.gauss(0, 1)
        for i, (b, a) in truth.items():
            responses.append((f"u{u}", i, rng.random() < probability_correct(theta, b, a, 0.25)))
    return truth, authored, responses


class TestMetrics:
    def test_auc_of_a_perfect_ranking_is_one(self):
        assert auc([0.1, 0.2, 0.8, 0.9], [False, False, True, True]) == 1.0

    def test_auc_of_a_reversed_ranking_is_zero(self):
        assert auc([0.9, 0.8, 0.2, 0.1], [False, False, True, True]) == 0.0

    def test_auc_of_constant_predictions_is_a_coin_flip(self):
        assert auc([0.5] * 4, [True, False, True, False]) == 0.5

    def test_auc_is_undefined_with_one_class(self):
        import math

        assert math.isnan(auc([0.5, 0.6], [True, True]))

    def test_perfect_calibration_scores_zero_error(self):
        probs = [0.5] * 100
        outcomes = [i % 2 == 0 for i in range(100)]
        assert expected_calibration_error(probs, outcomes) == pytest.approx(0.0, abs=0.01)

    def test_overconfidence_is_penalised(self):
        probs = [0.99] * 100
        outcomes = [i % 2 == 0 for i in range(100)]
        assert expected_calibration_error(probs, outcomes) > 0.4

    def test_score_bundles_every_metric(self):
        s = score("x", [0.2, 0.8], [False, True])
        assert s.accuracy == 1.0
        assert 0.0 <= s.brier <= 1.0
        assert s.log_loss > 0


class TestCalibration:
    def test_recovers_difficulty_better_than_the_authored_guess(self):
        truth, authored, responses = synthetic_corpus()
        report = calibrate_items(responses, authored)

        before = sum(abs(p.authored_b - truth[i][0]) for i, p in report.items.items())
        after = sum(abs(p.b - truth[i][0]) for i, p in report.items.items())
        assert after < before / 2, "calibration should more than halve difficulty error"

    def test_a_thinly_answered_item_keeps_its_authored_value(self):
        _truth, authored, responses = synthetic_corpus(n_officers=3)
        report = calibrate_items(responses, authored)
        assert report.n_calibrated == 0
        for p in report.items.values():
            assert p.b == p.authored_b
            assert p.status == f"provisional (3/{MIN_RESPONSES_TO_CALIBRATE})"

    def test_no_responses_is_handled(self):
        report = calibrate_items([], {})
        assert report.items == {}
        assert report.n_calibrated == 0

    def test_flags_items_that_drifted_from_their_authored_difficulty(self):
        _truth, authored, responses = synthetic_corpus()
        report = calibrate_items(responses, authored)
        assert report.flagged(threshold=1.0)


class TestPredictiveValidation:
    def test_irt_beats_every_simpler_baseline(self):
        _truth, authored, responses = synthetic_corpus()
        report = calibrate_items(responses, authored)
        calibrated = {i: (p.b, p.a, p.c) for i, p in report.items.items() if p.calibrated}

        results = {r.name: r for r in cross_validate(responses, authored, calibrated)}

        assert results["IRT authored"].auc > results["base rate"].auc
        assert results["IRT authored"].auc > results["legacy estimator"].auc
        assert results["IRT calibrated"].auc > results["IRT authored"].auc
        assert results["IRT calibrated"].brier < results["legacy estimator"].brier

    def test_the_legacy_estimator_is_poorly_calibrated(self):
        """Its stated confidence does not match observed frequency."""
        _truth, authored, responses = synthetic_corpus()
        results = {r.name: r for r in cross_validate(responses, authored, None)}
        assert (
            results["legacy estimator"].calibration_error
            > results["IRT authored"].calibration_error
        )

    def test_too_little_data_returns_nothing_rather_than_a_bogus_score(self):
        assert cross_validate([], {}) == []


class TestAgainstStoredData:
    def test_corpus_only_keeps_responses_tied_to_a_question(self, db):
        corpus = response_corpus(db)
        assert corpus
        assert all(item_id for _u, item_id, _ok in corpus)

    def test_seeded_officers_have_measurable_ability(self, db):
        rows = topic_abilities(db, "u-jso-anita")
        assert rows
        for row in rows:
            assert 0 <= row.ability.level <= 4
            assert row.ability.se > 0
            low, high = row.ability.level_range()
            assert low <= row.ability.level <= high

    def test_short_checkpoints_are_reported_as_provisional(self, db):
        """Four-item checkpoints cannot separate adjacent levels, and say so."""
        rows = topic_abilities(db, "u-jso-anita")
        assert any(r.ability.is_provisional for r in rows)

    def test_ageing_evidence_widens_uncertainty(self, db):
        fresh = {
            r.topic_id: r.ability.se
            for r in topic_abilities(db, "u-jso-anita", apply_decay=False)
        }
        aged = {
            r.topic_id: r.ability.se
            for r in topic_abilities(db, "u-jso-anita", apply_decay=True)
        }
        assert any(aged[t] > fresh[t] for t in fresh)


class TestEndpoints:
    @staticmethod
    def admin(client):
        token = client.post(
            "/api/auth/login", json={"user_id": "u-admin-meera", "password": "admin123"}
        ).json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def test_ability_report_is_available_to_the_learner(self, client):
        body = client.get("/api/users/u-jso-anita/ability").json()
        assert body["user_id"] == "u-jso-anita"
        assert body["measured_topics"] >= 1
        for topic in body["topics"]:
            assert topic["level_low"] <= topic["level"] <= topic["level_high"]
            assert 0 <= topic["confidence_pct"] <= 100

    def test_unknown_officer_is_404(self, client):
        assert client.get("/api/users/nobody/ability").status_code == 404

    def test_calibration_and_validation_require_an_admin(self, client):
        for path in ("/api/admin/calibration", "/api/admin/validation"):
            assert client.get(path).status_code == 401

    def test_admin_sees_calibration_status_honestly(self, client):
        body = client.get("/api/admin/calibration", headers=self.admin(client)).json()
        assert body["min_responses_required"] == MIN_RESPONSES_TO_CALIBRATE
        # The seeded corpus is far too thin to calibrate, and the note must say so.
        assert body["items_calibrated"] == 0
        assert "authored difficulty" in body["note"]

    def test_validation_reports_the_model_ladder(self, client):
        body = client.get("/api/admin/validation", headers=self.admin(client)).json()
        names = [m["name"] for m in body["models"]]
        assert "base rate" in names and "IRT authored" in names
        assert body["source"] == "real"
