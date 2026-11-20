import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { normalizeTile } from '@/icon';

/** A hex colour field: colour well + hex input (validated) + reset. Stores "no value" for the default. */
export function HexColorField({ value, def, label, onChange }: { value: string | undefined; def: string; label: string; onChange: (v: string | undefined) => void }) {
  const cur = value ?? def;
  const [text, setText] = useState(cur);
  const [prev, setPrev] = useState(cur);
  if (prev !== cur) {
    setPrev(cur);
    setText(cur);
  }
  const commit = (v: string) => {
    const n = normalizeTile(v);
    if (!n) return setText(cur);
    setText(n);
    if (n !== cur) onChange(n === def ? undefined : n);
  };
  const invalid = !normalizeTile(text);
  return (
    <div className="flex items-center gap-2">
      <input type="color" aria-label={`${label} picker`} value={cur} onChange={(e) => commit(e.target.value)} className="size-7 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5" />
      <Input
        aria-label={label}
        aria-invalid={invalid}
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(text)}
        onKeyDown={(e) => e.key === 'Enter' && commit(text)}
        className="h-7 font-mono text-xs"
      />
      <Button size="sm" variant="ghost" disabled={cur === def} onClick={() => commit(def)}>
        Reset
      </Button>
    </div>
  );
}
