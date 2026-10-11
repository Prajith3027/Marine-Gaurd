"""
Security primitives: password hashing (bcrypt) and JWT access tokens.
"""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import get_settings, INSECURE_SECRET_PATTERNS, MIN_JWT_SECRET_BYTES

MAX_PASSWORD_BYTES = 72  # bcrypt hard limit
MIN_PASSWORD_LENGTH = 8


class TokenError(Exception):
    """Raised for any invalid / expired token (message is intentionally generic)."""


def _secret() -> str:
    s = get_settings()
    env_lower = (s.app_env or "").strip().lower()
    is_production = env_lower not in ("development", "dev", "test", "testing")
    sec = (s.secret_key or "").strip()
    if is_production:
        if not sec:
            raise RuntimeError(
                "SECRET_KEY is missing or empty. A secure secret of at least 32 bytes (256 bits) "
                "must be configured via environment in production."
            )
        if sec.lower() in INSECURE_SECRET_PATTERNS:
            raise RuntimeError(
                "Insecure default SECRET_KEY detected. Production must use a cryptographically strong "
                "random secret configured via environment."
            )
        if len(sec.encode("utf-8")) < MIN_JWT_SECRET_BYTES:
            raise RuntimeError(
                f"SECRET_KEY must be at least {MIN_JWT_SECRET_BYTES} bytes (256 bits) in production, "
                f"got {len(sec.encode('utf-8'))} bytes."
            )
    else:
        if not sec:
            raise RuntimeError("SECRET_KEY must not be empty.")
    return s.secret_key


def validate_password_strength(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError("Password is too long (max 72 bytes).")


def hash_password(password: str) -> str:
    validate_password_strength(password)
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
            return False
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# Pre-computed hash used to equalise timing when an email does not exist.
DUMMY_HASH = bcrypt.hashpw(b"timing-equaliser", bcrypt.gensalt(rounds=12)).decode("utf-8")


def create_access_token(user_id: str, role: str) -> tuple[str, int]:
    """Returns (token, expires_in_seconds)."""
    s = get_settings()
    now = datetime.now(timezone.utc)
    expires = timedelta(minutes=s.access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": user_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + expires).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, _secret(), algorithm=s.jwt_algorithm), int(expires.total_seconds())


def decode_access_token(token: str) -> dict[str, Any]:
    s = get_settings()
    try:
        return jwt.decode(
            token, _secret(), algorithms=[s.jwt_algorithm],
            options={"require": ["exp", "sub", "iat"]},
        )
    except jwt.PyJWTError as exc:  # expired, malformed, bad signature...
        raise TokenError("Invalid or expired token") from exc


# ── Minimal in-memory login throttle (per email+client) ────────────────────
_FAILS: dict[str, list[float]] = {}
_WINDOW_SECONDS = 300
_MAX_FAILS = 5


def is_locked_out(key: str) -> bool:
    now = time.time()
    attempts = [t for t in _FAILS.get(key, []) if now - t < _WINDOW_SECONDS]
    _FAILS[key] = attempts
    return len(attempts) >= _MAX_FAILS


def record_failure(key: str) -> None:
    _FAILS.setdefault(key, []).append(time.time())


def clear_failures(key: str) -> None:
    _FAILS.pop(key, None)
