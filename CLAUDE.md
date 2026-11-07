The plan in short

What we’re building: Tripwire, a web app that acts as a flight recorder and seatbelt for AI agents. Agents send every action to it. Gemini scores each action’s risk. Risky actions pause until a human approves them with MFA. Everything is logged and charted live.

Why it scores well: it’s a fresh idea (agent governance), it uses every sponsor tool for a real purpose, and it demos cleanly.

How the tools fit:

Auth0: login, agent tokens, and step-up MFA to approve risky actions.
Tiger Data: a hypertable of agent events, with continuous aggregates powering the live dashboard.
Gemini: risk scoring, an “Investigator” chat, incident summaries and similar-incident search.
Vultr + GoDaddy: the app runs in Docker on a Vultr VM at your custom domain.
Entire: records every Claude Code session as checkpoints while you build, which gives you a “built with agents, fully auditable” slide.

Platform: web app (Next.js), plus a tiny agent SDK for the demo.

Time:

Minimum demo: ~8–12 h for a team of 2–3, ~16–20 h solo.
Competitive build: ~16–24 h for a team, ~28–36 h solo.

Build order:

First hour: set up all accounts, run entire enable, and deploy a hello-world with login on your real domain.
Next: database schema, then the ingest API, then Gemini scoring, then the approval flow with MFA.
Then: the live dashboard, Investigator chat and similar incidents.
Last: hardening, seed data, a backup demo video and pitch rehearsal.

Demo: a simulator plays a fixed scenario: normal work, a risky action gets blocked, you approve with MFA, then you ask the Investigator what happened. It runs in 3 minutes and is the same every time.