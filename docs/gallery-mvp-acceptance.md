# Gallery MVP acceptance contract

The service outcome is a private gallery that a photographer can prepare, a client can review and submit, and the photographer can approve and release. Release means availability, not proof of receipt. No new database state is introduced by the journey guide: it projects authoritative publication, selection, review and delivery records.

| Actor and stage | Source of truth and constraint | Next action / recovery |
| --- | --- | --- |
| Studio creates draft | Gallery belongs to studio and existing/new client; creation receipt protects retries | Add photographs; retry uncertain creation with same attempt |
| Studio uploads | Photo + original asset + processing job; processing is not completion | Confirm processing; preserve original on uncertainty; explicitly remove failed upload |
| Studio prepares access | Active gallery access, permission, expiry and revocation; secret and PIN are not gallery identity | Choose view or view/download; share credentials separately |
| Studio publishes | Server checks publication prerequisites | Explicit publish; draft remains private on failure |
| Client reviews | Verified gallery session; persisted photo selections and feedback belong to this gallery | Select, read limit, review summary, explicitly submit; retry failures |
| Studio proofs | Submitted selection and per-photo review record; revision requires a note | Save decision; refresh delivery eligibility without reloading the page |
| Studio prepares delivery | All selected photos approved; originals validated server-side | Prepared items remain private; failed readiness refresh blocks the next action and offers retry |
| Studio releases | Delivery items must still be valid and approved in transaction | One release action; released reviews locked; client uses same gallery |
| Client receives | Released delivery plus current access/download permission | View final photographs; individual download/retry where permitted |

## Design and interaction

Use shared spacing, monochrome surfaces, sans-serif workspace hierarchy, numbered stages, visible current-stage text, and one primary delivery action. Status must be conveyed with words, not colour alone. Keep upload/access/review/delivery sections reachable through the next-action guide. Phone layout must not require horizontal scrolling. Dialogs retain keyboard focus and return focus to their opener.

Exact Figma component/variable mapping is pending a file link. The implementation uses the repository's existing design tokens; it is not a verified reproduction of an external Figma library.

## Verification boundaries

Browser tests use API fixtures to exercise UI transitions and recovery. `studio-delivery-journey.spec.ts` covers saved approval → failed readiness lookup → retry → private preparation → release → locked review at 320px and 1280px. Existing suites cover draft creation, upload recovery, access handoff, selection, image recovery, permissions and client delivery. PostgreSQL integration tests exercise real persistence, processing and transaction guards separately.

Before declaring production completion, run the database suite and all CI gates on the final commit, configure production storage/processing/auth providers, and run a real photographer/client session through creation to permitted download. Observe whether either participant needs verbal guidance. No automated fixture proves usability or production-provider operation. Migration preflight checks recorded versions, not schema drift. Creation retry identity is currently in-memory and does not survive closing/reloading the page.

## Client response handoff

While a published gallery awaits submission, the photographer can explicitly check for a response without reloading the workspace. A successful check updates selection state, selected photographs, notes and delivery readiness together. A failed check retains the current workspace and offers retry; no partial response is presented as a completed submission. Access credentials and uploads are not reset. The guide prioritizes unconfirmed access over waiting for the client. The phone regression covers missing access, issuing credentials, no response, failed lookup and successful submission recovery.
