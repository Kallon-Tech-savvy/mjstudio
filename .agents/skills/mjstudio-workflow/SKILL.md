---
name: mjstudio-workflow
description: Route MJ Studio product and engineering work through a coherent discovery-to-shipping workflow grounded in the photography studio's and its clients' journeys. Use for product, UX, bugs, architecture, security, performance, and release readiness.
---

# MJ Studio workflow

This is the project-specific orchestrator. Follow the repository's `AGENTS.md` first.

## Product outcome
MJ Studio serves a local photography studio that wants to deliver photos faster, collect client feedback with less manual coordination, improve productivity, and sometimes bring clients closer to the service experience. The application must work for both studio staff and clients across mobile and web.

For each task, identify which outcome it supports:
- faster, clearer photo delivery;
- less manual follow-up and response tracking for studio staff;
- easier and more confident photo review, feedback, or selection for clients;
- a more personal, professional service experience;
- reliability, privacy, accessibility, or maintainability that protects these outcomes.

These are goals, not a mandate to build every possible feature. Do not assume the business workflow, client behavior, or required features when repository evidence is missing.

## Choose the right depth
- **Tiny, local change:** inspect context, make the smallest patch, run focused checks, review the diff.
- **Bug or behavior change:** reproduce or establish a failing test, identify root cause, implement a minimal fix, run regression checks.
- **Feature or UX change:** map the affected studio/client journey, inspect the existing flow, define acceptance criteria and edge states, implement incrementally, test responsiveness and accessibility.
- **Architecture, security, data model, or cross-cutting change:** map current behavior and constraints first; compare options and trade-offs; record decisions when useful; plan a small migration path.
- **Product review:** evaluate the journey from the actor's goal to completion. Identify friction, uncertainty, manual work, and failure recovery. Distinguish observed issues from hypotheses and recommendations.
- **Release or code review:** assess against acceptance criteria and test evidence, security/privacy, accessibility, performance, and operational failure modes.

## Integrated sequence
1. **Matt Pocock-inspired discovery:** Ask one precise question only when needed. Separate facts, assumptions, hypotheses, and decisions. Explore the problem and user journey before proposing UI or implementation. For broad architecture or product choices, map current state, constraints, candidate paths, trade-offs, and the next decision.
2. **Addy Osmani-inspired execution:** Turn the chosen direction into a small plan with acceptance criteria. Implement in incremental, testable slices. Prefer reproducible evidence, focused debugging, and review gates.
3. **Convergence:** Discovery ends when the problem, constraints, and direction are clear enough to act. Do not question endlessly. Execution begins when the decision is actionable. Verification is independent of confidence.
4. **Two-sided quality:** For changes touching a shared workflow, verify the studio's ability to manage work and the client's ability to complete their part. Include mobile and desktop/web where relevant.
5. **Human control:** Do not make consequential product decisions, destructive data changes, deploy, merge, or spend money without required authorization.

## Journey and quality checks
- **Studio workflow:** Can staff prepare/share a gallery, understand its status, see client feedback, and know the next action without unnecessary manual tracking?
- **Client workflow:** Can a client access the gallery, understand available actions and permissions, review photos, submit feedback or selections where supported, and retrieve permitted files?
- **Feedback loop:** Is feedback tied to the correct photo or gallery, clearly acknowledged, persisted, and visible to the studio? Can the client recover from a failed submission?
- **Delivery:** Are access, view/download permissions, individual photo downloads, expiry, revocation, and archive behavior clear and enforced?
- **Privacy and security:** Test unauthorized, expired, revoked, archived, and malformed access attempts. Server-side authorization is authoritative. Do not expose client data or credentials in logs.
- **Responsive usability:** Check narrow mobile layouts and desktop/web layouts, touch targets, keyboard access, focus, semantic labels, contrast, loading, empty, success, error, and retry states.
- **Reliability:** Consider network/storage failure, duplicate submissions, stale status, image loading, and cleanup behavior where relevant.
- **Scope control:** Do not introduce AI curation, ZIP/bulk downloads, or unrelated capabilities unless explicitly requested and justified.

## Required output
For meaningful work, state:
- user problem, affected actor(s), and intended outcome;
- evidence, assumptions, and acceptance criteria;
- plan and files/behavior changed;
- checks run with pass/fail results;
- remaining risks and explicit non-goals.

Never invent test results or claim an unrun check passed.
