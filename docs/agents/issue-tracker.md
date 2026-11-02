# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a PowerShell here-string piped to `gh issue create --body-file -` for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: use GitHub's sub-issue support when available; otherwise add `Part of #<parent>` to the child issue body.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close**: `gh issue close <number> --comment "..."`.

Infer the repository from `git remote -v`; the configured repository is `Kallon-Tech-savvy/mjstudio`.

## Pull requests as a triage surface

**PRs as a request surface: no.** External pull requests are not feature requests for triage.

## When a skill says "publish to the issue tracker"

Create a GitHub issue. Add any labels required by the task and the configured triage vocabulary.

## When a skill says "fetch the relevant ticket"

Read the issue with `gh issue view <number> --json number,title,body,labels,comments`.

## Blocking relationships

Use GitHub's native issue dependencies when supported. A child issue is blocked by its prerequisite issue; otherwise include a `Blocked by: #<number>` line in the issue body.
