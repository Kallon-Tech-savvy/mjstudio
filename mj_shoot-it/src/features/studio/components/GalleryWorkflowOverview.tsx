import "./GalleryWorkflowOverview.css";

type Props = {
  photoCount: number;
  hasAccess: boolean;
  published: boolean;
};

export function GalleryWorkflowOverview({
  photoCount,
  hasAccess,
  published,
}: Props) {
  const steps = [
    { label: "Created", href: "#gallery-top", complete: true },
    { label: "Photographs", href: "#photo-upload", complete: photoCount > 0 },
    { label: "Client access", href: "#client-access", complete: hasAccess },
    { label: "Publish", href: "#gallery-publication", complete: published },
  ];
  const currentStep = steps.findIndex((step) => !step.complete);
  const nextStep = currentStep >= 0 ? steps[currentStep] : null;
  const heading = published
    ? hasAccess
      ? "Gallery is live"
      : "Gallery needs an active link"
    : "Prepare for your client";
  const introduction = published
    ? hasAccess
      ? "Your client can now explore, choose favorites, and leave notes. You’ll see their shortlist here when they send it; final delivery stays in your hands."
      : "This gallery is published, but it has no active client link. Issue access to invite your client back; final delivery stays in your hands."
    : "Your draft stays private until you publish. Then your client can explore, choose favorites, and leave notes. You decide when the final photographs are ready to release.";

  return (
    <nav className="gallery-workflow" aria-label="Gallery setup">
      <div className="gallery-workflow-heading">
        <div>
          <p className="eyebrow">Gallery workflow</p>
          <h2>{heading}</h2>
        </div>
        {nextStep ? (
          <a className="gallery-workflow-next" href={nextStep.href}>
            Next: {nextStep.label} <span aria-hidden="true">→</span>
          </a>
        ) : null}
      </div>

      <p className="gallery-workflow-intro">{introduction}</p>

      <ol className="gallery-workflow-steps">
        {steps.map((step, index) => {
          const state = step.complete
            ? "complete"
            : index === currentStep
              ? "current"
              : "upcoming";

          return (
            <li className={`gallery-workflow-step is-${state}`} key={step.label}>
              <a
                href={step.href}
                aria-current={index === currentStep ? "step" : undefined}
              >
                <span className="gallery-workflow-marker" aria-hidden="true">
                  {step.complete ? "✓" : String(index + 1).padStart(2, "0")}
                </span>
                <span className="gallery-workflow-label">{step.label}</span>
                <span className="gallery-workflow-state">
                  {step.complete
                    ? "Complete"
                    : index === currentStep
                      ? "Next"
                      : "Upcoming"}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}