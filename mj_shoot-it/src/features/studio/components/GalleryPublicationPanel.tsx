type Props = {
  published: boolean;
  hasPhotos: boolean;
  hasAccess: boolean;
  busy: boolean;
  waitingForPhotos: boolean;
  error: string;
  onPublish: () => void;
};

export function GalleryPublicationPanel({
  published,
  hasPhotos,
  hasAccess,
  busy,
  waitingForPhotos,
  error,
  onPublish,
}: Props) {
  return (
    <section
      className="gallery-publication-panel"
      aria-labelledby="publication-title"
      aria-busy={busy}
    >
      <p className="eyebrow">Client review</p>
      <h2 id="publication-title">
        {published ? "Open for client review" : "Prepare, then invite them in."}
      </h2>
      <p className="muted">
        {published
          ? "Clients with an active link and PIN can review this gallery."
          : "Your draft stays private until you publish it. Publishing opens client review; final delivery is a separate step."}
      </p>
      <ol className="publication-checklist">
        <li>{hasPhotos ? "✓" : "1."} Add photographs</li>
        <li>{hasAccess ? "✓" : "2."} Prepare an access link and PIN</li>
        <li>{published ? "✓" : "3."} Publish for client review</li>
      </ol>
      {waitingForPhotos ? (
        <output>
          Uploads are still being checked. Resolve them before publishing.
        </output>
      ) : null}
      {error ? (
        <p className="error-box" role="alert">
          {error}
        </p>
      ) : null}
      {!published ? (
        <button
          className="primary-button"
          type="button"
          disabled={busy || !hasPhotos || !hasAccess || waitingForPhotos}
          onClick={onPublish}
        >
          {busy ? "Publishing…" : "Publish for client review"}
        </button>
      ) : (
        <output>Published · ready to share your link and PIN.</output>
      )}
    </section>
  );
}
