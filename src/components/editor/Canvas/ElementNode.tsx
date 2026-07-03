import { useLayoutEffect, useRef } from 'react';
import type { LogoElement } from '@/types/element';
import { useIconModule } from '@/hooks/useIconModule';
import { useUIStore } from '@/store/useUIStore';
import { getElementSize } from '@/lib/elementBounds';
import { ShapeContent } from './ShapeContent';

interface ElementNodeProps {
  element: LogoElement;
  isSelected: boolean;
  isHovered: boolean;
  onPointerDown: (e: React.PointerEvent<SVGGElement>, element: LogoElement) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onMeasureText?: (id: string, width: number, height: number) => void;
}

/**
 * Renders one placed icon/text/image element. Icon lookup is a runtime
 * `module[name]` map access, which is inherently incompatible with
 * tree-shaking — the library is dynamically imported (see useIconModule) so
 * it lands in its own chunk instead of the initial bundle, resolving
 * asynchronously the first time any icon element needs it.
 */
export function ElementNode({ element, isSelected, isHovered, onPointerDown, onPointerEnter, onPointerLeave, onMeasureText }: ElementNodeProps) {
  const textRef = useRef<SVGTextElement>(null);
  const iconModule = useIconModule(element.type === 'icon' ? element.iconType : null);
  const textSize = useUIStore((s) => (element.type === 'text' ? s.textSizes[element.id] : undefined));
  const measuredSize = getElementSize(element, textSize);
  // Lines/paths can be visually near-zero-thickness on one axis (a perfectly horizontal
  // line has ~0 height) — pad just the invisible hit-area, not the true selection bounds.
  const isThinShape = element.type === 'shape' && (element.shape === 'line' || element.shape === 'path');
  const MIN_HIT_THICKNESS = 16;
  const hitArea = isThinShape
    ? { width: Math.max(measuredSize.width, MIN_HIT_THICKNESS), height: Math.max(measuredSize.height, MIN_HIT_THICKNESS) }
    : measuredSize;

  useLayoutEffect(() => {
    if (element.type !== 'text' || !textRef.current || !onMeasureText) return;
    const bbox = textRef.current.getBBox();
    onMeasureText(element.id, bbox.width, bbox.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.type, element.id, element.type === 'text' ? element.text : null, element.type === 'text' ? element.size : null, element.type === 'text' ? element.fontWeight : null, element.type === 'text' ? element.fontFamily : null]);

  const size = 'size' in element ? element.size : 64;

  let content: React.ReactNode = null;
  if (element.type === 'icon') {
    const isPhosphor = element.iconType === 'phosphor';
    const IconComponent = iconModule?.[element.name];
    if (IconComponent) {
      content = isPhosphor ? (
        <IconComponent size={size} color={element.color} weight={element.weight ?? 'regular'} style={{ width: '100%', height: '100%', display: 'block' }} />
      ) : (
        <IconComponent size={size} color={element.color} strokeWidth={element.strokeWidth ?? 2} style={{ width: '100%', height: '100%', display: 'block' }} />
      );
    }
  } else if (element.type === 'text') {
    content = (
      <text
        ref={textRef}
        x="0"
        y="0"
        fill={element.color}
        fontSize={element.size}
        fontWeight={element.fontWeight}
        fontFamily={element.fontFamily}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ userSelect: 'none' }}
      >
        {element.text}
      </text>
    );
  } else if (element.type === 'image' && element.src) {
    content = <image href={element.src} width={size} height={size} x={-size / 2} y={-size / 2} preserveAspectRatio="xMidYMid slice" />;
  } else if (element.type === 'shape') {
    content = (
      <ShapeContent
        shape={element.shape}
        width={element.width}
        height={element.height}
        fill={element.fill}
        stroke={element.stroke}
        strokeWidth={element.strokeWidth}
        cornerRadius={element.cornerRadius}
        points={element.points}
      />
    );
  }

  return (
    <g
      transform={`translate(${element.x}, ${element.y}) rotate(${element.rotation})`}
      opacity={element.opacity / 100}
      onPointerDown={(e) => onPointerDown(e, element)}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{ cursor: element.locked ? 'default' : 'move' }}
      data-element-id={element.id}
      data-selected={isSelected || undefined}
      data-hovered={isHovered || undefined}
    >
      {/* Invisible hit-area covering the full bounding box — icons are stroke-only (often
          hollow in the middle) and would otherwise only be clickable on their painted pixels. */}
      <rect x={-hitArea.width / 2} y={-hitArea.height / 2} width={hitArea.width} height={hitArea.height} fill="transparent" stroke="none" />
      <g transform={`scale(${element.flipH ? -1 : 1}, ${element.flipV ? -1 : 1})`}>
        {element.type === 'icon' ? <g transform={`translate(${-size / 2}, ${-size / 2})`}>{content}</g> : content}
      </g>
    </g>
  );
}
