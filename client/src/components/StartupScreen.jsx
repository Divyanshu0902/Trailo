import React from 'react';
import logo2Img from '../../../assets/logo2.png';

/**
 * StartupScreen — Initial empty state displayed in the main content area when no repository is active.
 *
 * Requirements:
 * - Uses the original black-shade assets/logo2.png exactly as supplied without filters or recoloring.
 * - Displays the logo prominently centered in the main content area.
 * - Excludes any separate "Trailo" heading, tagline, or caption beneath the logo.
 * - Provides subtle, muted, non-clickable informational guidance describing Trailo's core capabilities.
 * - Excludes duplicate scan forms, inputs, fake recent history, or metrics.
 */
export function StartupScreen() {
  return (
    <div className="startup-screen" role="region" aria-label="Trailo Startup Screen">
      <div className="startup-content">
        <div className="startup-logo-wrapper">
          <img
            src={logo2Img}
            alt="Trailo Logo"
            className="startup-logo-img"
          />
        </div>

        <ul className="startup-guide-list" aria-label="Trailo Core Capabilities">
          <li className="startup-guide-item">
            <span className="guide-label">Scanner</span>
            <span className="guide-separator">—</span>
            <span className="guide-desc">Scans and indexes a repository.</span>
          </li>
          <li className="startup-guide-item">
            <span className="guide-label">Dependency Graph</span>
            <span className="guide-separator">—</span>
            <span className="guide-desc">Visualizes dependencies between files.</span>
          </li>
          <li className="startup-guide-item">
            <span className="guide-label">Cluster View</span>
            <span className="guide-separator">—</span>
            <span className="guide-desc">Groups related code into visual clusters.</span>
          </li>
          <li className="startup-guide-item">
            <span className="guide-label">Ask Trailo</span>
            <span className="guide-separator">—</span>
            <span className="guide-desc">Get code-grounded answers from AI.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

