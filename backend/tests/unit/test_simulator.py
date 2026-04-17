"""
Unit tests for simulation pure-logic helpers.
No database or external services required.
"""
import pytest
from src.services.simulation.simulator import (
    _compute_actual_hours,
    _apply_scenario,
    _pick_note,
    _speed_for_member,
    _emoji_for,
    DEFAULT_BOTS,
    SCENARIOS,
    NOTES_STARTED,
    NOTES_COMPLETED,
)


class TestComputeActualHours:
    def test_positive_result(self):
        hours = _compute_actual_hours(8.0, 1.0)
        assert hours > 0

    def test_minimum_clamp(self):
        # Extremely fast speed should still return at least 0.5h
        hours = _compute_actual_hours(0.01, 0.01)
        assert hours >= 0.5

    def test_faster_bot_takes_less_time_on_average(self):
        # Run 50 trials: optimistic bot (0.80) should average fewer hours than slow bot (1.45)
        fast = sum(_compute_actual_hours(8.0, 0.80) for _ in range(50)) / 50
        slow = sum(_compute_actual_hours(8.0, 1.45) for _ in range(50)) / 50
        assert fast < slow

    def test_rounding(self):
        hours = _compute_actual_hours(8.0, 1.0)
        assert hours == round(hours, 1)


class TestApplyScenario:
    def test_optimistic_lower_block_chance(self):
        _, _, block_chance = _apply_scenario(DEFAULT_BOTS, "optimistic", 1)
        assert block_chance == SCENARIOS["optimistic"]["block_chance"]
        assert block_chance < SCENARIOS["pessimistic"]["block_chance"]

    def test_key_person_leaves_before_dropout(self):
        bots, _, _ = _apply_scenario(DEFAULT_BOTS, "key_person_leaves", 1)
        assert len(bots) == len(DEFAULT_BOTS)  # no dropout yet

    def test_key_person_leaves_after_dropout(self):
        bots, _, _ = _apply_scenario(DEFAULT_BOTS, "key_person_leaves", 5)
        assert len(bots) == len(DEFAULT_BOTS) - 1

    def test_key_person_leaves_drops_slowest(self):
        # The dropped bot should be the one with the highest speed factor (slowest)
        bots_before = list(DEFAULT_BOTS)
        bots_after, _, _ = _apply_scenario(DEFAULT_BOTS, "key_person_leaves", 5)
        slowest = max(bots_before, key=lambda b: b["speed"])
        assert all(b["name"] != slowest["name"] for b in bots_after)

    def test_unknown_scenario_falls_back_to_realistic(self):
        _, speed_mult, block_chance = _apply_scenario(DEFAULT_BOTS, "unknown_scenario", 1)
        assert speed_mult == SCENARIOS["realistic"]["speed_mult"]
        assert block_chance == SCENARIOS["realistic"]["block_chance"]

    def test_returns_copy_not_mutation(self):
        original_len = len(DEFAULT_BOTS)
        _apply_scenario(DEFAULT_BOTS, "key_person_leaves", 10)
        assert len(DEFAULT_BOTS) == original_len  # original not mutated


class TestPickNote:
    def test_returns_string(self):
        note = _pick_note(NOTES_STARTED, "dev")
        assert isinstance(note, str)
        assert len(note) > 0

    def test_unknown_category_falls_back_to_dev(self):
        note = _pick_note(NOTES_STARTED, "unknown_category")
        assert note in NOTES_STARTED["dev"]

    def test_known_category_returns_matching_note(self):
        note = _pick_note(NOTES_COMPLETED, "test")
        assert note in NOTES_COMPLETED["test"]

    def test_none_category_falls_back(self):
        note = _pick_note(NOTES_STARTED, None)
        assert note in NOTES_STARTED["dev"]


class TestHelpers:
    def test_speed_for_member_cycles(self):
        # Index 0 and 8 should return the same speed
        assert _speed_for_member(0) == _speed_for_member(8)

    def test_speed_for_member_positive(self):
        for i in range(16):
            assert _speed_for_member(i) > 0

    def test_emoji_for_cycles(self):
        assert _emoji_for(0) == _emoji_for(8)

    def test_emoji_for_returns_emoji(self):
        emoji = _emoji_for(0)
        assert isinstance(emoji, str)
        assert len(emoji) > 0
