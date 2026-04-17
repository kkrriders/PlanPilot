"""
Unit tests for plan risk heuristic scoring.
No LLM calls involved.
"""
import pytest
from src.services.planning.plan_evaluator import _heuristic_risk


class TestHeuristicRisk:
    def test_baseline_no_constraints(self):
        score = _heuristic_risk({}, 5, 10.0)
        assert 0.0 <= score <= 1.0
        assert score >= 0.3  # baseline

    def test_tight_deadline_raises_score(self):
        # deadline_days=2 with 16h of critical path → ratio=1.0 → +0.3
        tight = _heuristic_risk({"deadline_days": 2}, 5, 16.0)
        comfortable = _heuristic_risk({"deadline_days": 30}, 5, 16.0)
        assert tight > comfortable

    def test_many_tasks_raises_score(self):
        many = _heuristic_risk({}, 25, 10.0)
        few = _heuristic_risk({}, 5, 10.0)
        assert many > few

    def test_missing_team_size_raises_score(self):
        with_team = _heuristic_risk({"team_size": 3}, 5, 10.0)
        without_team = _heuristic_risk({}, 5, 10.0)
        assert without_team > with_team

    def test_score_never_exceeds_0_95(self):
        # Even worst case should be capped
        score = _heuristic_risk({"deadline_days": 1}, 100, 100.0)
        assert score <= 0.95

    def test_score_always_non_negative(self):
        score = _heuristic_risk({"deadline_days": 365, "team_size": 10}, 1, 1.0)
        assert score >= 0.0

    def test_moderate_deadline_partial_penalty(self):
        # ratio between 0.7 and 0.9 → +0.15 not +0.3
        score = _heuristic_risk({"deadline_days": 5}, 1, 30.0)  # 30h / 40h = 0.75 ratio
        baseline = 0.3 + 0.05  # no team_size
        assert score == pytest.approx(baseline + 0.15)
