# MJ Studio photographic redesign

The affected journeys are the client's first visit, private access, review and delivery, and the photographer's sign-in and workspace. The goal is a personal, coherent service with photography at its centre. The existing API, access rules, selections, feedback and delivery behavior are preserved.

## Reference set

These are five established references, not a measured market-share ranking. Public product and help pages informed the direction:

- [Pixieset](https://pixieset.com/client-gallery/): image-first presentation and clear favourite selection.
- [Pic-Time](https://www.pic-time.com/client-galleries): photography as an emotional, editorial experience.
- [ShootProof](https://www.shootproof.com/features/proofing/): understandable client proofing and selection.
- [CloudSpot](https://cloudspot.io/client-galleries): simple gallery access and delivery.
- [SmugMug](https://www.smugmughelp.com/hc/en-us/articles/18212716776340-Share-my-photos): accessible photo browsing and sharing entry points.

## Implementation and acceptance criteria

- Home clearly separates client gallery access and studio sign-in, with a three-step explanation of the service.
- Warm paper, forest green and terracotta replace the monochrome palette across the existing application.
- CSS perspective, rotated photographic prints and layered shadows provide depth without requiring gestures or motion to complete a task.
- Client photographs retain existing selection and note controls; selected cards receive a visible outline.
- Responsive layouts reflow the home page into one column; reduced-motion preferences disable new image transitions.
- No chat, AI curation, commerce, bulk downloads or new backend features are introduced.

The human-centred design is a hypothesis to validate with real clients. It does not claim new support availability or fabricated client activity. Homepage images are illustrative public Unsplash photographs, stored locally: photo-1519741497674-611481863552 and photo-1511895426328-dc8714191300. Replace them with studio-owned photographs before a branded release.

## Follow-up validation

Have a photographer create and share a gallery, and a client open it on a phone, choose favourites, send a note, review the shortlist and retrieve a released photo. Observe hesitation and missed controls. Production API/database setup and real-client usability remain separate from mocked workflow tests.

## Interaction refinement — 17 November 2026

Research window: 17 November 2025–17 November 2026. Selected relevant recent publications from established usability research organisations; this is not a claim to exhaustively rank research. The following principles inform the design, but results from ecommerce do not establish an effect size for a photography service.

- [NN/g, Usability 101, 6 November 2026](https://www.nngroup.com/articles/usability-101-introduction-to-usability/): task completion, context, errors and satisfaction must be assessed with representative users and realistic tasks. Application: show client journey stages and distinguish choosing, sending and delivery.
- [Baymard, Accounts & Self-Service UX Research, 9 September 2026](https://baymard.com/research-articles/accounts-and-self-service-ux-research-2026): unclear requirements and poor guidance can obstruct self-service. Application: explain the link/PIN pairing at access and missing prerequisites beside publishing.
- [Baymard, Hidden Friction Audit, 2026](https://baymard.com/blog/audit-checkout-flow-hidden-friction): audit descriptive button labels, field guidance and recovery that preserves input. Application: photo-specific selection names, visible note context, and retaining the existing retry behavior.

### Observed issues and implemented responses

| Journey / actor | Evidence in the previous UI | Response |
| --- | --- | --- |
| Client access | Manual key entry had no explanation of the easier invitation-link route | Describe opening the supplied link and pairing it with its PIN; attach help to inputs |
| Client choosing | Save and submit were separate behaviors with little explanation | Explain automatic saving versus final sending, plus a three-stage orientation |
| Client submitted selection | Selection controls were disabled; review introduction still suggested removal | Explain the lock and direct change requests to the photographer; make review copy reflect actual status |
| Client note | Placeholder carried most context; opening did not focus the textarea | Add a persistent label, gallery-versus-photo guidance and the existing character constraint; focus on open and restore on cancel |
| Studio publication | Disabled action exposed a checklist but no consolidated reason | Name every unmet requirement and associate the explanation with the button |
| Photo selection | Repeated Select buttons lacked photograph-specific accessible names | Include the photograph number and preserve pressed state |

No backend permission or selection constraints were changed. Journey stages are orientation, not a promise of delivery availability. The server-backed release state still controls final-photo access.

### Usability pilot and decision criteria

Compare the previous UI and revised UI with representative clients and photographers using synthetic galleries. Counterbalance order to reduce learning effects. Ask clients to open an invitation, choose and unchoose a photo, leave a photo-specific note, send the shortlist and find a released download; ask studio staff to identify and resolve publication prerequisites. Include phone and keyboard use.

Record unassisted completion, errors, backtracking, requests for help, time per task and a post-task ease rating. Specifically ask whether choices are merely saved or already sent. Treat any failure to understand the submission lock as a blocking issue. Evaluate satisfaction through participant feedback; no satisfaction uplift or conversion claim is established by the implementation or automated tests.
