import { useState } from 'react';
import { CheckIcon, CopyIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

/** A command or file with a copy button. */
export function CodeBlock({ code, what = 'Commands' }: { code: string; what?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context): the text is still selectable.
    }
  };
  return (
    <div className="relative rounded-lg border bg-muted/50">
      <pre className="overflow-x-auto p-3 pr-12 font-mono text-[0.8125rem] leading-relaxed">
        <code>{code}</code>
      </pre>
      <Button variant="ghost" size="icon" className="absolute top-1 right-1" aria-label={`Copy ${what}`} onClick={() => void copy()}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  );
}
