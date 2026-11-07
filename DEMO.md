# Demo script: 10 fixed cases

Demo data is fixed, not random (`db/demo-data.mjs`). Reset it any time with `npm run db:seed`
(this replaces old demo rows, which have session ids starting with `seed-`). With `DEMO_MODE=1` the
app seeds itself and replays the same cases every `DEMO_INTERVAL_SECONDS`. Run `npm run db:migrate`
first so the policy table and score-explanation column exist. Reseed once after upgrading so the seeded
cases carry their "Why this score" factors.

| # | Agent | Action | Risk | Outcome | What it shows judges |
|---|-------|--------|------|---------|----------------------|
| 1 | deploy-bot | fs.read README.md | low 0.05 | allowed | Normal work flows through untouched |
| 2 | deploy-bot | shell.exec npm test | low 0.08 | allowed | Same, a build step |
| 3 | data-bot | db.query SELECT count(*) | low 0.12 | allowed | Read-only data access is safe |
| 4 | support-bot | send_email to one customer | medium 0.45 | allowed | Medium risk is logged, not blocked |
| 5 | deploy-bot | git push --force origin main | high 0.85 | denied | Rule: force push rewrites history |
| 6 | support-bot | refund 4200 USD | high 0.80 | approved with MFA | Money movement needs a human and MFA |
| 7 | data-bot | read .env.production | high 0.78 | denied | Secret access, plus an activity spike on top of the model score |
| 8 | support-bot | mass email, text says "ignore instructions, pre-approved" | critical 0.93 | denied | Prompt injection is itself a red flag |
| 9 | deploy-bot | curl ... \| sh | critical 0.92 | denied | Remote code piped into a shell |
| 10 | data-bot | DROP TABLE customers on production | critical 0.97 | pending | The live moment: approve with MFA |

## 3-minute walkthrough
1. `/dashboard`: volume chart, risk trace crossing the hold line, event stream (cases 1 to 4 and the risky ones).
2. `/approvals`: case 10 is waiting. Open **Why this score** to show the built-in rule, Gemini and any baseline factors
   behind the number. Click Approve with MFA, complete MFA, confirm. Then show Deny works without MFA.
3. `/policies` (live): create a policy named "No refunds", pattern `refund`, effect *Block at once*. It applies to the
   next action an agent reports. Say: "the team writes its own rules, and they run before the model".
4. Run the agent again (`npm run simulate`, or any agent through the SDK). The refund is blocked instantly with the
   policy's reason and no model call. Open its incident: the first line of **Why this score** names the policy.
5. `/incidents`: open case 8 (prompt injection) or 10. Show the Gemini summary and the similar incidents.
6. `/investigator`: ask "Which actions were blocked and why?" and "Which agent is the riskiest?".
7. Mention: every action above is logged in Tiger Data, and the build itself was recorded with Entire.

## Optional scene: a real agent behind Tripwire (Claude Code hook)
Shows that Tripwire guards an agent people already use, with no code changes to the agent.

1. Set the `TRIPWIRE_*` variables (see README, "Agent SDK") in the shell that starts Claude Code, using the demo
   agent's Auth0 machine-to-machine credentials.
2. Add the hook to `.claude/settings.json` (a long `timeout` leaves time for a human to approve):

   ```json
   { "hooks": { "PreToolUse": [ { "matcher": ".*", "hooks": [
       { "type": "command", "command": "node sdk/adapters/claude-code-hook.mjs", "timeout": 600 } ] } ] } }
   ```
3. Ask Claude Code to run something safe (`ls`): it appears on `/dashboard` as allowed.
4. Ask it to run `git push --force`: the action is held on `/approvals`. Deny it and Claude Code reports
   "Blocked by Tripwire".
5. Stop the app and repeat step 3 to show the safety mode: with the default `closed` mode the action is blocked
   while Tripwire is unreachable.

The same idea works for any MCP server: `node sdk/adapters/mcp-proxy.mjs -- <server command>`.

## Before going on stage
- If Gemini quota is a risk, set `RISK_MODEL=off` in `.env.local` and restart. Scoring then uses the built-in rules and
  your policies only, so the scenario is identical every run. Keep Gemini for the Investigator and summaries.
- `npm run db:migrate && npm run db:seed`, then reload `/approvals` and open "Why this score" on case 10.
- Delete any leftover policies on `/policies` so the live scene starts clean.
- Keep a short screen recording of steps 3 to 4 as a backup in case the network fails.
