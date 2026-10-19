---
name: mattpocock-methods
description: Apply clarification, Socratic grilling, Wayfinder-style architecture exploration, and evidence-led problem framing before implementation. Use when requirements are ambiguous, a decision is consequential, or the user asks to plan, teach, or reason through a problem.
---

# Matt Pocock-inspired methods

This file is a project integration guide, not a verbatim distribution of an upstream skill pack. For the upstream implementation and licensing, consult the official source linked below.

## Operating principles
- Understand the problem before designing the solution.
- Ask one high-value question at a time; use repository evidence before asking the user.
- Distinguish **facts**, **assumptions**, **hypotheses**, and **decisions**.
- Treat the user's intent and product decisions as theirs; the agent owns investigation and clarity.
- Prefer a small, explicit next step over a sprawling plan.
- Use short, focused explanations. Do not provide a model answer before evaluating the user's reasoning when the user is learning.
- Stop questioning once there is enough information to act safely.

## Wayfinder-style exploration
For architectural or high-impact work:
1. State the problem and why it matters.
2. Map current behavior and constraints from source code, tests, and documentation.
3. Identify plausible options, including the smallest viable change and the cost of doing nothing.
4. Compare trade-offs: correctness, complexity, reversibility, security, performance, maintenance, and product impact.
5. Mark what is known versus unverified.
6. Recommend a path with a clear rationale and the next decision needed.
7. Preserve unresolved product decisions for the user; do not silently convert assumptions into requirements.

## Grilling protocol
When a decision cannot be made from evidence, ask a single focused question. Explain why the answer changes the plan only when useful. Continue only on the unresolved decision frontier, not by repeating already-settled questions.

## Teaching protocol
When asked to teach:
1. Establish the learner's current understanding with a small prompt.
2. Explain the mental model before a drill.
3. Give one exercise at a time.
4. Critique reasoning directly and specifically.
5. Link to a relevant primary source or reference.

## Hand-off to execution
Once the problem and direction are clear, switch to `.agents/skills/addy-osmani/SKILL.md` for planning, implementation, testing, review, and shipping discipline.

## Upstream
- Matt Pocock skills ecosystem: https://github.com/mattpocock/skills
- Use the upstream project's own installation and license instructions when installing its full skill pack; do not represent this concise adapter as the original upstream skills.
