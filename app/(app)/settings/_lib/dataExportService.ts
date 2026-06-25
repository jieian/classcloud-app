/**
 * Personal-data export (RA 10173 Sec. 16/18). Fetches the signed-in user's data
 * from the server route and triggers a browser download. Throws on failure so the
 * caller can surface a notification.
 */

/** Dated default used whenever the Content-Disposition filename can't be read. */
function fallbackFilename(): string {
  return `classcloud-my-data-${new Date().toISOString().slice(0, 10)}.json`;
}

/**
 * Best-effort parse of `filename="..."` from a Content-Disposition header. The
 * fallback is unconditional: any missing/empty/malformed header yields the dated
 * default rather than throwing (some fetch/browser layers strip or mangle it).
 */
function filenameFromHeader(header: string | null): string {
  const fallback = fallbackFilename();
  if (!header) return fallback;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  const name = match?.[1]?.trim();
  return name && name.length > 0 ? name : fallback;
}

/** Downloads the current user's personal-data export as a JSON file. */
export async function downloadMyData(): Promise<void> {
  const res = await fetch("/api/settings/data-export");

  if (res.status === 429) {
    throw new Error("Too many export requests, please try again later.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to export your data.");
  }

  const blob = await res.blob();
  const filename = filenameFromHeader(res.headers.get("Content-Disposition"));

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Revoke unconditionally so the blob URL never leaks on any exit path.
    URL.revokeObjectURL(url);
  }
}
