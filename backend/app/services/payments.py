from __future__ import annotations

import base64
import hashlib
import hmac
import json
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from urllib import error, request

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AppSetting


RAZORPAY_MODE_SETTING_KEY = "razorpay_mode"
RAZORPAY_MODES = {"test", "live"}
RAZORPAY_ORDERS_URL = "https://api.razorpay.com/v1/orders"


class PaymentGatewayError(RuntimeError):
    pass


@dataclass(frozen=True)
class RazorpayCredentials:
    mode: str
    key_id: str
    key_secret: str


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def normalize_razorpay_mode(mode: str | None) -> str:
    normalized = (mode or "test").strip().lower()
    if normalized not in RAZORPAY_MODES:
        return "test"
    return normalized


def get_razorpay_mode(db: Session) -> str:
    stored_mode = db.get(AppSetting, RAZORPAY_MODE_SETTING_KEY)
    if stored_mode is not None:
        return normalize_razorpay_mode(stored_mode.value)
    return normalize_razorpay_mode(settings.razorpay_mode)


def set_razorpay_mode(db: Session, mode: str) -> str:
    normalized = (mode or "").strip().lower()
    if normalized not in RAZORPAY_MODES:
        raise ValueError("Razorpay mode must be test or live.")

    stored_mode = db.get(AppSetting, RAZORPAY_MODE_SETTING_KEY)
    if stored_mode is None:
        stored_mode = AppSetting(key=RAZORPAY_MODE_SETTING_KEY, value=normalized)
    else:
        stored_mode.value = normalized
    db.add(stored_mode)
    db.commit()
    return normalized


def get_razorpay_credentials_for_mode(mode: str) -> RazorpayCredentials:
    normalized = normalize_razorpay_mode(mode)
    if normalized == "live":
        key_id = _clean_optional(settings.razorpay_live_key_id)
        key_secret = _clean_optional(settings.razorpay_live_key_secret)
    else:
        key_id = _clean_optional(settings.razorpay_test_key_id)
        key_secret = _clean_optional(settings.razorpay_test_key_secret)

    if not key_id or not key_secret:
        raise PaymentGatewayError(f"Razorpay {normalized} keys are not configured.")
    return RazorpayCredentials(mode=normalized, key_id=key_id, key_secret=key_secret)


def get_active_razorpay_credentials(db: Session) -> RazorpayCredentials:
    return get_razorpay_credentials_for_mode(get_razorpay_mode(db))


def _mask_key(value: str | None) -> str | None:
    cleaned = _clean_optional(value)
    if not cleaned:
        return None
    if len(cleaned) <= 8:
        return f"{cleaned[:2]}{'*' * max(0, len(cleaned) - 4)}{cleaned[-2:]}"
    return f"{cleaned[:6]}{'*' * (len(cleaned) - 10)}{cleaned[-4:]}"


def build_razorpay_settings_summary(db: Session) -> dict[str, str | bool | None]:
    test_key_id = _clean_optional(settings.razorpay_test_key_id)
    test_key_secret = _clean_optional(settings.razorpay_test_key_secret)
    live_key_id = _clean_optional(settings.razorpay_live_key_id)
    live_key_secret = _clean_optional(settings.razorpay_live_key_secret)

    return {
        "active_mode": get_razorpay_mode(db),
        "test_key_id": _mask_key(test_key_id),
        "live_key_id": _mask_key(live_key_id),
        "test_configured": bool(test_key_id and test_key_secret),
        "live_configured": bool(live_key_id and live_key_secret),
    }


def amount_to_paise(amount: Decimal) -> int:
    return int((Decimal(amount) * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def create_razorpay_order(
    credentials: RazorpayCredentials,
    *,
    amount_paise: int,
    receipt: str,
    notes: dict[str, str],
) -> dict:
    payload = json.dumps(
        {
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt,
            "notes": notes,
        }
    ).encode("utf-8")
    token = base64.b64encode(f"{credentials.key_id}:{credentials.key_secret}".encode("utf-8")).decode("ascii")
    api_request = request.Request(
        RAZORPAY_ORDERS_URL,
        data=payload,
        headers={
            "Authorization": f"Basic {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(api_request, timeout=30) as response:  # noqa: S310
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        raw_error = exc.read().decode("utf-8", errors="replace")
        try:
            payload_error = json.loads(raw_error)
            message = payload_error.get("error", {}).get("description") or raw_error
        except json.JSONDecodeError:
            message = raw_error or str(exc)
        raise PaymentGatewayError(message) from exc
    except error.URLError as exc:
        raise PaymentGatewayError("Unable to connect to Razorpay. Try again later.") from exc


def verify_razorpay_signature(
    *,
    order_id: str,
    payment_id: str,
    signature: str,
    key_secret: str,
) -> bool:
    signed_payload = f"{order_id}|{payment_id}".encode("utf-8")
    generated_signature = hmac.new(
        key_secret.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(generated_signature, signature)
