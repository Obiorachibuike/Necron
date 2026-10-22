"""Password hashing, opaque session tokens, CSRF and signed download links."""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from urllib.parse import quote

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2, hash_len=32, salt_len=16)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return False


def new_session_token() -> str:
    return secrets.token_urlsafe(48)


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def _fernet(secret: str) -> Fernet:
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=b"careerpilot-ai-secret-v1",
               info=b"provider-credential-encryption").derive(secret.encode("utf-8"))
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_secret(plaintext: str, secret: str) -> str:
    return "v1:" + _fernet(secret).encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_secret(ciphertext: str, secret: str) -> str:
    if not ciphertext.startswith("v1:"):
        raise ValueError("Unsupported secret format")
    try:
        return _fernet(secret).decrypt(ciphertext[3:].encode("ascii")).decode("utf-8")
    except InvalidToken as exc:  # pragma: no cover - depends on key rotation
        raise ValueError("Stored credential could not be decrypted with the configured key") from exc


def secret_fingerprint(secret_value: str) -> str:
    """Non-reversible display hint; never the secret itself."""
    return "••••" + secret_value[-4:] if len(secret_value) >= 8 else "••••"


def sign_download(user_id: str, document_id: str, version: int, fmt: str, secret: str,
                  ttl_seconds: int) -> str:
    """Signed, expiring, user-bound download token (no filesystem paths inside)."""
    expires = int(time.time()) + ttl_seconds
    payload = f"{user_id}:{document_id}:{version}:{fmt}:{expires}"
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    raw = f"{payload}:{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def verify_download_token(token: str, secret: str) -> dict[str, str] | None:
    try:
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        user_id, document_id, version, fmt, expires, sig = raw.split(":")
        payload = f"{user_id}:{document_id}:{version}:{fmt}:{expires}"
        expected = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig) or int(expires) < int(time.time()):
            return None
        return {"user_id": user_id, "document_id": document_id, "version": version, "fmt": fmt}
    except (ValueError, TypeError):
        return None


def safe_filename(name: str) -> str:
    """Conservative filename for Content-Disposition; never used to build disk paths."""
    cleaned = "".join(c for c in name if c.isalnum() or c in " -_().").strip() or "document"
    return quote(cleaned[:120])


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if not domain:
        return "***"
    visible = local[:2] if len(local) > 2 else local[:1]
    return f"{visible}{'*' * max(1, len(local) - len(visible))}@{domain}"
