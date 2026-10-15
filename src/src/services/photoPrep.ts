import * as ImageManipulator from "expo-image-manipulator";
import { resizeTarget } from "@/domain/photoSize";

// Task evidence is looked at on a phone or a report, not printed poster size. A
// 1600 pixel long side at 70% quality keeps the detail and is typically a few
// hundred kilobytes instead of the several megabytes a full camera frame is,
// which is most of the time an upload takes on mobile data.
const MAX_EDGE = 1600;
const QUALITY = 0.7;

/** Returns the address of a smaller copy of the photo, or the original if shrinking fails. */
export async function prepareEvidencePhoto(uri: string, width?: number, height?: number): Promise<string> {
  try {
    const target = resizeTarget(width, height, MAX_EDGE);
    const result = await ImageManipulator.manipulateAsync(uri, target ? [{ resize: target }] : [], {
      compress: QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return result.uri;
  } catch {
    // Uploading the full-size photo is slower but still correct.
    return uri;
  }
}
