import type { Release } from "./changelog";

export type Version = { major: number; minor: number; patch: number };

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** `major.minor.patch`, nothing else — no `v` prefix, pre-release or build tag. */
export function parseVersion(value: string): Version | null {
  const match = SEMVER.exec(value);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** Negative when `a` sorts before `b`. */
export function compareVersions(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

const FIRST_VERSION: Version = { major: 1, minor: 0, patch: 0 };

/**
 * The releases a returning coach has not been told about, newest first.
 *
 * Only minor and major releases count, and only by `major.minor`: someone who
 * last saw 1.1.3 has nothing new in 1.1.5, so patches stay silent. A coach
 * with nothing stored — or something that is not a version — counts as having
 * seen 1.0.0, the version Grep was given when it started announcing changes.
 */
export function releasesToAnnounce(lastSeen: string | null, releases: readonly Release[]): Release[] {
  const seen = (lastSeen === null ? null : parseVersion(lastSeen)) ?? FIRST_VERSION;
  return releases
    .flatMap((release) => {
      const version = parseVersion(release.version);
      if (!version || version.patch !== 0) return [];
      const newer = version.major > seen.major || (version.major === seen.major && version.minor > seen.minor);
      return newer ? [{ release, version }] : [];
    })
    .sort((a, b) => compareVersions(b.version, a.version))
    .map(({ release }) => release);
}

/**
 * Which version this browser last showed the dialog for. Per device, not per
 * account (decision 7), and storage can throw (Safari private mode), so a read
 * that fails returns `false`: the shell then shows nothing rather than show the
 * dialog on every load. `null` means storage works and holds nothing.
 *
 * Shaped for `useSyncExternalStore`: the snapshot is a primitive, and the
 * server snapshot is `false`, so nothing opens before the browser has looked.
 */
export const SEEN_VERSION_KEY = "grep-seen-version";

export function readSeenVersion(): string | null | false {
  try { return window.localStorage.getItem(SEEN_VERSION_KEY); }
  catch { return false; }
}

const listeners = new Set<() => void>();

export function subscribeSeenVersion(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === SEEN_VERSION_KEY || event.key === null) listener(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

export function rememberSeenVersion(version: string) {
  try { window.localStorage.setItem(SEEN_VERSION_KEY, version); } catch { /* it shows again next time */ }
  listeners.forEach((listener) => listener());
}

const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

/** `2026-11-12` → `12. november 2026`, without depending on the runtime's locale data. */
export function formatReleaseDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  return `${Number(match[3])}. ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}
