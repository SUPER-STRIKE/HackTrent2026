import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { Tripwire, TripwireDenied, TripwireUnavailable, TripwireError } from "../sdk/tripwire.mjs";
import { wrapTools } from "../sdk/adapters/tools.mjs";

let server, base, flaky = 0, reports = [];

before(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (status, obj, headers = {}) => {
        res.writeHead(status, { "content-type": "application/json", ...headers });
        res.end(JSON.stringify(obj));
      };
      if (req.url === "/token") return send(200, { access_token: "t", expires_in: 3600 });
      if (req.url === "/badtoken") return send(401, { error: "access_denied" });
      if (req.url === "/api/ingest") {
        if (flaky > 0) { flaky--; return send(503, { error: "down" }); }
        const b = JSON.parse(body);
        reports.push(b);
        if (b.action_type.endsWith("deny.me")) return send(201, { event_id: "e-deny", status: "denied", risk: { reason: "Blocked by policy" } });
        if (b.action_type === "risky") return send(201, { event_id: "e-risky", status: "pending", risk: { reason: "r" } });
        if (b.action_type === "bad") return send(400, { error: "nope" });
        return send(201, { event_id: "e-ok", status: "allowed", risk: {} });
      }
      if (req.url.startsWith("/api/actions/e-risky")) return send(200, { status: "approved", proceed: true });
      send(404, {});
    });
  }).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const make = (o = {}) =>
  new Tripwire({ baseUrl: base, tokenUrl: `${base}/token`, audience: "a", clientId: "c", clientSecret: "s", retries: 0, ...o });
const act = (actionType) => ({ sessionId: "s1", actionType, target: "x", payload: {} });

test("allowed action runs, risky waits for approval, denied never runs", async () => {
  const tw = make();
  assert.equal(await tw.guard(act("safe"), () => "ran"), "ran");
  assert.equal(await tw.guard(act("risky"), () => "ran after approval"), "ran after approval");
  let ran = false;
  await assert.rejects(() => tw.guard(act("deny.me"), () => (ran = true)), TripwireDenied);
  assert.equal(ran, false);
});

test("retries transient 503 then succeeds", async () => {
  flaky = 2;
  const tw = make({ retries: 2 });
  assert.equal(await tw.guard(act("safe"), () => "ok"), "ok");
});

test("fail-closed (default) blocks when Tripwire is unreachable", async () => {
  const tw = make({ baseUrl: "http://127.0.0.1:1" });
  let ran = false;
  await assert.rejects(() => tw.guard(act("safe"), () => (ran = true)), TripwireUnavailable);
  assert.equal(ran, false);
});

test("fail-open runs, allowlist runs only listed actions, per-call override works", async () => {
  const dead = "http://127.0.0.1:1";
  assert.equal(await make({ baseUrl: dead, failMode: "open" }).guard(act("anything"), () => "ran"), "ran");

  const al = make({ baseUrl: dead, failMode: "allowlist", offlineAllow: ["fs.read", /^search\./] });
  assert.equal(await al.guard(act("fs.read"), () => "ran"), "ran");
  assert.equal(await al.guard(act("search.web"), () => "ran"), "ran");
  await assert.rejects(() => al.guard(act("fs.delete"), () => "ran"), TripwireUnavailable);

  const closed = make({ baseUrl: dead });
  assert.equal(await closed.guard(act("x"), () => "ran", { failMode: "open" }), "ran");
});

test("onFailMode is told when the safety mode decided", async () => {
  const seen = [];
  const tw = make({ baseUrl: "http://127.0.0.1:1", failMode: "open", onFailMode: (i) => seen.push(i.allowed) });
  await tw.guard(act("x"), () => 1);
  assert.deepEqual(seen, [true]);
});

test("rejected requests and bad credentials never fail open", async () => {
  await assert.rejects(() => make({ failMode: "open" }).guard(act("bad"), () => "ran"), TripwireError);
  await assert.rejects(() => make({ failMode: "open", tokenUrl: `${base}/badtoken` }).guard(act("safe"), () => "ran"), TripwireError);
});

test("wrapTools guards execute, func and invoke tools", async () => {
  reports = [];
  const tw = make();
  const calls = [];
  const tools = wrapTools(tw, { sessionId: "sess" }, {
    echo: { execute: async (i) => (calls.push(i), "e") },
    lc: { name: "lc", func: async (i) => (calls.push(i), "f") },
  });
  assert.equal(await tools.echo.execute({ command: "ls" }), "e");
  assert.equal(await tools.lc.func("hello"), "f");
  assert.deepEqual(reports.map((r) => r.action_type), ["tool.echo", "tool.lc"]);
  assert.equal(reports[0].target, "ls");
  assert.throws(() => wrapTools(tw, { sessionId: "s" }, { broken: {} }), /cannot wrap/);
  // wrapping twice does not double-report
  reports = [];
  wrapTools(tw, { sessionId: "sess" }, tools);
  await tools.echo.execute({ command: "x" });
  assert.equal(reports.length, 1);
});

test("MCP proxy forwards allowed calls and refuses denied ones", async () => {
  const fake = `
    process.stdin.setEncoding("utf8");
    let buf = "";
    process.stdin.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1);
      const m = JSON.parse(l); console.log(JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "server:" + m.method + ":" + (m.params?.name ?? "") }] } })); } });`;
  const p = spawn(process.execPath, ["sdk/adapters/mcp-proxy.mjs", "--", process.execPath, "-e", fake], {
    env: { ...process.env, TRIPWIRE_URL: base, TRIPWIRE_TOKEN_URL: `${base}/token`, TRIPWIRE_AUDIENCE: "a", TRIPWIRE_CLIENT_ID: "c", TRIPWIRE_CLIENT_SECRET: "s" },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const lines = [];
  let buf = "";
  p.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); }
  });
  const send = (m) => p.stdin.write(JSON.stringify(m) + "\n");
  send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "safe", arguments: {} } });
  send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "deny.me", arguments: {} } });
  for (let i = 0; i < 100 && lines.length < 3; i++) await new Promise((r) => setTimeout(r, 50));
  p.kill();
  const byId = Object.fromEntries(lines.map((l) => [l.id, l]));
  assert.equal(byId[1].result.content[0].text, "server:tools/list:");
  assert.equal(byId[2].result.content[0].text, "server:tools/call:safe");
  assert.equal(byId[3].result.isError, true);
  assert.match(byId[3].result.content[0].text, /Blocked by Tripwire/);
});

test("Claude Code hook: allow is silent, deny emits a deny decision", async () => {
  const run = (tool) =>
    new Promise((resolve) => {
      const p = spawn(process.execPath, ["sdk/adapters/claude-code-hook.mjs"], {
        env: { ...process.env, TRIPWIRE_URL: base, TRIPWIRE_TOKEN_URL: `${base}/token`, TRIPWIRE_AUDIENCE: "a", TRIPWIRE_CLIENT_ID: "c", TRIPWIRE_CLIENT_SECRET: "s" },
      });
      let out = "";
      p.stdout.on("data", (d) => (out += d));
      p.on("close", (code) => resolve({ code, out }));
      p.stdin.end(JSON.stringify({ session_id: "s", tool_name: tool, tool_input: { command: "ls" } }));
    });
  const ok = await run("safe");
  assert.equal(ok.code, 0);
  assert.equal(ok.out, "");
  const denied = await run("deny.me");
  assert.equal(JSON.parse(denied.out).hookSpecificOutput.permissionDecision, "deny");
});
