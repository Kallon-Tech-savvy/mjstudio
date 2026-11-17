import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PhotographerGalleriesPage from "@/features/studio/pages/PhotographerGalleriesPage";
import {
  type ClientRecord,
  type GalleryRecord,
  getPhotographerMe,
  getStudioSummary,
  listClients,
  listGalleries,
  type PhotographerUser,
  photographerLogin,
  photographerLogout,
} from "@/lib/api";

function HomePage() {
  return (
    <main className="atelier-home">
      <nav className="atelier-nav" aria-label="Main navigation">
        <Link to="/" className="atelier-logo" aria-label="MJ Studio home">
          mj<span>STUDIO</span>
          <i aria-hidden="true">✳</i>
        </Link>
        <a href="#experience" className="atelier-nav-story">
          A little more personal.
        </a>
        <Link to="/client/access" className="atelier-nav-link">
          Your gallery <span aria-hidden="true">↗</span>
        </Link>
        <Link to="/photographer/login" className="atelier-studio-link">
          Studio sign in
        </Link>
      </nav>

      <section className="atelier-hero" aria-labelledby="home-title">
        <div className="atelier-copy">
          <p className="eyebrow">
            <span className="atelier-dot" /> PHOTOGRAPHS. PEOPLE. CONNECTION.
          </p>
          <h1 id="home-title">
            The moment
            <br />
            was yours.
            <br />
            <em>Keep the feeling.</em>
          </h1>
          <p className="atelier-intro">
            More than a collection of photographs. A little space to relive it
            all, find your favourites, and make the final details feel like you.
          </p>
          <div className="atelier-actions">
            <Link to="/client/access" className="primary-button">
              Find your gallery <span aria-hidden="true">↗</span>
            </Link>
            <a href="#experience" className="atelier-text-link">
              How it feels <span aria-hidden="true">↓</span>
            </a>
          </div>
          <p className="atelier-reassurance">
            Your private gallery. Your pace. Your photographer, a note away.
          </p>
        </div>
        <div className="print-scene">
          <div className="scene-orbit" aria-hidden="true" />
          <figure className="photo-print print-main">
            <img
              src="/images/wedding.jpg"
              alt="A couple sharing a moment at their outdoor wedding"
              fetchPriority="high"
              width="1400"
              height="933"
            />
            <figcaption>
              <span>The moments between.</span>
              <span>01 /</span>
            </figcaption>
          </figure>
          <figure className="photo-print print-small">
            <img
              src="/images/family.jpg"
              alt="A family walking together in warm evening light"
              width="900"
              height="600"
            />
            <figcaption>Close to the heart.</figcaption>
          </figure>
          <div className="scene-note">
            <span aria-hidden="true">♡</span>
            <div>
              Some things deserve
              <br />
              to be felt again.
            </div>
          </div>
          <p className="scene-caption">LIFE, BEAUTIFULLY UNPOSED.</p>
        </div>
      </section>

      <section
        id="experience"
        className="atelier-experience"
        aria-labelledby="experience-title"
      >
        <div className="experience-heading">
          <p className="eyebrow">FROM OUR STUDIO TO YOU</p>
          <h2 id="experience-title">A thoughtful little journey.</h2>
          <p>The photographs are only the beginning.</p>
        </div>
        <div className="experience-steps">
          <article>
            <span className="journey-number">01 / DISCOVER</span>
            <h3>Settle into your story.</h3>
            <p>
              Open your private gallery and give every moment a little room. On
              your phone, or the big screen.
            </p>
            <Link to="/client/access">
              Open your gallery <span aria-hidden="true">↗</span>
            </Link>
          </article>
          <article>
            <span className="journey-number">02 / CONNECT</span>
            <h3>Tell us what you love.</h3>
            <p>
              Choose your favourites. Leave a note on the little details. Your
              photographer takes it from there.
            </p>
            <span className="journey-detail">Your eye. Our care.</span>
          </article>
          <article>
            <span className="journey-number">03 / KEEP</span>
            <h3>Yours to come back to.</h3>
            <p>
              When your final photographs are ready, return to your gallery to
              view and download the available images.
            </p>
            <span className="journey-detail">Made to be remembered.</span>
          </article>
        </div>
      </section>
      <footer className="atelier-footer">
        <Link to="/" className="atelier-footer-brand">
          mj studio
        </Link>
        <p>Behind every photograph, a person.</p>
        <Link to="/photographer/login">
          Made for your studio <span aria-hidden="true">↗</span>
        </Link>
      </footer>
    </main>
  );
}

function PhotographerLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to sign in.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page-shell auth-shell">
      <div className="panel auth-panel">
        <div className="panel-header">
          <p className="eyebrow">Photographer workspace</p>
          <h1>Welcome back.</h1>
          <p className="muted">
            Sign in to prepare galleries, follow client selections, and keep
            each delivery moving.
          </p>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="photographer@studio.com"
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
            />
          </label>

          {error ? <div className="error-box">{error}</div> : null}

          <button
            className="primary-button"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="inline-actions">
          <Link to="/">Back to home</Link>
          <Link to="/client/access">Client access flow</Link>
        </div>
      </div>
    </main>
  );
}

function PhotographerDashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<PhotographerUser | null>(null);
  const [studio, setStudio] = useState<Record<string, unknown> | null>(null);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [galleries, setGalleries] = useState<GalleryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const meResponse = await getPhotographerMe();
        if (!meResponse?.user) {
          navigate("/photographer/login", { replace: true });
          return;
        }

        const [studioSummary, clientList, galleryList] = await Promise.all([
          getStudioSummary(),
          listClients(1, 10),
          listGalleries(1, 10),
        ]);

        setUser(meResponse.user);
        setStudio(studioSummary);
        setClients(clientList.items ?? []);
        setGalleries(galleryList.items ?? []);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load dashboard.",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await photographerLogout();
      navigate("/photographer/login", { replace: true });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to sign out.",
      );
    }
  };

  if (isLoading) {
    return (
      <main className="page-shell">
        <div className="panel">
          <p>Loading studio dashboard…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell dashboard-shell">
      <header className="dashboard-header panel">
        <div>
          <p className="eyebrow">Studio overview</p>
          <h1>{user?.displayName ?? "Photographer"}</h1>
        </div>
        <div className="header-actions">
          <Link to="/photographer/galleries" className="secondary-button">
            Manage galleries
          </Link>
          <button type="button" className="button-ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <section className="stats-grid">
        <article className="panel metric-card">
          <span>Studio</span>
          <strong>{String(studio?.name ?? "MJ Studio")}</strong>
          <small>Your photography workspace</small>
        </article>
        <article className="panel metric-card">
          <span>Clients</span>
          <strong>{clients.length}</strong>
          <small>Studio roster</small>
        </article>
        <article className="panel metric-card">
          <span>Galleries</span>
          <strong>{galleries.length}</strong>
          <small>Shared with clients</small>
        </article>
        <article className="panel metric-card">
          <span>Role</span>
          <strong>{user?.role ?? "owner"}</strong>
          <small>Your studio permissions</small>
        </article>
      </section>

      <section className="two-column-layout">
        <div className="panel">
          <div className="panel-header compact-header">
            <div>
              <p className="eyebrow">Needs attention</p>
              <h2>Selection received</h2>
            </div>
            <span className="tag">
              {
                galleries.filter(
                  (gallery) => gallery.selectionStatus === "submitted",
                ).length
              }
            </span>
          </div>
          <ul className="list-stack">
            {galleries.filter(
              (gallery) => gallery.selectionStatus === "submitted",
            ).length === 0 ? (
              <li className="empty-state">
                You’re all caught up. New client selections will appear here.
              </li>
            ) : (
              galleries
                .filter((gallery) => gallery.selectionStatus === "submitted")
                .map((gallery) => (
                  <li
                    key={gallery.galleryId}
                    className="list-row interactive-row"
                  >
                    <div>
                      <strong>{gallery.clientName ?? gallery.name}</strong>
                      <small>
                        {gallery.selectedCount ?? 0} photographs selected ·{" "}
                        {gallery.name}
                      </small>
                    </div>
                    <Link
                      to={`/photographer/galleries/${gallery.galleryId}`}
                      className="tiny-link"
                    >
                      Review →
                    </Link>
                  </li>
                ))
            )}
          </ul>
        </div>

        <div className="panel">
          <div className="panel-header compact-header">
            <h2>Recent galleries</h2>
            <Link to="/photographer/galleries" className="tiny-link">
              View all
            </Link>
          </div>
          <ul className="list-stack">
            {galleries.length === 0 ? (
              <li className="empty-state">
                <strong>Your first gallery starts here.</strong>
                <span>
                  Set up a private space for clients to review their
                  photographs.
                </span>
                <Link to="/photographer/galleries" className="tiny-link">
                  Create a gallery
                </Link>
              </li>
            ) : (
              galleries.map((gallery) => (
                <li key={gallery.galleryId} className="list-row">
                  <div>
                    <strong>{gallery.name}</strong>
                    <small>
                      {gallery.selectionStatus === "submitted"
                        ? "Selection received"
                        : (gallery.status ?? "draft")}
                    </small>
                  </div>
                  <Link
                    to={`/photographer/galleries/${gallery.galleryId}`}
                    className="tiny-link"
                  >
                    Open
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </main>
  );
}

import AppRouter from "@/app/router";
import {
  ClientAccessPage,
  ClientDeliveryPage,
  ClientGalleryPage,
  ClientSelectionCompletionPage,
  ClientSelectionReviewPage,
} from "@/features/client-gallery/ClientGalleryPages";
import PhotographerGalleryDetailPage from "@/features/studio/pages/PhotographerGalleryDetailPage";

export default function App() {
  return (
    <AppRouter
      home={<HomePage />}
      photographerLogin={<PhotographerLoginPage />}
      photographerDashboard={<PhotographerDashboardPage />}
      photographerGalleries={<PhotographerGalleriesPage />}
      photographerGalleryDetail={<PhotographerGalleryDetailPage />}
      clientAccess={<ClientAccessPage />}
      clientGallery={<ClientGalleryPage />}
      clientSelection={<ClientSelectionReviewPage />}
      clientCompletion={<ClientSelectionCompletionPage />}
      clientDelivery={<ClientDeliveryPage />}
    />
  );
}
