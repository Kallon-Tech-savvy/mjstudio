# Domain Docs

This repo uses a single-context domain documentation layout.

## Before exploring

- Read the root `GLOSSARY.md`, if it exists.
- Read relevant decisions in `docs/adr/`, if that directory exists.

If these files do not exist, proceed without assuming vocabulary or decisions. Add domain terms and architectural decisions only when they are established through actual work.

## Use the glossary's vocabulary

Use domain terms as defined in `GLOSSARY.md`. If a needed concept is not defined, use evidence from the codebase and flag the gap rather than inventing project terminology.

## Flag ADR conflicts

If proposed work conflicts with an existing ADR, identify the ADR and explain the conflict rather than silently overriding it.
