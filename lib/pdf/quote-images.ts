export async function loadQuoteImage(source: string, maxSide = 480): Promise<string | null> {
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
        finish(canvas.toDataURL("image/png"));
      } catch {
        finish(null);
      }
    };
    image.src = source;
  });
}
