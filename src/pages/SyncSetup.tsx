import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeftIcon, GithubLogoIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ThemeMenu } from '@/theme/ThemeMenu';
import { useTheme } from '@/theme/theme';
import { CodeBlock } from './CodeBlock';
import { CHECKSUMS_URL, DEFAULT_PORT, detectOs, DOCKER_IMAGE, DOCKER_RUN, findAsset, REPO_URL, SYNC_ASSETS, type Os } from './syncDownloads';

const DOCS_URL = `${REPO_URL}/blob/main/docs/sync.md`;
const README_URL = `${REPO_URL}/blob/main/sync-server/README.md`;
const P = DEFAULT_PORT;

const SECTIONS = [
  { id: 'download', title: 'Download' },
  { id: 'run', title: 'Run it' },
  { id: 'connect', title: 'Connect the app' },
  { id: 'anywhere', title: 'Use it from anywhere' },
  { id: 'security', title: 'Security' },
  { id: 'backups', title: 'Backups' },
] as const;

const OS_LABELS: Record<Os, string> = { darwin: 'macOS', linux: 'Linux', windows: 'Windows' };

const COMPOSE = `services:
  designer-sync:
    image: ${DOCKER_IMAGE}:latest
    ports:
      - "${P}:${P}"
    volumes:
      - designer-sync-data:/app/data
    environment:
      - SYNC_API_KEY=\${SYNC_API_KEY:-}
    restart: unless-stopped

volumes:
  designer-sync-data:`;

const QUICK_TUNNEL = `SYNC_API_KEY=$(designer-sync genkey) && echo "$SYNC_API_KEY"
SYNC_API_KEY=$SYNC_API_KEY designer-sync &
cloudflared tunnel --url http://localhost:${P}`;

const NAMED_TUNNEL = `cloudflared tunnel login
cloudflared tunnel create designer-sync
cloudflared tunnel route dns designer-sync sync.example.com`;

const TUNNEL_CONFIG = `tunnel: <UUID>
credentials-file: /home/you/.cloudflared/<UUID>.json
ingress:
  - hostname: sync.example.com
    service: http://localhost:${P}
  - service: http_status:404`;

const BACKUP = 'cp -a /var/lib/designer-sync ~/backups/designer-sync-$(date +%F)';

function runCommands(os: Os, arch: Arch): { shell: string; code: string } {
  const a = findAsset(os, arch);
  if (os === 'windows') {
    return {
      shell: 'PowerShell',
      code: `Invoke-WebRequest -Uri ${a.url} -OutFile ${a.file}\nExpand-Archive ${a.file} -DestinationPath designer-sync\n.\\designer-sync\\designer-sync.exe`,
    };
  }
  const lines = [`curl -LO ${a.url}`, `tar xzf ${a.file}`];
  if (os === 'darwin') lines.push('xattr -d com.apple.quarantine ./designer-sync   # first run only');
  lines.push('./designer-sync');
  return { shell: 'Terminal', code: lines.join('\n') };
}
type Arch = 'amd64' | 'arm64';

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.8125rem] [overflow-wrap:anywhere]">{children}</code>;
}
function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="font-medium text-primary underline-offset-4 hover:underline" target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}
function Text({ children }: { children: ReactNode }) {
  return <p className="text-[0.9375rem] leading-relaxed">{children}</p>;
}
function Muted({ children }: { children: ReactNode }) {
  return <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{children}</p>;
}
function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[0.9375rem] font-semibold">{title}</h3>
      {children}
    </div>
  );
}
function Steps({ children }: { children: ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-2 pl-5 text-[0.9375rem] leading-relaxed marker:text-muted-foreground">{children}</ol>;
}
function Section({ index, id, title, children }: { index: number; id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-20 flex-col gap-4 border-t pt-8 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1">
        <p className="eyebrow">Step {index}</p>
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

export default function SyncSetup() {
  const theme = useTheme();
  const detected = detectOs();
  const [os, setOs] = useState<Os | null>(null);
  const runOs = os ?? detected.os;
  const arch: Arch = runOs === 'darwin' ? 'arm64' : 'amd64';
  const run = runCommands(runOs, arch);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Sync server setup · Designer';
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="h-dvh overflow-y-auto overscroll-contain bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-background px-2 md:px-4">
        <Button variant="ghost" asChild>
          <a href="/">
            <ArrowLeftIcon data-icon="inline-start" />
            Back to editor
          </a>
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild aria-label="Source on GitHub">
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              <GithubLogoIcon />
            </a>
          </Button>
          <ThemeMenu />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-4">
        <article className="flex flex-col gap-8 rounded-xl border bg-card p-5 shadow-xs sm:p-8 lg:p-10">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <img src="/icon.svg" alt="" className="size-10 shrink-0 rounded-lg" />
              <div className="flex flex-col">
                <p className="eyebrow">Designer</p>
                <h1 className="text-2xl font-semibold">Sync server setup</h1>
              </div>
            </div>
            <Text>
              Designer keeps projects in your browser. To open them on your other devices, run the small sync server on a computer you
              own: one at home, a Raspberry Pi, a NAS or a small VPS. It is a single program with no dependencies and keeps one JSON file per
              project in a folder you own. The newest edit wins for each project, deletions sync too, and when two devices edited the same
              project offline the older version is kept as a “conflicted copy”.
            </Text>
            <nav aria-label="On this page" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {SECTIONS.map((s, i) => (
                <a key={s.id} href={`#${s.id}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  {i + 1}. {s.title}
                </a>
              ))}
            </nav>
          </div>

          <div className="flex flex-col gap-8">
            <Section index={1} id="download" title="Download">
              {detected.mobile && (
                <Muted>You are on a phone or tablet. The server runs on a computer, so open this page there, or pick the file from the table.</Muted>
              )}
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[28rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th scope="col" className="px-3 py-2 font-medium">System</th>
                      <th scope="col" className="px-3 py-2 font-medium">Archive</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SYNC_ASSETS.map((a) => (
                      <tr key={a.file} className="border-b last:border-b-0">
                        <td className="px-3 py-2.5">{a.label}</td>
                        <td className="px-3 py-2.5">
                          <a href={a.url} download className="font-mono text-[0.8125rem] text-primary underline-offset-4 hover:underline">
                            {a.file}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Muted>
                <A href={CHECKSUMS_URL}>checksums.txt</A> in the same release lists the SHA-256 of every archive. These links always point at
                the latest release.
              </Muted>
              <Sub title="Docker">
                <Text>
                  The image <Code>{DOCKER_IMAGE}</Code> runs on linux/amd64 and linux/arm64, as a non-root user, and keeps data in{' '}
                  <Code>/app/data</Code>.
                </Text>
                <CodeBlock code={DOCKER_RUN} what="Docker command" />
                <Muted>Or with Docker Compose:</Muted>
                <CodeBlock code={COMPOSE} what="Compose file" />
              </Sub>
            </Section>

            <Section index={2} id="run" title="Run it">
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={runOs}
                onValueChange={(v) => v && setOs(v as Os)}
                aria-label="Operating system"
                className="self-start"
              >
                {(['darwin', 'linux', 'windows'] as const).map((o) => (
                  <ToggleGroupItem key={o} value={o} className="px-3 data-[state=on]:bg-muted data-[state=on]:text-foreground">
                    {OS_LABELS[o]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Muted>{run.shell}</Muted>
              <CodeBlock code={run.code} />
              <Text>
                It listens on port {P} and stores data in <Code>./data</Code>. Stop it with Ctrl+C. To run it as a service (systemd, launchd,
                Task Scheduler), see the <A href={README_URL}>server README</A>.
              </Text>
              <Muted>
                Settings are flags or environment variables: <Code>PORT</Code>, <Code>DATA_DIR</Code>, <Code>SYNC_API_KEY</Code>,{' '}
                <Code>ALLOWED_ORIGINS</Code>, <Code>MAX_BODY_MB</Code> (largest project, default 64 MB).
              </Muted>
            </Section>

            <Section index={3} id="connect" title="Connect the app">
              <Steps>
                <li>
                  In Designer open <strong>File → Sync…</strong> and turn on <strong>Sync this device</strong>.
                </li>
                <li>
                  Enter the <strong>server address</strong>: on your network <Code>http://&lt;server-ip&gt;:{P}</Code>, through a tunnel the
                  HTTPS address, e.g. <Code>https://sync.example.com</Code>.
                </li>
                <li>If the server has an API key, paste it in <strong>API key</strong>.</li>
                <li>Press <strong>Sync now</strong>, then repeat on every device.</li>
              </Steps>
              <Muted>
                A page opened over <Code>https://</Code> (like designer.hfps.dev) can't call a plain <Code>http://</Code> server: browsers block
                it (“mixed content”). Give the server an HTTPS address with Cloudflare Tunnel or Tailscale Serve, below.
              </Muted>
            </Section>

            <Section index={4} id="anywhere" title="Use it from anywhere">
              <Text>
                Set an API key first: tunnelled requests carry proxy headers, and a server without a key refuses them. Create one with{' '}
                <Code>designer-sync genkey</Code>.
              </Text>
              <Sub title="Cloudflare Tunnel, quick test">
                <CodeBlock code={QUICK_TUNNEL} />
                <Muted>Prints a random <Code>https://…trycloudflare.com</Code> address that changes on every restart: testing only.</Muted>
              </Sub>
              <Sub title="Cloudflare Tunnel on your own domain">
                <CodeBlock code={NAMED_TUNNEL} />
                <Muted>
                  Then <Code>~/.cloudflared/config.yml</Code>, and <Code>sudo cloudflared service install</Code> to start it at boot:
                </Muted>
                <CodeBlock code={TUNNEL_CONFIG} what="Tunnel config" />
                <Muted>
                  Docker Compose with a tunnel token and the secrets kept out of files: <A href={DOCS_URL}>docs/sync.md</A>. Don't put
                  Cloudflare Access (a login page) in front of the hostname: the app syncs in the background and can't log in.
                </Muted>
              </Sub>
              <Sub title="Tailscale">
                <Text>
                  With Tailscale on the server and your devices, use <Code>http://&lt;tailscale-ip&gt;:{P}</Code> from an HTTP copy of the
                  app. For the HTTPS app, run <Code>tailscale serve --bg {P}</Code> on the server and use the{' '}
                  <Code>https://&lt;machine&gt;.&lt;tailnet&gt;.ts.net</Code> address it prints (set an API key: Serve adds proxy headers).
                </Text>
              </Sub>
            </Section>

            <Section index={5} id="security" title="Security">
              <Text>
                Your projects, and the fonts you uploaded, are only as private as the server. Without an API key it answers requests from
                your local network only (loopback, private and Tailscale addresses, and nothing that came through a proxy). With a key, anyone
                who has it can read and overwrite everything, so treat it like a password: if it leaks, make a new one and update the server
                and every device. Files on disk are readable only by the server's user.
              </Text>
            </Section>

            <Section index={6} id="backups" title="Backups">
              <Text>
                Everything is in the data folder. Copy it, for example from a nightly job. Each device also keeps its own copy of every
                project, so a lost server can be rebuilt by syncing a device to an empty one.
              </Text>
              <CodeBlock code={BACKUP} />
            </Section>
          </div>
        </article>
      </main>
      <Toaster theme={theme} />
    </div>
  );
}
