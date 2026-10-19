---
name: addy-osmani-engineering
description: Apply production-oriented specification, incremental implementation, test-driven development, debugging, code review, performance, accessibility, and shipping practices. Use after the problem and intended direction are clear.
---

# Addy Osmani-inspired engineering methods

This file is a project integration guide, not a verbatim copy of the upstream skill pack. Consult the official repository for its complete skills and license.

## Execution rules
- Define observable acceptance criteria before significant implementation.
- Break work into small, ordered, reviewable slices.
- Prefer test-first development when practical; tests and reproducible evidence are proof, not confidence.
- Investigate source code and primary evidence before assuming causes.
- Debug the smallest reproducible failure and verify the fix with a regression check.
- Keep interfaces and abstractions simple; avoid speculative generality.
- Review correctness, security, privacy, accessibility, performance, maintainability, and failure states.
- Measure performance before optimizing. Do not make unsupported performance claims.
- Preserve existing project conventions and avoid unrelated cleanup.
- Report checks honestly, including unavailable tools and failures.

## Task lifecycle
1. **Specify:** user outcome, constraints, acceptance criteria, and explicit non-goals.
2. **Plan:** dependencies, small vertical slices, risk, and verification per slice.
3. **Build:** implement one slice at a time; keep changes focused.
4. **Test:** exercise expected behavior, edge cases, and regression paths.
5. **Review:** inspect the diff and assess quality dimensions relevant to the change.
6. **Ship:** summarize evidence, residual risks, and rollback considerations. Shipping actions require explicit authorization where applicable.

## MJ Studio quality gates
- **Authorization:** validate access on the server; do not rely on hidden UI controls.
- **Privacy:** avoid leaking gallery secrets, PINs, client identifiers, and private images.
- **State correctness:** verify gallery lifecycle and feedback persistence, including retries and duplicate submissions.
- **Accessibility:** keyboard access, semantic controls, focus visibility, contrast, labels, and responsive layouts.
- **Performance:** inspect actual loading behavior and image delivery before changing caching, preloading, or rendering strategy.
- **Failure handling:** cover empty, loading, expired, revoked, unauthorized, offline, and server-error states as relevant.
- **Regression:** run targeted tests first, then broader available checks based on risk.

## Upstream
- Official Addy Osmani Agent Skills: https://github.com/addyosmani/agent-skills
- The upstream pack includes focused skills for specification, planning, incremental implementation, testing, debugging, review, frontend engineering, browser testing, and shipping. Install the full or selected upstream skills in the agent environment if their complete workflows are needed; this repository guide defines how to combine them for MJ Studio.
