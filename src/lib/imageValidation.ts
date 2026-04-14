export const MIN_IMAGE_WIDTH = 1024;
export const MIN_IMAGE_HEIGHT = 683;

export interface ImageDimensionResult {
  valid: boolean;
  width: number;
  height: number;
}

export function validateImageDimensions(file: File): Promise<ImageDimensionResult> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        valid: img.naturalWidth >= MIN_IMAGE_WIDTH && img.naturalHeight >= MIN_IMAGE_HEIGHT,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ valid: false, width: 0, height: 0 });
    };
    img.src = url;
  });
}

export function getValidationErrorMessage(fileName: string, width: number, height: number): string {
  return `${fileName} is ${width}×${height}px. Minimum required: ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT}px.`;
}
