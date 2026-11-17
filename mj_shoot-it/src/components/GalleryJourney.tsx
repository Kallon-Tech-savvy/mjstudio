/** Orientation only: availability is explained by each page's server-backed state. */
export function GalleryJourney({
  stage,
}: {
  stage: "choose" | "review" | "delivery";
}) {
  const stages = [
    { id: "choose", label: "Choose favourites" },
    { id: "review", label: "Review & send" },
    { id: "delivery", label: "Final photographs" },
  ] as const;
  return (
    <nav className="gallery-journey" aria-label="Your gallery journey">
      <ol>
        {stages.map((item, index) => (
          <li
            key={item.id}
            aria-current={stage === item.id ? "step" : undefined}
          >
            <span aria-hidden="true">{index + 1}</span>
            {item.label}
          </li>
        ))}
      </ol>
    </nav>
  );
}
