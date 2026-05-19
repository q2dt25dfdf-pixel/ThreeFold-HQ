import { supabase } from "./supabase";

const BUCKET = "intake-files";

export async function getSignedUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    console.error("getSignedUrl error:", error?.message ?? "no URL returned");
    return null;
  }

  return data.signedUrl;
}

export async function getSignedUrls(
  paths: string[],
  expiresInSeconds = 3600,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, expiresInSeconds);

  if (error || !data) {
    console.error("getSignedUrls error:", error?.message ?? "no data returned");
    return {};
  }

  return Object.fromEntries(
    data.flatMap((entry, index) => (
      entry.signedUrl ? [[entry.path || paths[index], entry.signedUrl] as const] : []
    )),
  );
}
