import { supabase } from "./supabase";

const INTAKE_BUCKET = "intake-files";
const DESIGNS_BUCKET = "order-designs";

async function _getSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds: number,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    console.error(`getSignedUrl [${bucket}] error:`, error?.message ?? "no URL returned");
    return null;
  }

  return data.signedUrl;
}

async function _getSignedUrls(
  bucket: string,
  paths: string[],
  expiresInSeconds: number,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, expiresInSeconds);

  if (error || !data) {
    console.error(`getSignedUrls [${bucket}] error:`, error?.message ?? "no data returned");
    return {};
  }

  return Object.fromEntries(
    data.flatMap((entry, index) => (
      entry.signedUrl ? [[entry.path || paths[index], entry.signedUrl] as const] : []
    )),
  );
}

// ── intake-files (existing — unchanged callers) ───────────────────────────────

export async function getSignedUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  return _getSignedUrl(INTAKE_BUCKET, path, expiresInSeconds);
}

export async function getSignedUrls(
  paths: string[],
  expiresInSeconds = 3600,
): Promise<Record<string, string>> {
  return _getSignedUrls(INTAKE_BUCKET, paths, expiresInSeconds);
}

// ── order-designs ─────────────────────────────────────────────────────────────

export async function getDesignSignedUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  return _getSignedUrl(DESIGNS_BUCKET, path, expiresInSeconds);
}

export async function getDesignSignedUrls(
  paths: string[],
  expiresInSeconds = 3600,
): Promise<Record<string, string>> {
  return _getSignedUrls(DESIGNS_BUCKET, paths, expiresInSeconds);
}
