import React, { memo } from 'react';
import { FolderIcon } from './Icons.jsx';

/**
 * Circular celestial cluster boundary for Trailo Constellation View.
 * Renders a circular orbital boundary with subtle cosmic nebula background,
 * orbital guide rings, and a compact apex badge showing directory path and star count.
 */
function ClusterGroupNodeComponent({ data }) {
  const isSubcluster = Boolean(data?.isSubcluster);
  const fileCount = data?.fileCount || 0;
  const label = data?.label || 'Cluster';

  return (
    <div
      className={`trailo-cluster-group ${isSubcluster ? 'is-subcluster' : 'is-root-cluster'}`}
      data-testid={`cluster-group-${data?.clusterKey || 'root'}`}
    >
      {/* Decorative concentric celestial orbit ring */}
      <div className="cluster-orbit-guide" />

      {/* Orbit Apex Header Badge */}
      <div className="cluster-group-header">
        <FolderIcon size={13} className="cluster-group-icon" />
        <span className="cluster-group-title" title={label}>
          {label}
        </span>
        <span className="cluster-group-badge">
          {fileCount} {fileCount === 1 ? 'star' : 'stars'}
        </span>
      </div>
    </div>
  );
}

export const ClusterGroupNode = memo(ClusterGroupNodeComponent);
export default ClusterGroupNode;
