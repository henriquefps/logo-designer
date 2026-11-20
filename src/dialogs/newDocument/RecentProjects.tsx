import { useEffect, useState } from 'react';
import { loadDocument, type ProjectMeta } from '@/store/persistence';
import { relativeDate, fullDate } from '@/lib/relativeDate';
import { cn } from '@/lib/utils';

/** Small SVG preview of a saved project (loaded lazily). */
function Thumbnail({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    void (async () => {
      const doc = await loadDocument(id);
      if (!doc || !alive) return;
      const { exportSvg } = await import('@/io/svgExport');
      const { svg } = await exportSvg(doc);
      if (!alive) return;
      objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      setUrl(objectUrl);
    })().catch(() => null);
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return (
    <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border bg-muted p-2" aria-hidden="true">
      {url && <img src={url} alt="" className="max-h-full max-w-full object-contain shadow-xs" draggable={false} />}
    </span>
  );
}

/** The four most recently edited projects (New document, step 1). */
export function RecentProjects({ projects, activeId, onOpen }: { projects: ProjectMeta[]; activeId: string | null; onOpen: (p: ProjectMeta) => void }) {
  const recent = [...projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  if (recent.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Recent projects">
      <h3 className="eyebrow">Recent</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {recent.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p)}
            className={cn(
              'flex min-w-0 flex-col gap-1.5 rounded-lg p-1.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50',
              p.id === activeId && 'bg-muted hover:bg-muted',
            )}
          >
            <Thumbnail id={p.id} />
            <span className="truncate px-0.5 text-sm font-medium">{p.name}</span>
            <span className="px-0.5 text-xs text-muted-foreground" title={fullDate(p.updatedAt)}>
              {relativeDate(p.updatedAt)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
