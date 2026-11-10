// Where the sync server binaries live. Release archive names carry no version, so
// releases/latest/download/<file> is a stable link.

export const REPO_URL = 'https://github.com/henriquefps/logo-designer';
export const DOWNLOAD_BASE = `${REPO_URL}/releases/latest/download`;
export const CHECKSUMS_URL = `${DOWNLOAD_BASE}/checksums.txt`;
export const DOCKER_IMAGE = 'ghcr.io/henriquefps/designer-sync';
export const DEFAULT_PORT = 3051;

export type Os = 'darwin' | 'linux' | 'windows';
export type Arch = 'amd64' | 'arm64';

export interface SyncAsset {
  os: Os;
  arch: Arch;
  label: string;
  file: string;
  url: string;
}

const asset = (os: Os, arch: Arch, label: string): SyncAsset => {
  const file = `designer-sync_${os}_${arch}.${os === 'windows' ? 'zip' : 'tar.gz'}`;
  return { os, arch, label, file, url: `${DOWNLOAD_BASE}/${file}` };
};

export const SYNC_ASSETS: SyncAsset[] = [
  asset('linux', 'amd64', 'Linux, Intel/AMD'),
  asset('linux', 'arm64', 'Linux, ARM (Raspberry Pi 4/5, 64-bit)'),
  asset('darwin', 'arm64', 'macOS, Apple silicon'),
  asset('darwin', 'amd64', 'macOS, Intel'),
  asset('windows', 'amd64', 'Windows, Intel/AMD'),
  asset('windows', 'arm64', 'Windows, ARM'),
];

export const findAsset = (os: Os, arch: Arch): SyncAsset => SYNC_ASSETS.find((a) => a.os === os && a.arch === arch) ?? SYNC_ASSETS[0];

export const DOCKER_RUN = `mkdir -p data && sudo chown 65532:65532 data
docker run -d --name designer-sync --restart unless-stopped \\
  -p ${DEFAULT_PORT}:${DEFAULT_PORT} -v "$(pwd)/data:/app/data" \\
  ${DOCKER_IMAGE}:latest`;

/** Best guess of the visitor's OS, to preselect the right tab. Phones can't run the server. */
export function detectOs(): { os: Os; mobile: boolean } {
  if (typeof navigator === 'undefined') return { os: 'linux', mobile: false };
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return { os: 'linux', mobile: true };
  if (/Mac/i.test(ua)) return { os: 'darwin', mobile: false };
  if (/Win/i.test(ua)) return { os: 'windows', mobile: false };
  return { os: 'linux', mobile: false };
}
