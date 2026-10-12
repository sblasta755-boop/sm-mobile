import * as FileSystem from "expo-file-system/legacy";

/**
 * Downloads one photo and returns it as a data URI, so it can sit inside the
 * report HTML and the print engine never has to fetch anything. Rejects on
 * failure (the caller falls back to the plain link).
 */
export async function photoDataUri(url: string): Promise<string> {
  if (!url) throw new Error("no photo address");
  // A device-local photo is already on the phone.
  const local = url.startsWith("file:") || url.startsWith("content:");
  let path = url;
  let temp: string | null = null;
  if (!local) {
    temp = `${FileSystem.cacheDirectory}report-photo-${Math.random().toString(36).slice(2)}.jpg`;
    const result = await FileSystem.downloadAsync(url, temp);
    if (result.status !== 200) throw new Error(`photo download failed (${result.status})`);
    path = result.uri;
  }
  try {
    const base64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
    return `data:image/jpeg;base64,${base64}`;
  } finally {
    if (temp) FileSystem.deleteAsync(temp, { idempotent: true }).catch(() => {});
  }
}
