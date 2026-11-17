import type { StudioDeliveryDetails } from "@/lib/api";

/** A projection of server state, never a replacement for mutation guards. */
export function GalleryJourney({
  published,
  hasPhotos,
  waitingForPhotos,
  accessAvailable,
  hasAccess,
  submitted,
  delivery,
  checkingDelivery,
}: {
  published: boolean;
  hasPhotos: boolean;
  waitingForPhotos: boolean;
  accessAvailable: boolean;
  hasAccess: boolean;
  submitted: boolean;
  delivery: StudioDeliveryDetails | null;
  checkingDelivery: boolean;
}) {
  const stage = delivery?.releasedAt
    ? 5
    : submitted
      ? delivery?.canPrepare
        ? 4
        : 3
      : published
        ? 2
        : 1;
  const next = delivery?.releasedAt
    ? {
        title: "Photographs released",
        detail:
          "Your client can return to the same gallery. Download access follows their permission; release does not confirm receipt.",
        href: "#final-delivery",
        action: "View release details",
      }
    : submitted
      ? checkingDelivery
        ? {
            title: "Confirm delivery readiness",
            detail:
              "Your saved reviews are retained. Check the current delivery state before continuing.",
            href: "#final-delivery",
            action: "Check delivery status",
          }
        : delivery?.canPrepare
          ? {
              title: "Prepare and release photographs",
              detail:
                "All selected photographs are approved. Preparation keeps them private until you explicitly release them.",
              href: "#final-delivery",
              action: "Continue to delivery",
            }
          : {
              title: "Review the client’s selection",
              detail:
                "Open each selected photograph, review any notes and save your decision. Every selected photograph needs approval before delivery.",
              href: "#selection-review",
              action: "Review selected photographs",
            }
      : published && (!hasAccess || !accessAvailable)
        ? {
            title: "Check client access",
            detail:
              "The gallery is published, but active access has not been confirmed. Your client needs a working link and PIN before they can respond.",
            href: accessAvailable ? "#client-access" : "#gallery-publication",
            action: "Review access requirements",
          }
        : published
          ? {
              title: "Waiting for the client’s selection",
              detail:
                "Share the access link and PIN separately. Use “Check client response” below to see their submitted choices.",
              href: accessAvailable ? "#client-access" : "#gallery-publication",
              action: "View client access",
            }
          : !hasPhotos || waitingForPhotos
            ? {
                title: waitingForPhotos
                  ? "Finish checking your uploads"
                  : "Add your photographs",
                detail:
                  "Keep your originals until uploads are confirmed. Your draft stays private while you prepare it.",
                href: "#photo-upload",
                action: "Go to photographs",
              }
            : !hasAccess || !accessAvailable
              ? {
                  title: "Prepare client access",
                  detail: accessAvailable
                    ? "Choose viewing or download permission, then create the link and PIN."
                    : "Client access has not been confirmed. Resolve the access status before publishing.",
                  href: accessAvailable
                    ? "#client-access"
                    : "#gallery-publication",
                  action: "Check access requirements",
                }
              : {
                  title: "Publish for client review",
                  detail:
                    "Your photographs and access are set up. Publishing lets your client start reviewing; it does not release final delivery.",
                  href: "#gallery-publication",
                  action: "Review and publish",
                };
  return (
    <section className="gallery-journey" aria-labelledby="gallery-next-title">
      <ol className="gallery-journey-steps" aria-label="Gallery progress">
        {[
          "Prepare",
          "Client selection",
          "Proofing",
          "Delivery",
          "Released",
        ].map((label, index) => (
          <li
            key={label}
            aria-current={stage === index + 1 ? "step" : undefined}
          >
            <span aria-hidden="true">0{index + 1}</span> {label}
          </li>
        ))}
      </ol>
      <div className="gallery-journey-next">
        <div>
          <p className="eyebrow">Next action</p>
          <h2 id="gallery-next-title">{next.title}</h2>
          <p className="muted">{next.detail}</p>
        </div>
        <a className="primary-button" href={next.href}>
          {next.action} ↓
        </a>
      </div>
    </section>
  );
}
