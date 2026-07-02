import React, { useRef, useEffect } from 'react';
import * as Lucide from 'lucide-react';
import * as Phosphor from '@phosphor-icons/react';

export default function CanvasPreview({
  canvasSettings,
  elements,
  selectedElementId,
  setSelectedElementId,
  updateElementPosition,
  svgRef
}) {
  const containerRef = useRef(null);
  const dragInfo = useRef({ isDragging: false, elementId: null, startX: 0, startY: 0, startElX: 0, startElY: 0 });

  const handleMouseDown = (e, el) => {
    e.stopPropagation();
    setSelectedElementId(el.id);

    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    dragInfo.current = {
      isDragging: true,
      elementId: el.id,
      startX: clientX,
      startY: clientY,
      startElX: el.x,
      startElY: el.y,
      canvasRect: rect
    };

    // Add event listeners for mousemove and mouseup to window to track dragging outside
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleMouseMove, { passive: false });
    window.addEventListener('touchend', handleMouseUp);
  };

  const handleMouseMove = (e) => {
    if (!dragInfo.current.isDragging) return;
    e.preventDefault();

    const info = dragInfo.current;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const dx = clientX - info.startX;
    const dy = clientY - info.startY;

    // Convert screen pixel delta to virtual coordinates (base of 512px)
    const virtualDx = (dx / info.canvasRect.width) * 512;
    const virtualDy = (dy / info.canvasRect.height) * 512;

    // Constrain within bounds or round
    const newX = Math.round(info.startElX + virtualDx);
    const newY = Math.round(info.startElY + virtualDy);

    updateElementPosition(info.elementId, newX, newY);
  };

  const handleMouseUp = () => {
    dragInfo.current.isDragging = false;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('touchmove', handleMouseMove);
    window.removeEventListener('touchend', handleMouseUp);
  };

  // Clean up event listeners on unmount
  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, []);

  const getBackgroundStyle = () => {
    const { bgType, bgColor } = canvasSettings;
    if (bgType === 'solid') {
      return bgColor;
    } else if (bgType === 'gradient') {
      return `url(#bgGradient)`;
    } else {
      return 'none';
    }
  };

  const { bgGradientStart, bgGradientEnd, bgGradientAngle } = canvasSettings;

  const renderBackgroundShape = () => {
    const { bgShape = 'square' } = canvasSettings;
    const fill = getBackgroundStyle();
    const onClick = () => setSelectedElementId(null);

    if (bgShape === 'circle') {
      return <circle cx="256" cy="256" r="256" fill={fill} onClick={onClick} />;
    } else if (bgShape === 'rounded') {
      return <rect width="512" height="512" rx="64" ry="64" fill={fill} onClick={onClick} />;
    } else if (bgShape === 'squircle') {
      return <rect width="512" height="512" rx="140" ry="140" fill={fill} onClick={onClick} />;
    } else {
      return <rect width="512" height="512" fill={fill} onClick={onClick} />;
    }
  };

  return (
    <div className="canvas-frame-wrapper">
      <div 
        ref={containerRef} 
        className="canvas-drag-area"
      >
        <svg
          ref={svgRef}
          viewBox="0 0 512 512"
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block', overflow: 'hidden' }}
        >
          {canvasSettings.bgType === 'gradient' && (
            <defs>
              <linearGradient 
                id="bgGradient" 
                x1={`${Math.max(0, 50 - 50 * Math.cos((bgGradientAngle * Math.PI) / 180))}%`}
                y1={`${Math.max(0, 50 - 50 * Math.sin((bgGradientAngle * Math.PI) / 180))}%`}
                x2={`${Math.min(100, 50 + 50 * Math.cos((bgGradientAngle * Math.PI) / 180))}%`}
                y2={`${Math.min(100, 50 + 50 * Math.sin((bgGradientAngle * Math.PI) / 180))}%`}
              >
                <stop offset="0%" stopColor={bgGradientStart} />
                <stop offset="100%" stopColor={bgGradientEnd} />
              </linearGradient>
            </defs>
          )}
          
          {/* Canvas Background Shape */}
          {renderBackgroundShape()}

          {/* Canvas Elements */}
          {elements.map((el) => {
            const isSelected = el.id === selectedElementId;
            const size = el.size || 64;
            
            // Render specific components
            let content = null;
            if (el.type === 'icon') {
              const isPhosphor = el.iconType === 'phosphor';
              const IconComponent = isPhosphor ? Phosphor[el.name] : Lucide[el.name];
              if (IconComponent) {
                content = isPhosphor ? (
                  <IconComponent
                    size={size}
                    color={el.color || '#000000'}
                    weight={el.weight || 'regular'}
                    style={{ width: '100%', height: '100%', display: 'block' }}
                  />
                ) : (
                  <IconComponent
                    size={size}
                    color={el.color || '#000000'}
                    strokeWidth={el.strokeWidth || 2}
                    style={{ width: '100%', height: '100%', display: 'block' }}
                  />
                );
              }
            } else if (el.type === 'text') {
              content = (
                <text
                  x="0"
                  y="0"
                  fill={el.color || '#000000'}
                  fontSize={el.size || 24}
                  fontWeight={el.fontWeight || 'bold'}
                  fontFamily={el.fontFamily || 'Inter'}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ userSelect: 'none' }}
                >
                  {el.text}
                </text>
              );
            } else if (el.type === 'image' && el.src) {
              content = (
                <image
                  href={el.src}
                  width={size}
                  height={size}
                  x={-size / 2}
                  y={-size / 2}
                />
              );
            }

            // Wrapping group for positioning, rotation, opacity and selected styles
            return (
              <g
                key={el.id}
                transform={`translate(${el.x}, ${el.y}) rotate(${el.rotation || 0})`}
                opacity={(el.opacity ?? 100) / 100}
                onMouseDown={(e) => handleMouseDown(e, el)}
                onTouchStart={(e) => handleMouseDown(e, el)}
                className={`canvas-element-group ${isSelected ? 'selected' : ''}`}
                style={{ cursor: 'move' }}
              >
                {/* For select outlines, draw bounding box */}
                {isSelected && (
                  <rect
                    x={el.type === 'text' ? -el.text.length * (size * 0.3) : -size / 2 - 4}
                    y={-size / 2 - 4}
                    width={el.type === 'text' ? el.text.length * (size * 0.6) : size + 8}
                    height={size + 8}
                    fill="none"
                    stroke="#172e37"
                    strokeDasharray="4,4"
                    strokeWidth="2"
                    className="selected"
                  />
                )}
                
                {/* Apply mirror flipping and icon centering */}
                <g transform={`scale(${el.flipH ? -1 : 1}, ${el.flipV ? -1 : 1})`}>
                  {el.type === 'icon' ? (
                    <g transform={`translate(${-size / 2}, ${-size / 2})`}>
                      {content}
                    </g>
                  ) : (
                    content
                  )}
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
