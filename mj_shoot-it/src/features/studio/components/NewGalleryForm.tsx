import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  type ClientRecord,
  createGallery,
  type GalleryRecord,
} from "@/lib/api";
import { type ClientChoice, ClientPicker } from "./ClientPicker";

type Props = {
  clients: ClientRecord[];
  onCreated: (gallery: GalleryRecord) => void;
};

const steps = ["The shoot", "The client", "Review"];

/** Keep one decision in view, then hand the created gallery straight to uploads. */
export function NewGalleryForm({ clients, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState<ClientChoice | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  const submitting = useRef(false);
  const clientName =
    choice?.kind === "existing" ? choice.client.name : choice?.name;
  const ready = Boolean(name.trim() && choice);

  useEffect(() => {
    if (previousStep.current !== step) heading.current?.focus();
    previousStep.current = step;
  }, [step]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    if (step < 2) {
      if ((step === 0 && name.trim()) || (step === 1 && choice))
        setStep(step + 1);
      return;
    }
    if (!choice || !ready) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const gallery = await createGallery(
        choice.kind === "existing"
          ? {
              clientId: choice.client.clientId,
              name: name.trim(),
              expiresAt: null,
            }
          : {
              newClient: {
                name: choice.name,
                email: choice.email,
                phone: choice.phone,
              },
              name: name.trim(),
              expiresAt: null,
            },
      );
      onCreated(gallery);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create gallery. Please try again.",
      );
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="gallery-creation">
      <form className="creation-form" onSubmit={submit} aria-busy={busy}>
        <nav aria-label="Gallery setup progress">
          <ol className="creation-steps">
            {steps.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  aria-current={index === step ? "step" : undefined}
                  disabled={busy || index > step}
                  onClick={() => {
                    setStep(index);
                    setError("");
                  }}
                >
                  <span className="step-number">
                    {index < step ? "✓" : `0${index + 1}`}
                  </span>
                  <span>{label}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="creation-stage" key={step}>
          <p className="eyebrow">Step {step + 1} of 3</p>
          <h2 ref={heading} tabIndex={-1}>
            {step === 0
              ? "Every shoot has a story."
              : step === 1
                ? "Who are we creating for?"
                : "A little check. Then, the photos."}
          </h2>
          <p className="muted">
            {step === 0
              ? "Give this gallery a name you and your client will recognise."
              : step === 1
                ? "Find a returning client, or add someone new right here."
                : "Your gallery starts as a private draft. You choose when to share access."}
          </p>

          {step === 0 ? (
            <label className="field" htmlFor="new-gallery-name">
              <span>Gallery name</span>
              <input
                id="new-gallery-name"
                aria-label="Gallery name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Augusta · Portrait session"
                maxLength={200}
                required
                aria-describedby="gallery-name-hint"
              />
              <small id="gallery-name-hint">
                A client name, occasion or date makes it easy to find later.
              </small>
            </label>
          ) : null}
          <div hidden={step !== 1}>
            <ClientPicker
              clients={clients}
              value={choice}
              onChange={setChoice}
            />
          </div>
          {step === 2 ? (
            <dl className="creation-review">
              <div>
                <dt>Gallery name</dt>
                <dd>{name.trim()}</dd>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setStep(0)}
                >
                  Edit name
                </button>
              </div>
              <div>
                <dt>Client</dt>
                <dd>
                  {clientName}
                  <small>
                    {choice?.kind === "new"
                      ? "New client · saved with this gallery"
                      : "Existing client"}
                  </small>
                </dd>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setStep(1)}
                >
                  Edit client
                </button>
              </div>
              <div>
                <dt>Access</dt>
                <dd>
                  Private draft
                  <small>No client access is issued at this step.</small>
                </dd>
              </div>
            </dl>
          ) : null}
        </div>

        {error ? (
          <div className="error-box" role="alert">
            {error}
            <p>Your entries are still here. You can try again.</p>
          </div>
        ) : null}
        <footer className="creation-footer">
          <span className="muted">
            {step === 0
              ? "Start with just a name."
              : step === 1
                ? "Only the client’s name is required."
                : "Next: add your photographs."}
          </span>
          <div className="inline-actions">
            {step > 0 ? (
              <button
                className="button-ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  setStep(step - 1);
                  setError("");
                }}
              >
                Back
              </button>
            ) : null}
            <button
              className="primary-button"
              type="submit"
              disabled={
                busy ||
                (step === 0 ? !name.trim() : step === 1 ? !choice : !ready)
              }
            >
              {busy
                ? "Creating gallery…"
                : step === 2
                  ? "Create gallery →"
                  : "Continue →"}
            </button>
          </div>
        </footer>
      </form>
      <aside className="creation-summary" aria-label="Gallery summary">
        <div className="summary-topline">
          <span>MJ / STUDIO</span>
          <span>PRIVATE DRAFT</span>
        </div>
        <div className="contact-sheet-mark" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <p className="eyebrow">Your next gallery</p>
        <h3>{name.trim() || "Room for a new story."}</h3>
        <p className="summary-client">
          {clientName
            ? `For ${clientName}`
            : "A considered space for your client’s photographs."}
        </p>
        <div className="summary-next">
          <span>AFTER SETUP</span>
          <p>
            Add photographs.
            <br />
            Prepare access, then publish for client review.
          </p>
        </div>
      </aside>
    </div>
  );
}
