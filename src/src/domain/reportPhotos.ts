import type { Evidence } from "@/types/smartclean";
import type { ManagementReport } from "@/domain/managementReport";

/** Every photo the report will show, once each (the same picture can be cited twice). */
export function collectReportPhotos(report: ManagementReport): Evidence[] {
  const seen = new Set<string>();
  const photos: Evidence[] = [];
  for (const section of report.sections) {
    for (const photo of [...section.checks.flatMap((c) => c.photos), ...section.taskPhotos]) {
      if (seen.has(photo.id)) continue;
      seen.add(photo.id);
      photos.push(photo);
    }
  }
  return photos;
}

/**
 * Runs `worker` over `items`, at most `limit` at a time, reporting how many
 * have finished. A worker that throws counts as finished with no result, so
 * one bad photo never stops the report.
 */
export async function mapWithProgress<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
  onProgress: (done: number, total: number) => void,
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  let done = 0;
  onProgress(0, items.length);
  const lane = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = await worker(items[index]);
      } catch {
        results[index] = null;
      }
      done += 1;
      onProgress(done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}
