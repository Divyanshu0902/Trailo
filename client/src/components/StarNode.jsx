import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

/**
 * Compact celestial star node for Trailo Constellation Cluster View.
 * Renders a luminous star dot color-coded by language, with central handles
 * for constellation dependency lines and responsive hover/selection states.
 */
function StarNodeComponent({ data, selected }) {
  const starColor = data.starColor || '#58a6ff';
  const highlightState = data.highlightState || 'normal';
  const isSelected = selected || highlightState === 'selected';

  return (
    <div
      className={`constellation-star-node state-${highlightState} ${isSelected ? 'is-selected' : ''}`}
      style={{
        '--star-color': starColor,
      }}
      data-testid={`star-node-${data.id || data.path}`}
    >
      {/* Central handles for directed constellation lines */}
      <Handle
        type="target"
        position={Position.Top}
        className="constellation-handle"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="constellation-handle"
      />

      {/* Star celestial core and luminous halo */}
      <div className="star-glow-outer" />
      <div className="star-glow-inner" />
      <div className="star-core" />
    </div>
  );
}

export const StarNode = memo(StarNodeComponent);
export default StarNode;

