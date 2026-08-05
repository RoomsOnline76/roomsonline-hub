/**
 * Image delivery helpers.
 *
 * Property media lives in Supabase Storage and is often uploaded at full
 * camera resolution. Serving those originals into small cards is the single
 * biggest LCP cost on the public routes, so every render path should go
 * through `optimizedImage` / `imageSrcSet` to request a resized, re-compressed
 * variant from the storage image renderer.
 */

const OBJECT_PATH = "/storage/v1/object/public/";
const RENDER_PATH = "/storage/v1/render/image/public/";

/** True when the URL points at a public Supabase Storage object we can transform. */
function isTransformable(url: string): boolean {
  return typeof url === "string" && url.includes(OBJECT_PATH) && !url.endsWith(".svg");
}

/**
 * Returns a width-constrained, quality-tuned variant of a storage image.
 * Non-storage URLs (bundled assets, remote CDNs) are returned untouched.
 */
export function optimizedImage(url: string | null | undefined, width: number, quality = 70): string {
  if (!url) return "";
  if (!isTransformable(url)) return url;
  const base = url.split("?")[0].replace(OBJECT_PATH, RENDER_PATH);
  return `${base}?width=${Math.round(width)}&quality=${quality}&resize=cover`;
}

/**
 * Builds a `srcSet` string for responsive delivery. Returns undefined when the
 * source cannot be transformed, so the caller can simply spread it onto `<img>`.
 */
export function imageSrcSet(
  url: string | null | undefined,
  widths: number[],
  quality = 70,
): string | undefined {
  if (!url || !isTransformable(url)) return undefined;
  return widths.map((w) => `${optimizedImage(url, w, quality)} ${w}w`).join(", ");
}
