import { useState } from 'react';
import { CaretDownIcon, CaretRightIcon, EyeIcon, EyeSlashIcon, LockSimpleIcon, LockSimpleOpenIcon, ImageSquareIcon } from '@phosphor-icons/react';
import type { SceneNode } from '@/model';
import { cn } from '@/lib/utils';
import { NODE_ICONS } from './nodeIcons';

export type DropPosition = 'above' | 'below' | 'inside';

interface LayerRowProps {
  node: SceneNode;
  depth: number;
  selected: boolean;
  expanded: boolean;
  dimmed: boolean;
  drop: DropPosition | null;
  onSelect: (e: React.MouseEvent) => void;
  onToggleExpand: () => void;
  onRename: (name: string) => void;
  onToggleVisible: () => void;
  onToggleLock: () => void;
  onStopReference: () => void;
  onHover: (on: boolean) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent, pos: DropPosition) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

export function LayerRow(p: LayerRowProps) {
  const { node, depth, selected } = p;
  const [editing, setEditing] = useState(false);
  const Icon = NODE_ICONS[node.type];
  const isGroup = node.type === 'group';

  const position = (e: React.DragEvent): DropPosition => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (isGroup && y > 0.25 && y < 0.75) return 'inside';
    return y < 0.5 ? 'above' : 'below';
  };

  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-expanded={isGroup ? p.expanded : undefined}
      aria-level={depth + 1}
      draggable={!editing}
      onDragStart={p.onDragStart}
      onDragOver={(e) => p.onDragOver(e, position(e))}
      onDrop={p.onDrop}
      onDragEnd={p.onDragEnd}
      onClick={p.onSelect}
      onMouseEnter={() => p.onHover(true)}
      onMouseLeave={() => p.onHover(false)}
      className={cn(
        'group/row relative flex h-9 cursor-default items-center gap-1 pr-2 text-sm select-none hover:bg-muted/50',
        selected && 'bg-muted font-medium hover:bg-muted',
        p.dimmed && 'text-muted-foreground',
        p.drop === 'inside' && 'ring-2 ring-primary ring-inset',
      )}
      style={{ paddingLeft: 8 + depth * 16 }}
    >
      {p.drop === 'above' && <span className="absolute inset-x-2 top-0 h-0.5 bg-primary" />}
      {p.drop === 'below' && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-primary" />}
      <button
        type="button"
        aria-label={p.expanded ? 'Collapse' : 'Expand'}
        className={cn('flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground', !isGroup && 'invisible')}
        onClick={(e) => {
          e.stopPropagation();
          p.onToggleExpand();
        }}
      >
        {p.expanded ? <CaretDownIcon /> : <CaretRightIcon />}
      </button>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      {editing ? (
        <input
          autoFocus
          aria-label="Layer name"
          defaultValue={node.name}
          className="h-7 min-w-0 flex-1 rounded-sm border border-input bg-card px-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            setEditing(false);
            const v = e.currentTarget.value.trim();
            if (v && v !== node.name) p.onRename(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate pl-1" onDoubleClick={() => setEditing(true)} title={node.name}>
          {node.name}
        </span>
      )}
      {node.reference ? (
        // A reference is one state (locked, not selectable, not exported): its control replaces the lock.
        <RowToggle label="Stop using as reference" active onClick={p.onStopReference} icon={<ImageSquareIcon weight="fill" className="text-primary" />} />
      ) : (
        <RowToggle
          label={node.locked ? 'Unlock' : 'Lock'}
          active={node.locked}
          onClick={p.onToggleLock}
          icon={node.locked ? <LockSimpleIcon /> : <LockSimpleOpenIcon />}
        />
      )}
      <RowToggle
        label={node.visible ? 'Hide' : 'Show'}
        active={!node.visible}
        onClick={p.onToggleVisible}
        icon={node.visible ? <EyeIcon /> : <EyeSlashIcon />}
      />
    </div>
  );
}

function RowToggle({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&_svg]:size-4',
        !active && 'opacity-0 group-hover/row:opacity-100 pointer-coarse:opacity-100',
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {icon}
    </button>
  );
}
