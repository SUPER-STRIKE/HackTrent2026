# Tripwire build workflow

Derived from the project plan (flight recorder and seatbelt for AI agents: Next.js, Auth0, Tiger Data, Gemini, Vercel + GoDaddy, Entire).

Each phase lists the model and reasoning effort to use for the Claude Code session doing it.

| # | Phase | Work | Model | Effort | Est. (team of 2-3) |
|---|-------|------|-------|--------|--------------------|
| 1 | Setup | Create accounts, run `entire enable`, deploy hello-world with Auth0 login on the real domain (Vercel + GoDaddy DNS) | Sonnet 5.5 | low | 1 h |
| 2 | Database schema | Tiger Data hypertable of agent events, continuous aggregates for the dashboard | Opus 5.5 | medium | 1-2 h |
| 3 | Ingest API | Endpoint agents post actions to, agent-token auth (Auth0) | Sonnet 5.5 | medium | 2 h |
| 4 | Gemini risk scoring | Score each action, threshold to pause or allow | Opus 5.5 | high | 2-3 h |
| 5 | Approval flow with MFA | Pending-action queue, Auth0 step-up MFA to approve or deny, resume the agent | Opus 5.5 | high | 3-4 h |
| 6 | Live dashboard | Charts over continuous aggregates, live feed | Sonnet 5.5 | medium | 3 h |
| 7 | Investigator chat + similar incidents | Gemini chat over event history, incident summaries, similar-incident search | Opus 5.5 | high | 3-4 h |
| 8 | Agent SDK + simulator | Tiny SDK, fixed 3-minute scenario: normal work, risky action blocked, MFA approve, ask Investigator | Sonnet 5.5 | medium | 2 h |
| 9 | Hardening and seed data | Error handling, security pass, seed data | Sonnet 5.5 | medium | 2 h |
| 10 | Pitch prep | Backup demo video, rehearsal, "built with agents, fully auditable" slide from Entire checkpoints | Haiku 5.5 | low | 1-2 h |

## Rules of thumb

- **Opus 5.5, high**: security-sensitive or LLM-prompt-heavy parts (scoring, MFA approval, Investigator).
- **Sonnet 5.5, medium**: routine feature work (API, dashboard, SDK).
- **Sonnet 5.5 or Haiku 5.5, low**: setup, config and writing tasks.
- Run `/code-review high` after phases 3 and 5 (auth and approval paths).
- Entire records each session as checkpoints automatically; commit at the end of every phase.

## Dependencies

1 -> 2 -> 3 -> 4 -> 5 -> (6, 7 in parallel) -> 8 -> 9 -> 10
