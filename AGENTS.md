# Agent operating guide

## Product purpose
MJ Studio is a local photography studio that wants to deliver client photos faster, collect feedback with less manual coordination, improve its productivity, and sometimes involve clients more closely in the experience. The product is a mobile- and web-accessible application for both studio staff and clients.

Optimize for the complete service, not just a gallery viewer:
- **Studio side:** prepare and share galleries, understand client responses, manage requested changes or selections, and know what needs attention next.
- **Client side:** open the gallery reliably, understand what they can do, review photos comfortably, give feedback or make selections when supported, and access delivered photos without confusion.
- **Shared outcome:** a dependable, professional experience that reduces avoidable messages and manual tracking while helping clients feel cared for.

Treat these as product goals, not proof that any specific feature is required. Inspect the repository and validate assumptions before expanding scope.

## Operating workflow
1. **Clarify** — Restate the user outcome, affected actor, constraints, and observable success. Ask one focused question only when ambiguity materially changes the implementation.
2. **Inspect** — Read relevant code, tests, product docs, and recent history before proposing changes. Separate verified facts from hypotheses.
3. **Explore and decide** — For cross-cutting or high-risk work, map current behavior, options, trade-offs, and the smallest safe path before coding. Keep product decisions with the user.
4. **Specify and slice** — Define acceptance criteria for both the studio and client where relevant. Split work into small, independently verifiable vertical slices.
5. **Implement** — Make the smallest change that satisfies the criteria. Reproduce bugs before fixing them; use test-first where practical.
6. **Verify** — Run relevant tests, type checks, lint/build, and browser/accessibility checks when applicable. Report only checks that actually ran.
7. **Review** — Assess user journey, correctness, security/privacy, accessibility, performance, reliability, and regression risk.
8. **Ship** — Summarize behavior changed, evidence, remaining risks, and follow-up. Do not merge or deploy without authorization.

## Product principles
- Treat the client gallery as a service interaction and decision surface, not simply a file grid.
- Respect both sides of the workflow: studio productivity and client confidence, clarity, and comfort.
- Prefer clear status, next steps, understandable permissions, and recoverable failures over cleverness.
- Optimize for mobile and web use; verify real responsive behavior rather than assuming one viewport represents both.
- Keep the experience professional and personal without adding unnecessary friction or features.
- Respect privacy and access control for gallery links, PINs, permissions, expiration, revocation, and downloads.
- Preserve known product constraints in the repository. Do not introduce AI curation, ZIP/bulk downloads, or other unrelated scope unless explicitly requested.
- Never expose secrets, tokens, PINs, personal client data, or private gallery content in logs, tests, examples, or documentation.
- Ground product claims in repository evidence or user research. Mark assumptions as assumptions.

## Routing
Use `.agents/skills/mjstudio-workflow/SKILL.md` as the project-specific entry point. It coordinates the Matt Pocock-inspired discovery guide and Addy Osmani-inspired engineering guide. Choose the lightest process that controls the actual risk.

## Completion report
Include the outcome, important files changed, checks actually run and results, and unresolved risks. For UX work, identify which user journey and actor were affected. If blocked, state the blocker and next action.
