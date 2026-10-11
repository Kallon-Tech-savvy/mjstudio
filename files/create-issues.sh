#!/usr/bin/env bash
# Run from the repo root after `gh auth login`.
set -e
cd "$(dirname "$0")"
R=Kallon-Tech-savvy/mjstudio

# Create triage labels the repo lacks (defaults already exist for bug / enhancement)
for l in needs-triage needs-info ready-for-agent ready-for-human; do gh label create "$l" --repo $R 2>/dev/null || true; done

gh issue create --repo $R --title "Migration 003 fails on databases whose photo assets lack the legacy status column" --label bug,ready-for-agent --body-file issues/01.md
gh issue create --repo $R --title "Demo seed fails on constraints and cannot produce a usable login" --label bug,ready-for-agent --body-file issues/02.md
gh issue create --repo $R --title "Client gallery page references an undefined `navigate`" --label bug,ready-for-agent --body-file issues/03.md
gh issue create --repo $R --title "Type mismatches: ClientPhoto preview and studio review response" --label bug,needs-triage --body-file issues/04.md
gh issue create --repo $R --title "Surface database errors clearly (pool errors, 503 mapping, startup check)" --label enhancement,ready-for-agent --body-file issues/05.md
gh issue create --repo $R --title "Reconcile PR #1 (fix/db-error-handling) with main" --label enhancement,needs-info --body-file issues/06.md
gh issue create --repo $R --title "Phase B: Tailwind + shadcn foundation and new-gallery flow with client select-or-create" --label enhancement,needs-info --body-file issues/07.md
gh issue create --repo $R --title "Phase C: show link and PIN once with a share panel (copy, WhatsApp, share sheet) and regenerate" --label enhancement,ready-for-agent --body-file issues/08.md
gh issue create --repo $R --title "Phase D: real photo storage (local disk + Cloudflare R2), upload UI, previews, job runner" --label enhancement,ready-for-agent --body-file issues/09.md
gh issue create --repo $R --title "Phase E: restyle remaining screens, full-screen picking viewer, contact-sheet review" --label enhancement,needs-info --body-file issues/10.md
gh issue create --repo $R --title "Phase F: single zip download of delivered photos" --label enhancement,needs-triage --body-file issues/11.md
gh issue create --repo $R --title "Stop tracking committed node_modules and build artifacts" --label enhancement,ready-for-agent --body-file issues/12.md
