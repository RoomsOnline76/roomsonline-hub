export const MIN_IMAGE_WIDTH = 1024;
/**
 * Channel (Rentals United) certification minimum — uploads must clear the
 * strictest distribution requirement so the onboarding Media check can pass.
 */
export const MIN_IMAGE_HEIGHT = 768;

export interface ImageDimensionResult {
  valid: boolean;
  width: number;
  height: number;
}

function measure(src: string, revoke?: () => void): Promise<ImageDimensionResult> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      revoke?.();
      resolve({
        valid: img.naturalWidth >= MIN_IMAGE_WIDTH && img.naturalHeight >= MIN_IMAGE_HEIGHT,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.onerror = () => {
      revoke?.();
      resolve({ valid: false, width: 0, height: 0 });
    };
    img.src = src;
  });
}

export function validateImageDimensions(file: File): Promise<ImageDimensionResult> {
  const url = URL.createObjectURL(file);
  return measure(url, () => URL.revokeObjectURL(url));
}

/** Measures an already-stored image by URL (used to flag legacy uploads). */
export function measureImageUrl(url: string): Promise<ImageDimensionResult> {
  return measure(url);
}

export function getValidationErrorMessage(fileName: string, width: number, height: number): string {
  const measured = width && height ? `${width}×${height}px` : "an unreadable size";
  return `${fileName} is ${measured}. Minimum required: ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT}px.`;
}
