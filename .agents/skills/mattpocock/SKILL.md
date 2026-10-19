---
name: mattpocock-methods
description: Apply clarification, Socratic grilling, Wayfinder-style exploration, and evidence-led product framing before MJ Studio implementation. Use for ambiguous requirements, user journeys, architecture decisions, and learning.
---

# Matt Pocock-inspired methods

This is a project integration guide, not a verbatim distribution of an upstream skill pack. Consult the upstream project's own installation and license instructions for its full skills.

## Start with the service problem
MJ Studio is a local photography studio seeking faster photo delivery, easier client feedback, improved productivity, and sometimes a closer client role in the experience. Both studio staff and clients use the mobile/web product.

Before designing a feature, clarify:
- Who is experiencing the problem: studio staff, client, or both?
- What are they trying to accomplish, and what do they do today?
- Where is time, confusion, repeated communication, or lost feedback occurring?
- What evidence supports the problem and how would improvement be observed?
- Is the task about the core delivery workflow or an optional enhancement to the service?

Do not assume the answer to these questions. Use repository evidence first; ask one high-value question when the missing answer changes the plan.

## Operating principles
- Understand the problem before designing the solution.
- Distinguish **facts**, **assumptions**, **hypotheses**, and **decisions**.
- Treat product intent as the user's decision; own the investigation and clarity.
- Prefer the smallest explicit next step over a sprawling plan.
- Use concise explanations. When the user is learning, evaluate their reasoning before giving a model answer.
- Stop questioning when enough information exists to act safely.

## Wayfinder-style exploration
For architectural, product, or high-impact work:
1. State the user problem, affected actor, and why it matters to the service.
2. Map the current studio and client journeys from source code, tests, docs, and any supplied research.
3. Identify friction, manual work, uncertainty, failure states, and hand-offs.
4. Compare options, including the smallest viable change and the cost of doing nothing.
5. Evaluate trade-offs: client experience, studio productivity, complexity, reversibility, security, performance, maintenance, and cost.
6. Separate verified findings from hypotheses and missing evidence.
7. Recommend a path and define observable success; surface unresolved product decisions instead of silently turning assumptions into requirements.

## Grilling protocol
Ask a single focused question only when repository evidence cannot resolve a consequential ambiguity. Explain why the answer changes the plan when useful. Do not repeatedly ask already-settled questions or use questioning as a substitute for inspection.

## Teaching protocol
When asked to teach:
1. Establish the learner's current understanding with a small prompt.
2. Explain the mental model before a drill.
3. Give one exercise at a time.
4. Critique reasoning directly and specifically.
5. Link to one relevant primary source or reference.

## Hand-off to execution
Once the problem, constraints, and direction are sufficiently clear, use `.agents/skills/addy-osmani/SKILL.md` for specification, implementation, testing, review, and shipping discipline.

## Upstream
- Matt Pocock skills ecosystem: https://github.com/mattpocock/skills
- Follow the upstream project's own installation and license instructions when installing its full skill pack. This concise adapter is not the upstream implementation.
