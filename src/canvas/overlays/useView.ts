import { multiply, scale, translate, type Matrix, type Vec } from '@/model';
import { useEditorStore } from '@/store/useEditorStore';
import { useShallow } from 'zustand/react/shallow';

/** Current view: document → screen matrix and a point converter. */
export function useView() {
  const { zoom, pan } = useEditorStore(useShallow((s) => ({ zoom: s.zoom, pan: s.pan })));
  const matrix: Matrix = multiply(translate(pan.x, pan.y), scale(zoom));
  const toScreen = (p: Vec): Vec => ({ x: p.x * zoom + pan.x, y: p.y * zoom + pan.y });
  return { zoom, pan, matrix, toScreen };
}
