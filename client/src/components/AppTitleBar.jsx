import React, { useState, useEffect } from 'react';
import { FolderIcon, MinimizeIcon, MaximizeIcon, CloseIcon } from './Icons.jsx';
import logoImg from '../../../assets/logo.png';

/**
 * Top application bar matching modern desktop IDE title bar conventions.
 * Features the enlarged official product logo, repository context, and desktop window controls.
 */
export function AppTitleBar({
  repoName,
  repoPath,
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const handleMinimize = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const handleClose = () => {
    window.close?.();
  };

  return (
    <header className="shell-titlebar">
      <div className="titlebar-left">
        <div className="titlebar-brand" title="Trailo">
          <img src={logoImg} alt="Trailo Logo" className="titlebar-logo-img" />
          <span className="titlebar-brand-name">Trailo</span>
        </div>

        {repoName && (
          <>
            <span className="titlebar-divider" aria-hidden="true">|</span>
            <div className="titlebar-repo-item" title={repoPath}>
              <FolderIcon size={13} className="titlebar-repo-icon" />
              <span className="titlebar-repo-name">{repoName}</span>
            </div>
          </>
        )}
      </div>

      <div className="titlebar-right">
        <div className="titlebar-window-controls" role="group" aria-label="Window Controls">
          <button
            type="button"
            className="window-control-btn btn-minimize"
            onClick={handleMinimize}
            title="Minimize"
            aria-label="Minimize"
          >
            <MinimizeIcon size={14} />
          </button>

          <button
            type="button"
            className="window-control-btn btn-fullscreen"
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Restore' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Restore' : 'Fullscreen'}
          >
            <MaximizeIcon size={12} />
          </button>

          <button
            type="button"
            className="window-control-btn btn-close"
            onClick={handleClose}
            title="Close"
            aria-label="Close"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
