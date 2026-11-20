import { useEffect, useState } from 'react';
import { ImageIcon, SparkleIcon } from '@phosphor-icons/react';
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { isScreenNode, platformDef, SCREEN_PLATFORMS, type ScreenPlatform } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { importFiles } from '@/io/importActions';
import { flowSource, flowSourceLabel } from '@/wireframe/flows';
import { usePresence } from '@/agent/agentStore';
import { availability, presenceLabel } from '@/agent/jobs';
import { guessPlatform, sendAdapt, sendNextScreen, sendRequest, sendScreenshot, useAgentRequest, type AgentRequest } from '@/agent/commands';
import { WhyDisabled } from '@/agent/ui/Unavailable';
import { isMac } from '@/actions/registry';

/** The agent job dialog: what the job is about, an optional hint (the request text for "Ask the agent…"), Send. */
export function AgentJobDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const request = useAgentRequest((s) => s.request);
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">{request && <AgentJobForm key={keyOf(request)} request={request} onClose={() => onOpenChange(false)} />}</ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

let seq = 0;
const keys = new WeakMap<AgentRequest, number>();
const keyOf = (r: AgentRequest) => {
  if (!keys.has(r)) keys.set(r, ++seq);
  return keys.get(r)!;
};

/** A preview URL and the natural size of a pasted image (the URL is made and revoked by the effect itself). */
function useImageInfo(file: File | null) {
  const [info, setInfo] = useState<{ file: File; url: string; size: { width: number; height: number } } | null>(null);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    let live = true;
    let settled = false;
    // A cleaned-up effect (React runs effects twice in development) neither sets its URL as the preview nor revokes it
    // while its image is still loading (that load failed with ERR_FILE_NOT_FOUND in the console).
    img.onload = () => {
      settled = true;
      if (live) setInfo({ file, url, size: { width: img.naturalWidth, height: img.naturalHeight } });
      else URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      settled = true;
      if (!live) URL.revokeObjectURL(url);
    };
    img.src = url;
    return () => {
      live = false;
      if (settled) URL.revokeObjectURL(url);
    };
  }, [file]);
  return info && info.file === file ? { url: info.url, size: info.size } : { url: null, size: null };
}

function AgentJobForm({ request, onClose }: { request: AgentRequest; onClose: () => void }) {
  const doc = useDocStore((s) => s.doc);
  const presence = usePresence();
  const avail = availability(presence, { wireframe: !!doc.wireframe });
  const reason = avail.ok ? null : avail.reason;
  const [hint, setHint] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const file = request.kind === 'screenshot' ? request.file : null;
  const { url, size } = useImageInfo(file);
  const [platform, setPlatform] = useState<ScreenPlatform | null>(null);
  const shownPlatform: ScreenPlatform = platform ?? (size ? guessPlatform(size.width, size.height) : 'phone');

  let title = '';
  let description = '';
  let action = 'Send';
  let hintLabel = 'Hint (optional)';
  let hintPlaceholder = 'Anything the agent should know';
  switch (request.kind) {
    case 'screenshot':
      title = 'Pasted screenshot';
      description = 'Place it on the canvas as it is, or have the agent rebuild it as a wireframe screen with library components.';
      action = 'Turn into a wireframe with AI';
      hintPlaceholder = 'e.g. the bottom bar is the app’s tab bar';
      break;
    case 'next-screen': {
      const src = flowSource(doc, request.menu.fromId);
      const label = (src ? flowSourceLabel(doc, src, request.menu.part) : '') || 'element';
      title = `Generate “${label}” with AI`;
      description = `A new screen is made now, empty and linked from “${label}”; the agent then fills it in.`;
      action = 'Generate';
      hintPlaceholder = 'e.g. a list of saved items with a search field';
      break;
    }
    case 'adapt': {
      const frame = doc.children.find((n) => n.id === request.frameId);
      const nm = frame && isScreenNode(frame) ? frame.name : 'screen';
      title = `Adapt “${nm}” to ${platformDef(request.to).label.toLowerCase()} with AI`;
      description = `The agent adds a ${platformDef(request.to).label.toLowerCase()} variant of this screen, laid out for that width.`;
      action = 'Adapt';
      hintPlaceholder = 'e.g. list and details side by side';
      break;
    }
    case 'request':
      title = 'Ask the agent';
      description = 'A request about the whole project; the agent works on it live, and you see the changes as they happen.';
      action = 'Send';
      hintLabel = 'Request';
      hintPlaceholder = 'e.g. add an empty state to every list screen';
      break;
  }
  const needsText = request.kind === 'request' && !hint.trim();

  const send = async () => {
    if (!avail.ok || needsText || busy) return;
    setBusy(true);
    try {
      let job = null;
      if (request.kind === 'screenshot') job = await sendScreenshot(request.file, { platform: shownPlatform, name, hint });
      else if (request.kind === 'next-screen') job = await sendNextScreen(request.menu, { shared: request.shared, hint });
      else if (request.kind === 'adapt') job = await sendAdapt(request.frameId, request.to, { hint });
      else job = await sendRequest(hint);
      if (job) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>{title}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>{description}</ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <ResponsiveDialogBody className="flex flex-col gap-4">
        {url && (
          <div className="flex justify-center rounded-md border bg-muted/40 p-2">
            <img src={url} alt="The pasted screenshot" className="max-h-48 rounded-sm object-contain" />
          </div>
        )}
        {request.kind === 'screenshot' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="agent-platform">Platform</Label>
              <Select value={shownPlatform} onValueChange={(v) => setPlatform(v as ScreenPlatform)}>
                <SelectTrigger id="agent-platform" size="sm" className="w-full" aria-label="Platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCREEN_PLATFORMS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label} · {p.width}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="agent-name">Screen name (optional)</Label>
              <Input id="agent-name" className="h-8" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="From the screenshot" />
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="agent-hint">{hintLabel}</Label>
          <Textarea
            id="agent-hint"
            autoFocus={request.kind !== 'screenshot'}
            rows={request.kind === 'request' ? 4 : 2}
            value={hint}
            placeholder={hintPlaceholder}
            onChange={(e) => setHint(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (isMac ? e.metaKey : e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
          />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="agent-dialog-presence">
          <SparkleIcon className="size-3.5" /> {presenceLabel(presence)}
          {presence.kind === 'busy' && ' · the job waits until it is free'}
        </p>
        {reason && <p className="text-xs text-destructive">{reason}</p>}
      </ResponsiveDialogBody>
      <ResponsiveDialogFooter>
        {request.kind === 'screenshot' ? (
          <Button
            variant="outline"
            onClick={() => {
              onClose();
              void importFiles([request.file], request.at);
            }}
          >
            <ImageIcon data-icon="inline-start" />
            Place as reference image
          </Button>
        ) : (
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        )}
        <WhyDisabled reason={reason}>
          <Button onClick={() => void send()} disabled={!avail.ok || needsText || busy}>
            <SparkleIcon data-icon="inline-start" />
            {busy ? 'Sending…' : action}
          </Button>
        </WhyDisabled>
      </ResponsiveDialogFooter>
    </>
  );
}
