import { useEffect, useState, type FormEvent} from "react";
import { useParams, useNavigate, Link } from "react-router-dom";

import {
  GalleryRecord,
  getPhotographerMe,
  PhotographerUser,
  ClientRecord,
  photographerLogout,
  listClients,
  getStudioSummary,
  listGalleries,
} from "@/lib/api";


function Dashboard() {
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
        setError(caughtError instanceof Error ? caughtError.message : "Unable to load dashboard.");
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
      setError(caughtError instanceof Error ? caughtError.message : "Unable to sign out.");
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
          <small>Authorized studio context</small>
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
          <small>Server-authorized access</small>
        </article>
      </section>

      <section className="two-column-layout">
        <div className="panel">
          <div className="panel-header compact-header">
            <h2>Recent galleries</h2>
            <Link to="/photographer/galleries" className="tiny-link">
              View all
            </Link>
          </div>
          <ul className="list-stack">
            {galleries.length === 0 ? (
              <li className="empty-state">No galleries yet.</li>
            ) : (
              galleries.map((gallery) => (
                <li key={gallery.galleryId} className="list-row">
                  <div>
                    <strong>{gallery.name}</strong>
                    <small>{gallery.status ?? "draft"}</small>
                  </div>
                  <Link to={`/photographer/galleries/${gallery.galleryId}`} className="tiny-link">
                    Open
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="panel">
          <div className="panel-header compact-header">
            <h2>Clients</h2>
            <Link to="/photographer/galleries" className="tiny-link">
              Manage
            </Link>
          </div>
          <ul className="list-stack">
            {clients.length === 0 ? (
              <li className="empty-state">No clients configured.</li>
            ) : (
              clients.map((client) => (
                <li key={client.clientId} className="list-row">
                  <div>
                    <strong>{client.name}</strong>
                    <small>{client.email ?? client.phone ?? "No contact"}</small>
                  </div>
                  <span className="tag">Studio client</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </main>
  );
}

export default Dashboard;