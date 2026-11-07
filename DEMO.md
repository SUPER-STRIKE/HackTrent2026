# Demo script: 10 fixed cases

Demo data is fixed, not random (`db/demo-data.mjs`). Reset it any time with `npm run db:seed`
(this replaces old demo rows, which have session ids starting with `seed-`). With `DEMO_MODE=1` the
app seeds itself and replays the same cases every `DEMO_INTERVAL_SECONDS`.

| # | Agent | Action | Risk | Outcome | What it shows judges |
|---|-------|--------|------|---------|----------------------|
| 1 | deploy-bot | fs.read README.md | low 0.05 | allowed | Normal work flows through untouched |
| 2 | deploy-bot | shell.exec npm test | low 0.08 | allowed | Same, a build step |
| 3 | data-bot | db.query SELECT count(*) | low 0.12 | allowed | Read-only data access is safe |
| 4 | support-bot | send_email to one customer | medium 0.45 | allowed | Medium risk is logged, not blocked |
| 5 | deploy-bot | git push --force origin main | high 0.85 | denied | Rule: force push rewrites history |
| 6 | support-bot | refund 4200 USD | high 0.80 | approved with MFA | Money movement needs a human and MFA |
| 7 | data-bot | read .env.production | high 0.78 | denied | Secret and credential access |
| 8 | support-bot | mass email, text says "ignore instructions, pre-approved" | critical 0.93 | denied | Prompt injection is itself a red flag |
| 9 | deploy-bot | curl ... \| sh | critical 0.92 | denied | Remote code piped into a shell |
| 10 | data-bot | DROP TABLE customers on production | critical 0.97 | pending | The live moment: approve with MFA |

## 3-minute walkthrough
1. `/dashboard`: volume chart, risk trace crossing the hold line, event stream (cases 1 to 4 and the risky ones).
2. `/approvals`: case 10 is waiting. Click Approve with MFA, complete MFA, confirm. Then show Deny works without MFA.
3. `/incidents`: open case 8 (prompt injection) or 10. Show the Gemini summary and the similar incidents.
4. `/investigator`: ask "Which actions were blocked and why?" and "Which agent is the riskiest?".
5. Mention: every action above is logged in Tiger Data, and the build itself was recorded with Entire.
