export const MAX_FOTO_CHARS = 300_000;

function compressSourceToDataUrl(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number
): string {
  const maxDimensions = [960, 720, 540, 400];
  const qualities = [0.82, 0.7, 0.55, 0.42];

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Não foi possível processar a imagem neste navegador.');
  }

  for (const maxDim of maxDimensions) {
    const scale = Math.min(1, maxDim / Math.max(sourceWidth, sourceHeight, 1));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);

    for (const quality of qualities) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= MAX_FOTO_CHARS) {
        return dataUrl;
      }
    }
  }

  throw new Error('Imagem muito grande. Escolha ou tire outra foto para continuar.');
}

function compressDataUrlIfNeeded(rawDataUrl: string): Promise<string> {
  if (rawDataUrl.length <= MAX_FOTO_CHARS) {
    return Promise.resolve(rawDataUrl);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const compressed = compressSourceToDataUrl(
          img,
          img.naturalWidth || img.width || 800,
          img.naturalHeight || img.height || 800
        );
        resolve(compressed);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () =>
      reject(new Error('Imagem muito grande. Escolha uma imagem menor para continuar.'));
    img.src = rawDataUrl;
  });
}

export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        reject(new Error('Falha ao ler o arquivo de imagem.'));
        return;
      }
      compressDataUrlIfNeeded(result).then(resolve).catch(reject);
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo de imagem.'));
    reader.readAsDataURL(file);
  });
}

export function captureVideoFrameAsDataUrl(video: HTMLVideoElement): string {
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  return compressSourceToDataUrl(video, width, height);
}
