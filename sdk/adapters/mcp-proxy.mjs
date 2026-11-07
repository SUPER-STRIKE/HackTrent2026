#!/usr/bin/env node
// MCP proxy: sits between an MCP client and any stdio MCP server and sends every tools/call to Tripwire first.
// The client and the server need no changes.
//
//   node sdk/adapters/mcp-proxy.mjs -- npx -y @modelcontextprotocol/server-filesystem /work
//
// In the client's MCP config, replace the server command with the line above. Configure with TRIPWIRE_* variables
// (see sdk/env.mjs). Blocked calls return a normal tool error the model can read. Every other message passes
// through untouched. MCP stdio framing is one JSON message per line.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { tripwireFromEnv } from "../env.mjs";
import { TripwireDenied } from "../tripwire.mjs";

const sep = process.argv.indexOf("--");
if (sep === -1 || sep === process.argv.length - 1) {
  console.error("usage: mcp-proxy.mjs -- <server command> [args...]");
  process.exit(2);
}
const [cmd, ...args] = process.argv.slice(sep + 1);
const tw = tripwireFromEnv(process.env, { agentName: process.env.TRIPWIRE_AGENT_NAME || `mcp:${cmd}` });
const sessionId = process.env.TRIPWIRE_SESSION_ID || `mcp-${process.pid}`;

const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "inherit"], shell: process.platform === "win32" && /^(npx|npm|pnpm|yarn|.*\.(cmd|bat))$/i.test(cmd) });
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error(`mcp-proxy: cannot start ${cmd}: ${err.message}`);
  process.exit(1);
});

const toClient = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const toServer = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");
createInterface({ input: child.stdout }).on("line", (line) => process.stdout.write(line + "\n"));

function refuse(id, text) {
  toClient({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text }] } });
}

async function handleToolCall(msg) {
  const { name, arguments: toolArgs } = msg.params ?? {};
  const target = toolArgs?.command ?? toolArgs?.path ?? toolArgs?.url ?? toolArgs?.query ?? undefined;
  try {
    await tw.guard(
      { sessionId, actionType: `mcp.${name}`, target: typeof target === "string" ? target.slice(0, 500) : undefined, payload: { arguments: toolArgs } },
      () => toServer(msg),
    );
  } catch (err) {
    refuse(msg.id, err instanceof TripwireDenied ? `Blocked by Tripwire: ${err.message}` : `Blocked: Tripwire could not approve this call (${err.message})`);
  }
}

createInterface({ input: process.stdin }).on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return child.stdin.write(line + "\n");
  }
  if (msg?.method === "tools/call" && msg.id !== undefined) handleToolCall(msg);
  else child.stdin.write(line + "\n");
});
process.stdin.on("end", () => child.stdin.end());
