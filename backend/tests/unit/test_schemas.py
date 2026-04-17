"""
Unit tests for request/response schema validation.
"""
import pytest
from pydantic import ValidationError
from src.schemas.user import UserRegister
from src.schemas.execution import LogEventCreate


class TestUserRegisterPassword:
    def _make(self, password: str) -> UserRegister:
        return UserRegister(email="test@example.com", password=password, full_name="Test")

    def test_valid_strong_password(self):
        user = self._make("StrongP@ss1")
        assert user.password == "StrongP@ss1"

    def test_too_short(self):
        with pytest.raises(ValidationError, match="8 characters"):
            self._make("Sh0rt!")

    def test_no_uppercase(self):
        with pytest.raises(ValidationError, match="uppercase"):
            self._make("alllower1@here")

    def test_no_number(self):
        with pytest.raises(ValidationError, match="number"):
            self._make("NoNumbers@Here")

    def test_no_special_char(self):
        with pytest.raises(ValidationError, match="special character"):
            self._make("NoSpecial1Char")

    def test_multiple_failures_reported(self):
        with pytest.raises(ValidationError) as exc_info:
            self._make("weak")
        errors = str(exc_info.value)
        # Should mention multiple requirements in one message
        assert "Password must contain" in errors


class TestLogEventCreate:
    def test_valid_completion(self):
        e = LogEventCreate(
            event_type="completed",
            pct_complete=100,
            note="Done",
            new_status="completed",
            actual_hours=5.5,
        )
        assert e.actual_hours == 5.5

    def test_actual_hours_optional(self):
        e = LogEventCreate(event_type="started", pct_complete=0)
        assert e.actual_hours is None

    def test_negative_actual_hours_rejected(self):
        with pytest.raises(ValidationError):
            LogEventCreate(event_type="completed", pct_complete=100, actual_hours=-1.0)

    def test_pct_complete_range(self):
        with pytest.raises(ValidationError):
            LogEventCreate(event_type="progress", pct_complete=110)

    def test_invalid_event_type(self):
        with pytest.raises(ValidationError):
            LogEventCreate(event_type="invalid_type", pct_complete=0)
