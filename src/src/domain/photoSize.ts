/**
 * The size to shrink a camera photo to before it is uploaded: the longer side
 * becomes at most `maxEdge`, keeping the shape, never enlarging. Returns null
 * when it is already small enough (or its size is unknown).
 */
export function resizeTarget(
  width: number | undefined,
  height: number | undefined,
  maxEdge: number,
): { width: number } | { height: number } | null {
  if (!width || !height) return null;
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}
