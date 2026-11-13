function cropLogoPadding(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  const { width, height } = canvas;
  const { data } = context.getImageData(0, 0, width, height);
  const corners = [0, (width - 1) * 4, (height - 1) * width * 4, (width * height - 1) * 4];
  const transparent = corners.every((offset) => data[offset + 3] === 0);
  const lightBackground = data[0] >= 245 && data[1] >= 245 && data[2] >= 245;
  const tolerance = lightBackground ? 10 : 3;
  const matchesBackground = (offset: number) =>
    data[offset + 3] === 255 &&
    Math.abs(data[offset] - data[0]) <= tolerance &&
    Math.abs(data[offset + 1] - data[1]) <= tolerance &&
    Math.abs(data[offset + 2] - data[2]) <= tolerance;
  if (!transparent && !corners.every(matchesBackground)) return canvas;

  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (transparent ? data[offset + 3] === 0 : matchesBackground(offset)) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return canvas;
  if (!transparent && (left === 0 || top === 0 || right === width - 1 || bottom === height - 1)) return canvas;

  const contentWidth = right - left + 1;
  const contentHeight = bottom - top + 1;
  if (contentWidth > width * 0.85 && contentHeight > height * 0.85) return canvas;

  // Keep a small margin around the mark, including on opaque backgrounds.
  const margin = Math.ceil(Math.max(contentWidth, contentHeight) * 0.03);
  const x = Math.max(0, left - margin);
  const y = Math.max(0, top - margin);
  const cropped = document.createElement("canvas");
  cropped.width = Math.min(width, right + margin + 1) - x;
  cropped.height = Math.min(height, bottom + margin + 1) - y;
  const croppedContext = cropped.getContext("2d");
  if (!croppedContext) return canvas;
  croppedContext.drawImage(canvas, x, y, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  return cropped;
}

export function loadQuoteLogo(source: string): Promise<string | null> {
  return loadQuoteImage(source, 960, cropLogoPadding);
}

export async function loadQuoteImage(
  source: string,
  maxSide = 480,
  prepare?: (canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) => HTMLCanvasElement,
): Promise<string | null> {
  if (!source) return null;
  return new Promise((resolve) => {
    const image = new Image();
    if (!source.startsWith("blob:") && !source.startsWith("data:")) image.crossOrigin = "anonymous";

    const finish = (result: string | null) => {
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(result);
    };
    const timer = window.setTimeout(() => {
      finish(null);
      image.removeAttribute("src");
    }, 8000);

    image.onerror = () => finish(null);
    image.onload = () => {
      try {
        const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const context = canvas.getContext("2d");
        if (!context || !image.naturalWidth || !image.naturalHeight) return finish(null);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        finish((prepare ? prepare(canvas, context) : canvas).toDataURL("image/png"));
      } catch {
        finish(null);
      }
    };
    image.src = source;
  });
}
