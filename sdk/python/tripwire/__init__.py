"""Tripwire agent SDK for Python. Standard library only, Python 3.9+.

    from tripwire import Tripwire, guard

    tw = Tripwire(base_url=..., auth0_domain=..., audience=..., client_id=..., client_secret=..., agent_name="billing-bot")

    @guard(tw, session_id="run-42")
    def refund(order_id, amount): ...

The decorated function runs only after Tripwire allows it (or a human approves it). Safety modes decide what
happens when Tripwire cannot be reached: fail_mode="closed" (default) blocks, "allowlist" runs only the action
types in offline_allow, "open" runs the function anyway.
"""

from __future__ import annotations

import functools
import json
import re
import time
import urllib.error
import urllib.request
from typing import Any, Callable, Iterable, Optional

__all__ = ["Tripwire", "guard", "TripwireDenied", "TripwireUnavailable", "TripwireError"]


class TripwireDenied(Exception):
    def __init__(self, message: str, decision: Any = None):
        super().__init__(message)
        self.decision = decision


class TripwireUnavailable(Exception):
    """Tripwire could not be reached (network error, timeout, 5xx or 429 after retries)."""

    retry_after: Optional[float] = None


class TripwireError(Exception):
    """Tripwire answered but refused the request (bad credentials, invalid body)."""

    def __init__(self, message: str, status: int):
        super().__init__(message)
        self.status = status


_FAIL_MODES = ("closed", "allowlist", "open")


def _transient(status: int) -> bool:
    return status == 429 or status >= 500


class Tripwire:
    def __init__(
        self,
        base_url: str,
        audience: str,
        client_id: str,
        client_secret: str,
        auth0_domain: Optional[str] = None,
        token_url: Optional[str] = None,
        agent_name: Optional[str] = None,
        fail_mode: str = "closed",
        offline_allow: Iterable[Any] = (),
        timeout: float = 10.0,
        retries: int = 2,
        on_fail_mode: Optional[Callable[[dict], None]] = None,
    ):
        if fail_mode not in _FAIL_MODES:
            raise ValueError(f"fail_mode must be one of {_FAIL_MODES}")
        if not token_url and not auth0_domain:
            raise ValueError("auth0_domain is required")
        self.base_url = base_url.rstrip("/")
        self.token_url = token_url or "https://%s/oauth/token" % re.sub(r"^https?://|/$", "", auth0_domain or "")
        self.audience, self.client_id, self.client_secret = audience, client_id, client_secret
        self.agent_name, self.fail_mode = agent_name, fail_mode
        self.offline_allow = list(offline_allow)
        self.timeout, self.retries, self.on_fail_mode = timeout, retries, on_fail_mode
        self._token: Optional[str] = None
        self._token_expiry = 0.0

    # ---- transport ----

    def _request(self, url: str, body: Optional[dict], headers: dict, timeout: Optional[float] = None) -> Any:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method="POST" if data is not None else "GET")
        try:
            with urllib.request.urlopen(req, timeout=timeout or self.timeout) as res:
                return json.loads(res.read() or b"{}")
        except urllib.error.HTTPError as e:
            payload = {}
            try:
                payload = json.loads(e.read() or b"{}")
            except Exception:
                pass
            if _transient(e.code):
                err = TripwireUnavailable(f"Tripwire: {url} failed ({e.code})")
                try:
                    err.retry_after = min(float(e.headers.get("Retry-After", "")), 30.0)
                except ValueError:
                    pass
                raise err from None
            if e.code == 401:
                self._token = None
            raise TripwireError(f"Tripwire: {url} failed ({e.code}) {payload.get('error', '')}".strip(), e.code) from None
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise TripwireUnavailable(f"Tripwire: could not reach {url}") from e

    def _retry(self, fn: Callable[[], Any]) -> Any:
        attempt = 0
        while True:
            try:
                return fn()
            except TripwireUnavailable as e:
                if attempt >= self.retries:
                    raise
                time.sleep(e.retry_after if e.retry_after else min(2.0, 0.2 * 2**attempt))
                attempt += 1

    def _access_token(self) -> str:
        if self._token and time.time() < self._token_expiry - 30:
            return self._token
        data = self._retry(
            lambda: self._request(
                self.token_url,
                {"grant_type": "client_credentials", "client_id": self.client_id, "client_secret": self.client_secret, "audience": self.audience},
                {"content-type": "application/json"},
            )
        )
        self._token = data["access_token"]
        self._token_expiry = time.time() + float(data.get("expires_in", 3600))
        return self._token

    def _call(self, path: str, body: Optional[dict] = None, timeout: Optional[float] = None) -> Any:
        def once():
            headers = {"authorization": f"Bearer {self._access_token()}", "content-type": "application/json"}
            return self._request(self.base_url + path, body, headers, timeout)

        return self._retry(once)

    # ---- api ----

    def report(self, session_id: str, action_type: str, target: Optional[str] = None, payload: Optional[dict] = None) -> dict:
        """Returns {"event_id", "status": "allowed" | "pending" | "denied", "risk": {...}}."""
        return self._call(
            "/api/ingest",
            {"session_id": session_id, "action_type": action_type, "target": target, "payload": payload or {}, "agent_name": self.agent_name},
        )

    def wait_for_decision(self, event_id: str, timeout: float = 600.0) -> dict:
        deadline = time.time() + timeout
        while True:
            left = deadline - time.time()
            if left <= 0:
                return {"status": "timeout", "proceed": False}
            d = self._call(f"/api/actions/{event_id}?wait={min(25, int(left) + 1)}", timeout=40)
            if d.get("status") != "pending":
                return d

    def _offline_allowed(self, action_type: str, mode: str) -> bool:
        if mode == "open":
            return True
        if mode == "allowlist":
            return any((p.search(action_type) if hasattr(p, "search") else p == action_type) for p in self.offline_allow)
        return False

    def run(
        self,
        fn: Callable[[], Any],
        session_id: str,
        action_type: str,
        target: Optional[str] = None,
        payload: Optional[dict] = None,
        fail_mode: Optional[str] = None,
        wait_timeout: float = 600.0,
    ) -> Any:
        """Reports the action, waits if it is held, then calls fn only when allowed."""
        try:
            r = self.report(session_id, action_type, target, payload)
        except TripwireUnavailable as e:
            mode = fail_mode or self.fail_mode
            allowed = self._offline_allowed(action_type, mode)
            if self.on_fail_mode:
                self.on_fail_mode({"action_type": action_type, "mode": mode, "allowed": allowed, "error": e})
            if not allowed:
                raise
            return fn()
        if r.get("status") == "denied":
            raise TripwireDenied(f"Action {action_type} was denied: {r.get('risk', {}).get('reason', 'blocked by policy')}", r)
        if r.get("status") == "pending":
            d = self.wait_for_decision(r["event_id"], wait_timeout)  # never fails open
            if not d.get("proceed"):
                raise TripwireDenied(f"Action {action_type} was {d.get('status')}", d)
        return fn()


def guard(
    tw: Tripwire,
    session_id: str,
    action_type: Optional[str] = None,
    target: Optional[Callable[..., Optional[str]]] = None,
    fail_mode: Optional[str] = None,
):
    """Decorator: the function runs only after Tripwire allows it. Arguments are sent as the payload.

    `target` is an optional callable receiving the function's arguments and returning a short string.
    """

    def deco(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            payload = {"args": [repr(a)[:500] for a in args], "kwargs": {k: repr(v)[:500] for k, v in kwargs.items()}}
            tgt = target(*args, **kwargs) if target else None
            return tw.run(lambda: fn(*args, **kwargs), session_id, action_type or fn.__name__, tgt, payload, fail_mode)

        return wrapper

    return deco
