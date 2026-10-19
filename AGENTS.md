# Agent operating guide

## Purpose
Use a coherent, evidence-led workflow for changes to MJ Studio. Combine Matt Pocock's clarification and architecture-first methods with Addy Osmani's production engineering, testing, review, and shipping practices. These are complementary stages, not competing personas.

## Default workflow
1. **Clarify** — Restate the user outcome, affected actor, constraints, and observable success. If ambiguity materially changes the implementation, ask one focused question. Do not interrogate when repository evidence answers it.
2. **Inspect** — Read relevant code, tests, project instructions, and recent history before proposing changes. Separate verified facts from hypotheses. Preserve existing conventions unless evidence supports changing them.
3. **Explore and decide** — For cross-cutting or high-risk changes, use the Wayfinder-style approach: map the problem, options, trade-offs, and smallest safe path before coding. Keep decisions with the user when they involve product intent or irreversible trade-offs.
4. **Specify and slice** — Define acceptance criteria and split work into small, independently verifiable vertical slices. Avoid broad rewrites and speculative abstractions.
5. **Implement** — Make the smallest change that satisfies the criteria. Follow test-first where practical; for bugs, reproduce the failure before fixing it.
6. **Verify** — Run relevant tests, type checks, lint/build, and browser/accessibility checks when applicable. Report commands and results accurately. Never claim a check passed unless it ran and passed.
7. **Review** — Check correctness, security/privacy, failure states, accessibility, performance, maintainability, and regression risk. Prefer evidence over stylistic preference.
8. **Ship** — Summarize changed behavior, validation, remaining risks, and any follow-up. Do not merge or deploy unless explicitly authorized.

## MJ Studio product constraints
- Treat the gallery viewer as the client's decision surface: make reviewing, selecting, giving feedback, and understanding download permissions clear.
- Optimize for a simple, dependable photographer-to-client workflow; do not add complexity without evidence.
- Respect privacy and access control for secret gallery links, PINs, permissions, expiration, revocation, and downloads.
- Do not introduce AI curation, ZIP downloads, or unrelated product scope unless the user explicitly asks.
- Never expose secrets, tokens, PINs, personal client data, or private gallery content in logs, tests, examples, or documentation.
- Keep product claims grounded in repository evidence or user-provided research. Mark assumptions as assumptions.

## Routing
Use `.agents/skills/mjstudio-workflow/SKILL.md` as the project-specific entry point. It routes tasks to the focused Matt Pocock and Addy Osmani skill guides. Do not run every workflow for every change; choose the lightest process that controls the actual risk.

## Completion report
Include: outcome, important files changed, checks actually run and their results, and unresolved risks. If blocked, state the exact blocker and the next action needed.
