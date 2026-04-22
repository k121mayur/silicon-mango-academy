import { useEffect, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function App() {
  const [health, setHealth] = useState({
    loading: true,
    error: "",
    data: null,
  });

  useEffect(() => {
    let ignore = false;

    async function loadHealth() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/health`);

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const data = await response.json();

        if (!ignore) {
          setHealth({
            loading: false,
            error: "",
            data,
          });
        }
      } catch (error) {
        if (!ignore) {
          setHealth({
            loading: false,
            error: error instanceof Error ? error.message : "Unknown error",
            data: null,
          });
        }
      }
    }

    loadHealth();

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="hero-card">
        <span className="eyebrow">Silicon Mango Academy</span>
        <h1>Silicon Academy Portal</h1>
        <p>
          React is wired to the FastAPI backend. This starter screen confirms the
          frontend can reach the API before we begin building the real product.
        </p>

        <div className="status-panel">
          <p className="status-label">Backend health</p>
          {health.loading && <p>Checking API connection...</p>}
          {!health.loading && health.error && (
            <p className="status-error">Connection failed: {health.error}</p>
          )}
          {!health.loading && health.data && (
            <div>
              <p className="status-ok">Status: {health.data.status}</p>
              <p>Service: {health.data.service}</p>
              <p>API base URL: {apiBaseUrl}</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;

