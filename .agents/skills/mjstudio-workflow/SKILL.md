---
name: mjstudio-workflow
description: Route MJ Studio product and engineering work through a coherent clarify-inspect-plan-build-verify-review workflow. Use for feature work, bugs, architecture, UI, security, performance, and release readiness.
---

# MJ Studio workflow

This is the project-specific orchestrator. Follow the repository's `AGENTS.md` first.

## Choose the right depth
- **Tiny, local change:** inspect context, make the smallest patch, run focused checks, review the diff.
- **Bug or behavior change:** reproduce or establish a failing test, identify root cause, implement a minimal fix, run regression checks.
- **Feature or UX change:** clarify user outcome and constraints, inspect the existing flow, define acceptance criteria, plan vertical slices, implement incrementally, test states and accessibility.
- **Architecture, security, data model, or cross-cutting change:** map current behavior and constraints first; compare options and trade-offs; record decisions when they will matter later; then plan and verify a small migration path.
- **Release or review request:** assess against explicit acceptance criteria, test evidence, security/privacy, accessibility, performance, and operational failure modes. Findings must identify evidence and impact.

## Integrated sequence
1. **Matt Pocock-inspired discovery:** Ask one precise question only when needed. Separate facts, assumptions, and decisions. Explore the problem before jumping to implementation. For broad architecture choices, use a Wayfinder-style map of the current system, constraints, candidate paths, trade-offs, and next decision.
2. **Addy Osmani-inspired execution:** Turn the selected direction into a small plan with acceptance criteria. Implement in incremental, testable slices. Prefer tests as proof, source-driven investigation, focused debugging, and review gates.
3. **Convergence:** Discovery ends when the problem, constraints, and direction are sufficiently clear; it must not become endless questioning. Execution starts only after the decision is actionable. Verification is mandatory and independent of confidence.
4. **Human control:** Do not make product decisions, destructive data changes, deploy, merge, or spend money without authorization when such authorization is required.

## MJ Studio-specific checks
- Gallery access: unauthorized, expired, revoked, archived, and malformed access attempts.
- Client decisions: selected/favourited/disliked images and feedback map to the correct asset and persist consistently.
- Permissions: view-only versus view-and-download; per-photo downloads; no accidental ZIP or bulk exposure.
- Photographer operations: create, send, update, expire, revoke, and archive galleries without ambiguous states.
- Privacy: no client information or credentials in logs; server-side authorization is authoritative; never trust client-only permission checks.
- UI: loading, empty, success, error, and retry states; mobile layout; keyboard operation; accessible names and focus; clear download/permission messaging.
- Reliability: loading and error boundaries, duplicate submissions, network failure, storage failure, and cleanup behavior where relevant.

## Required output
For meaningful changes, state:
- problem and intended outcome;
- plan / acceptance criteria;
- files and behavior changed;
- checks run with pass/fail results;
- remaining risks or explicit non-goals.

Do not invent test results or claim an unrun check passed.
