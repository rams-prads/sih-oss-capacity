"""Password hashing for the app's own login.

PBKDF2-HMAC-SHA256 from the standard library: no extra dependency, and strong
enough for a prototype. Federating to Keycloak, as production iGOT does, would
replace this module entirely - nothing else imports hashlib.
"""
from __future__ import annotations

import hashlib
import hmac
import os

from app.config import get_settings

# Deliberately expensive. Tests lower it via PBKDF2_ITERATIONS because they
# re-seed nine officers before every test; never lower it in a real deployment.
ITERATIONS = get_settings().pbkdf2_iterations


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations)
    )
    # Constant-time compare so a wrong password cannot be found byte by byte.
    return hmac.compare_digest(digest.hex(), digest_hex)
