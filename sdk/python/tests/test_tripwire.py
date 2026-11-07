import json
import socket
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tripwire import Tripwire, TripwireDenied, TripwireError, TripwireUnavailable, guard  # noqa: E402

STATE = {"flaky": 0}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("content-length", 0)))
        if self.path == "/token":
            return self._send(200, {"access_token": "t", "expires_in": 3600})
        if self.path == "/api/ingest":
            if STATE["flaky"] > 0:
                STATE["flaky"] -= 1
                return self._send(503, {"error": "down"})
            t = json.loads(raw)["action_type"]
            if t == "deny_me":
                return self._send(201, {"event_id": "d", "status": "denied", "risk": {"reason": "policy"}})
            if t == "risky":
                return self._send(201, {"event_id": "e-risky", "status": "pending", "risk": {}})
            if t == "bad":
                return self._send(400, {"error": "nope"})
            return self._send(201, {"event_id": "ok", "status": "allowed", "risk": {}})
        self._send(404, {})

    def do_GET(self):
        if self.path.startswith("/api/actions/e-risky"):
            return self._send(200, {"status": "approved", "proceed": True})
        self._send(404, {})


class SdkTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.srv.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    @staticmethod
    def dead_url():
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()
        return f"http://127.0.0.1:{port}"

    def make(self, **kw):
        kw.setdefault("base_url", self.base)
        return Tripwire(token_url=f"{self.base}/token", audience="a", client_id="c", client_secret="s", retries=0, **kw)

    def test_allowed_risky_denied(self):
        tw = self.make()
        self.assertEqual(tw.run(lambda: "ran", "s", "safe"), "ran")
        self.assertEqual(tw.run(lambda: "after", "s", "risky"), "after")
        ran = []
        with self.assertRaises(TripwireDenied):
            tw.run(lambda: ran.append(1), "s", "deny_me")
        self.assertEqual(ran, [])

    def test_retry_on_503(self):
        STATE["flaky"] = 2
        tw = self.make()
        tw.retries = 2
        self.assertEqual(tw.run(lambda: "ok", "s", "safe"), "ok")

    def test_fail_modes(self):
        dead = self.dead_url()
        with self.assertRaises(TripwireUnavailable):
            self.make(base_url=dead).run(lambda: 1, "s", "x")
        self.assertEqual(self.make(base_url=dead, fail_mode="open").run(lambda: "ran", "s", "x"), "ran")
        al = self.make(base_url=dead, fail_mode="allowlist", offline_allow=["fs_read"])
        self.assertEqual(al.run(lambda: "ran", "s", "fs_read"), "ran")
        with self.assertRaises(TripwireUnavailable):
            al.run(lambda: "ran", "s", "fs_delete")

    def test_timeout_never_fails_open(self):
        srv = socket.socket()
        srv.bind(("127.0.0.1", 0))
        srv.listen(1)  # accepts the connection (backlog) and never answers
        tw = self.make(base_url=f"http://127.0.0.1:{srv.getsockname()[1]}", fail_mode="open", timeout=0.3)
        ran = []
        with self.assertRaises(TripwireUnavailable) as cm:
            tw.run(lambda: ran.append(1), "s", "x")
        srv.close()
        self.assertTrue(cm.exception.ambiguous)
        self.assertEqual(ran, [])

    def test_payload_is_bounded(self):
        from tripwire import _bound_payload

        circ = {"a": 1}
        circ["self"] = circ
        out = _bound_payload({"big": "x" * 200000, "circ": circ, "obj": object()})
        self.assertLess(len(json.dumps(out)), 32 * 1024)
        self.assertEqual(out["circ"]["self"], "[circular]")
        self.assertTrue(_bound_payload({f"k{i}": "y" * 100 for i in range(5000)})["_truncated"])

    def test_rejected_request_never_fails_open(self):
        with self.assertRaises(TripwireError):
            self.make(fail_mode="open").run(lambda: "ran", "s", "bad")

    def test_decorator(self):
        tw = self.make()

        @guard(tw, "s1", action_type="safe")
        def add(a, b):
            return a + b

        self.assertEqual(add(1, 2), 3)

        @guard(tw, "s1", action_type="deny_me")
        def nope():
            return 1

        with self.assertRaises(TripwireDenied):
            nope()


if __name__ == "__main__":
    unittest.main()
