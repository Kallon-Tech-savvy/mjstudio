import { useEffect, useState, type FormEvent} from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";

import {
  verifyClientAccess
} from "@/lib/api";


function ClientAccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const galleryId = searchParams.get("galleryId") ?? "";
  const [secret, setSecret] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const access = await verifyClientAccess({ secret, pin });
      navigate(`/client/gallery/${galleryId || access.galleryId}`, { replace: true });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Gallery access could not be verified.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page-shell auth-shell">
      <div className="panel auth-panel">
        <div className="panel-header">
          <p className="eyebrow">Client gallery</p>
          <h1>Verify access</h1>
          <p className="muted">
            The browser is never the authority. A valid secret and PIN grant a temporary session, and the server enforces access.
          </p>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Access secret</span>
            <input value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="secret" required />
          </label>

          <label className="field">
            <span>Six-digit PIN</span>
            <input value={pin} onChange={(event) => setPin(event.target.value)} placeholder="123456" inputMode="numeric" maxLength={6} required />
          </label>

          {error ? <div className="error-box">{error}</div> : null}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Verifying..." : "Open gallery"}
          </button>
        </form>

        <div className="inline-actions">
          <Link to="/">Return home</Link>
          <Link to="/photographer/login">Photographer sign-in</Link>
        </div>
      </div>
    </main>
  );
}

export default ClientAccess;