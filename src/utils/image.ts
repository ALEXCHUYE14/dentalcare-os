/**
 * Reduce una imagen en el navegador antes de subirla (menos almacenamiento y menos egress
 * cada vez que se visualiza). SVG, PDF y archivos que ya cumplen el límite se devuelven intactos.
 */
export async function downscaleImage(
  file: File,
  { maxSide, maxBytes, type, quality = 0.9 }: { maxSide: number; maxBytes: number; type: 'image/jpeg' | 'image/png' | 'image/webp'; quality?: number },
): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // formato no decodificable por el navegador: se sube tal cual
  }

  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= maxBytes) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'; // JPEG no admite transparencia
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob || blob.size >= file.size) return file; // no mejoró: conservar el original

    const ext = type === 'image/jpeg' ? 'jpg' : type.split('/')[1];
    const name = file.name.replace(/\.[^.]+$/, '') + '.' + ext;
    return new File([blob], name, { type, lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

export function formatBytes(n: number | null | undefined): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
