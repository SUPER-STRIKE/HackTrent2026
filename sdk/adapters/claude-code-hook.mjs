#!/usr/bin/env node
// Claude Code PreToolUse hook: sends every tool call to Tripwire before Claude Code runs it.
//
// .claude/settings.json:
//   { "hooks": { "PreToolUse": [ { "matcher": ".*", "hooks": [
//       { "type": "command", "command": "node sdk/adapters/claude-code-hook.mjs", "timeout": 600 } ] } ] } }
//
// Configure with the TRIPWIRE_* environment variables (see sdk/env.mjs). Low-risk calls pass through to Claude
// Code's normal permission flow untouched. Held calls wait for a human (keep "timeout" high enough, in seconds).
// Denied, timed-out or (in fail-closed mode) unreachable calls are blocked with a reason Claude can read.
// TRIPWIRE_HOOK_SKIP = comma-separated tool names to skip (for example Read,Glob,Grep).

import { tripwireFromEnv } from "../env.mjs";
import { TripwireDenied, TripwireUnavailable } from "../tripwire.mjs";

const MAX_WAIT_MS = Number(process.env.TRIPWIRE_HOOK_WAIT_SECONDS || 540) * 1000;

// Exits by setting exitCode and returning, never process.exit(): on Windows, exiting while a fetch is still
// closing can crash Node.
function block(reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return block("Tripwire hook could not read the tool call.");
  }

  const skip = (process.env.TRIPWIRE_HOOK_SKIP ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (skip.includes(input.tool_name)) return;

  let tw;
  try {
    tw = tripwireFromEnv(process.env, { agentName: process.env.TRIPWIRE_AGENT_NAME || "claude-code" });
  } catch (err) {
    return block(`Tripwire is not configured: ${err.message}`);
  }

  const toolInput = input.tool_input ?? {};
  const target = toolInput.command ?? toolInput.file_path ?? toolInput.url ?? toolInput.pattern ?? undefined;

  try {
    await tw.guard(
      {
        sessionId: input.session_id ?? "claude-code",
        actionType: `claude.${input.tool_name}`,
        target: typeof target === "string" ? target.slice(0, 500) : undefined,
        payload: { input: toolInput, cwd: input.cwd },
      },
      () => undefined,
      { timeoutMs: MAX_WAIT_MS },
    );
    // Allowed: print nothing so Claude Code's own permission flow continues.
  } catch (err) {
    if (err instanceof TripwireDenied) return block(`Blocked by Tripwire: ${err.message}`);
    if (err instanceof TripwireUnavailable) return block(`Tripwire is unreachable and the safety mode is "${tw.failMode}", so this action is blocked.`);
    return block(`Tripwire error: ${err.message}`);
  }
}

await main();
