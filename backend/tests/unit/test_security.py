"""Security primitives: hashing, token signing, password policy, SSRF guard."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.errors import ValidationAppError
from app.core.net import html_to_text, normalize_company, validate_public_url
from app.core.security import (
    constant_time_equals,
    decrypt_secret,
    encrypt_secret,
    hash_password,
    secret_fingerprint,
    sign_download,
    verify_download_token,
    verify_password,
)
from app.schemas.auth import RegisterRequest

SECRET = "unit-test-secret-key-0123456789"


def test_password_hash_roundtrip():
    hashed = hash_password("CorrectHorse123")
    assert hashed != "CorrectHorse123"
    assert hashed.startswith("$argon2")
    assert verify_password("CorrectHorse123", hashed)
    assert not verify_password("WrongHorse123", hashed)


def test_password_hashes_are_salted():
    assert hash_password("SamePassword123") != hash_password("SamePassword123")


def test_constant_time_compare():
    assert constant_time_equals("abc", "abc")
    assert not constant_time_equals("abc", "abd")


def test_secret_encryption_roundtrip_and_fingerprint():
    ciphertext = encrypt_secret("unit-fixture-provider-credential", SECRET)
    assert "unit-fixture-provider-credential" not in ciphertext
    assert decrypt_secret(ciphertext, SECRET) == "unit-fixture-provider-credential"
    hint = secret_fingerprint("unit-fixture-provider-credential")
    assert "unit-fixture-provider-credential" not in hint
    # The hint may only reveal the last four characters, never the whole value.
    assert hint == "••••" + "tial"
    assert len(hint) <= 8


def test_decrypt_with_wrong_key_fails():
    ciphertext = encrypt_secret("unit-fixture-provider-credential", SECRET)
    with pytest.raises(Exception):
        decrypt_secret(ciphertext, "a-different-secret-key-0123456789")


def test_download_token_verification_and_tamper():
    token = sign_download("user-1", "doc-1", 2, "pdf", SECRET, 300)
    claims = verify_download_token(token, SECRET)
    assert claims == {"user_id": "user-1", "document_id": "doc-1", "version": "2", "fmt": "pdf"}

    tampered = token[:-2] + ("aa" if not token.endswith("aa") else "bb")
    assert verify_download_token(tampered, SECRET) is None
    assert verify_download_token(token, "another-secret-key-0123456789") is None


def test_expired_download_token_is_rejected():
    token = sign_download("user-1", "doc-1", 1, "pdf", SECRET, ttl_seconds=-10)
    assert verify_download_token(token, SECRET) is None


@pytest.mark.parametrize("password", ["short1", "allletters", "1234567890", "password123"])
def test_password_policy_rejects_weak_values(password):
    with pytest.raises(ValidationError):
        RegisterRequest(email="a@example.com", password=password)


def test_password_policy_accepts_reasonable_value():
    model = RegisterRequest(email="a@example.com", password="Reasonable123")
    assert model.password == "Reasonable123"


@pytest.mark.parametrize("url", [
    "http://localhost/job",
    "http://127.0.0.1:80/job",
    "http://10.0.0.5/job",
    "http://192.168.1.10/job",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/job",
    "ftp://example.com/job",
    "file:///etc/passwd",
    "http://user:pass@example.com/job",
    "http://example.com:8080/job",
    "javascript:alert(1)",
])
def test_url_validation_blocks_unsafe_targets(url):
    with pytest.raises(ValidationAppError):
        validate_public_url(url)


def test_url_validation_accepts_public_https_and_strips_fragment():
    normalized = validate_public_url("HTTPS://Jobs.Example.com/roles/12?ref=x#fragment")
    assert normalized == "https://jobs.example.com/roles/12?ref=x"


def test_html_to_text_extracts_title_and_body():
    html = """
    <html><head><title>Senior Backend Engineer - Acme</title>
    <script>ignore()</script></head>
    <body><h1>Senior Backend Engineer</h1><p>Build APIs with Python.</p></body></html>
    """
    text, title = html_to_text(html)
    assert "Build APIs with Python" in text
    assert "ignore()" not in text
    assert "Senior Backend Engineer" in (title or text)


def test_normalize_company_collapses_case_ampersands_and_whitespace():
    assert normalize_company("  Acme   &  Co ") == "acme and co"
    assert normalize_company("ACME & CO") == normalize_company("acme  &   co")
