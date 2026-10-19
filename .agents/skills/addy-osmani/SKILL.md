---
name: addy-osmani-engineering
description: Apply production-oriented specification, incremental implementation, testing, debugging, review, and shipping practices to MJ Studio's studio and client workflows across mobile and web.
---

# Addy Osmani-inspired engineering methods

This is a project integration guide, not a verbatim copy of the upstream skill pack. Consult the official repository for its complete skills and license.

## Execution rules
- Define the user outcome and observable acceptance criteria before significant implementation.
- Include both studio and client acceptance criteria when a workflow crosses both sides.
- Break work into small, ordered, reviewable slices.
- Prefer test-first development when practical; tests and reproducible evidence are proof, not confidence.
- Investigate source code and primary evidence before assuming causes.
- Debug the smallest reproducible failure and verify the fix with a regression check.
- Keep interfaces and abstractions simple; avoid speculative generality.
- Review correctness, user journey, security, privacy, accessibility, performance, maintainability, and failure states.
- Measure performance before optimizing; image-heavy experiences require particular attention to real loading behavior.
- Preserve project conventions and avoid unrelated cleanup.
- Report checks honestly, including unavailable tools and failures.

## Task lifecycle
1. **Specify:** identify the actor, user goal, current friction, constraints, acceptance criteria, and non-goals.
2. **Plan:** inspect dependencies, split work into small vertical slices, identify risk, and define verification per slice.
3. **Build:** implement one slice at a time; keep changes focused.
4. **Test:** verify normal and edge paths for every affected actor, including responsive mobile and desktop/web behavior where relevant.
5. **Review:** inspect the diff and assess the quality dimensions relevant to the change.
6. **Ship:** report evidence, residual risks, and rollback considerations. Shipping actions require authorization where applicable.

## MJ Studio quality gates
- **Studio productivity:** avoid unnecessary manual coordination; make gallery and feedback status actionable and unambiguous where those capabilities exist.
- **Client confidence:** make access, review actions, feedback acknowledgement, and download permissions understandable.
- **Feedback integrity:** bind feedback/selections to the correct gallery/photo, persist reliably, and handle retry and duplicate submission.
- **Authorization:** validate permissions on the server; hidden UI controls are not security boundaries.
- **Privacy:** avoid leaking gallery secrets, PINs, client identifiers, or private images.
- **Delivery lifecycle:** verify gallery create/share/update/expire/revoke/archive behavior as relevant to the existing product.
- **Accessibility and responsive behavior:** keyboard access, semantic controls, focus visibility, contrast, labels, touch usability, and narrow/wide layouts.
- **Image performance:** inspect actual image sizing, loading, delivery, and failure behavior before changing caching, preloading, or rendering strategy.
- **Failure recovery:** cover empty, loading, expired, revoked, unauthorized, offline, and server-error states as relevant.
- **Regression:** run targeted tests first, then broader available checks based on risk.

## Upstream
- Official Addy Osmani Agent Skills: https://github.com/addyosmani/agent-skills
- Use the full or selected upstream skills in the agent environment when their complete workflows are needed. This guide defines the project-specific integration and quality gates for MJ Studio.
