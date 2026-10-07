import { useEffect, useState, type FormEvent} from "react";
import { useParams, Navigate, useNavigate, Link } from "react-router-dom";

import {
    photographerLogin
} from "@/lib/api";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("photographer@example.com");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await photographerLogin({ email, password });
      navigate("/photographer/dashboard", { replace: true });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page-shell auth-shell">
      <div className="panel auth-panel">
        <div className="panel-header">
          <p className="eyebrow">Photographer workspace</p>
          <h1>Sign in to MJ Studio</h1>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="photographer@studio.com" required />
          </label>

          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required />
          </label>

          {error ? <div className="error-box">{error}</div> : null}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="inline-actions">
          <Link to="/">Back to home</Link>
          <Link to="/client/access">Client access Page</Link>
        </div>
      </div>
    </main>
  );
}
export default Login;