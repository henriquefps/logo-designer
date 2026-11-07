import { useCallback, useEffect, useState } from 'react';

export interface UseVirtualGridOptions {
  itemSize: number;
  gap?: number;
  overscan?: number;
}

interface VirtualGridResult {
  containerRef: (node: HTMLElement | null) => void;
  columns: number;
  rowHeight: number;
  totalHeight: number;
  startIndex: number;
  endIndex: number;
  offsetTop: number;
}

/**
 * Minimal fixed-size grid windowing: tracks the container's scroll position
 * and size, and returns which item indices are actually visible (plus
 * overscan) so callers can render only that slice inside a full-height
 * spacer. Same core technique as `react-window`'s FixedSizeGrid, hand-rolled
 * to avoid a new dependency for what's a fairly small amount of logic.
 *
 * Takes a callback ref (not a plain RefObject) so the size-tracking effect
 * re-runs whenever the underlying DOM node actually changes — e.g. if the
 * caller conditionally swaps the container out for an empty-state element
 * and back, a plain `useRef` + `[ref]`-keyed effect would silently keep
 * observing nothing, since the ref object's identity never changes.
 */
export function useVirtualGrid(itemCount: number, { itemSize, gap = 8, overscan = 4 }: UseVirtualGridOptions): VirtualGridResult {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const containerRef = useCallback((el: HTMLElement | null) => setNode(el), []);

  useEffect(() => {
    if (!node) return;

    const onScroll = () => setScrollTop(node.scrollTop);
    node.addEventListener('scroll', onScroll);

    // ResizeObserver fires an initial callback asynchronously right after observe(),
    // even with no actual resize — no need to also read the size synchronously here.
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    resizeObserver.observe(node);

    return () => {
      node.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
    };
  }, [node]);

  const columns = Math.max(1, Math.floor((containerSize.width + gap) / (itemSize + gap)));
  const rowHeight = itemSize + gap;
  const totalRows = Math.ceil(itemCount / columns);
  const totalHeight = totalRows * rowHeight;

  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleRowCount = Math.ceil(containerSize.height / rowHeight) + overscan * 2;
  const endRow = Math.min(totalRows, startRow + visibleRowCount);

  return {
    containerRef,
    columns,
    rowHeight,
    totalHeight,
    startIndex: startRow * columns,
    endIndex: Math.min(itemCount, endRow * columns),
    offsetTop: startRow * rowHeight,
  };
}
