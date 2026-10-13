import React, { useState, useEffect } from 'react';
import './App.css';

export default function App() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/health');
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
      const data = await response.json();
      setHealth(data);
    } catch (err) {
      setError(err.message || 'Failed to reach API server');
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div className="trailo-app">
      <header className="trailo-header">
        <div className="logo-container">
          <span className="logo-icon" role="img" aria-label="compass">🧭</span>
          <span className="logo-text">Trailo</span>
        </div>
        <div className="header-meta">
          <span className="badge">Local-First</span>
          <span className="badge">MVP Phase 1</span>
        </div>
      </header>

      <main className="trailo-main">
        <section className="hero">
          <h1>Understand any codebase faster.</h1>
          <p className="hero-subtitle">
            Local-first codebase exploration with file-level dependency graphs, source inspection,
            and AI Q&amp;A grounded in verified repository citations.
          </p>
        </section>

        <section className="status-section">
          <h2>Backend Service Status</h2>
          <div className="status-card">
            {loading && (
              <div className="status-loading">
                <div className="spinner" />
                <span>Checking API health at <code>/api/health</code>...</span>
              </div>
            )}

            {!loading && health && (
              <div className="status-success">
                <div className="status-indicator-row">
                  <span className="status-dot dot-success" />
                  <span className="status-title">Backend Connected</span>
                  <span className="status-tag status-ok">HTTP 200 OK</span>
                </div>
                <div className="status-details">
                  <div className="detail-item">
                    <span className="label">Service</span>
                    <span className="value"><code>{health.service}</code></span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Status</span>
                    <span className="value"><code>{health.status}</code></span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Server Timestamp</span>
                    <span className="value">{new Date(health.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
                <button type="button" className="btn btn-secondary" onClick={checkHealth}>
                  Recheck Status
                </button>
              </div>
            )}

            {!loading && error && (
              <div className="status-error">
                <div className="status-indicator-row">
                  <span className="status-dot dot-error" />
                  <span className="status-title">Backend Unavailable</span>
                  <span className="status-tag status-failed">Error</span>
                </div>
                <p className="error-description">
                  Could not reach <code>/api/health</code>. Ensure the Express backend is running
                  on port 3001 (e.g. <code>npm run dev:server</code>).
                </p>
                <p className="error-technical">Details: {error}</p>
                <button type="button" className="btn btn-primary" onClick={checkHealth}>
                  Retry Connection
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="roadmap-preview">
          <h2>Upcoming Exploration Capabilities</h2>
          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-step">Phase 2</div>
              <h3>Safe Local Scanning</h3>
              <p>Bounded file discovery, ignore rules, size limits, and security guards for untrusted repositories.</p>
            </div>
            <div className="feature-card">
              <div className="feature-step">Phase 3 &amp; 4</div>
              <h3>Dependency Graph</h3>
              <p>Interactive static file dependency graph with neighbor exploration and source preview.</p>
            </div>
            <div className="feature-card">
              <div className="feature-step">Phase 5 &amp; 6</div>
              <h3>Gemma-Powered Q&amp;A</h3>
              <p>Grounded natural language answers with strict citation validation against real repository lines.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="trailo-footer">
        <p>Trailo &bull; Local-first repository explorer &bull; Evidence over confident claims</p>
      </footer>
    </div>
  );
}
