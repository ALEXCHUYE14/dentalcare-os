import { supabase, toAppError, unwrap } from '../lib/supabase';
import type { TenantConfig } from '../types';
import { downscaleImage } from '../utils/image';

export async function getConfig(): Promise<TenantConfig> {
  return unwrap<TenantConfig>(await supabase.from('tenants_config').select('*').eq('id', 1).single());
}

export async function updateConfig(patch: Partial<TenantConfig>): Promise<TenantConfig> {
  const { id: _id, updated_at: _u, ...rest } = patch;
  return unwrap<TenantConfig>(await supabase.from('tenants_config').update(rest).eq('id', 1).select().single());
}

export async function uploadBrandingAsset(original: File, kind: 'logo' | 'qr'): Promise<string> {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(original.type)) throw new Error('El archivo debe ser una imagen (PNG, JPG, SVG o WEBP).');
  // El logo y el QR se muestran en cada página y documento: se guardan livianos (PNG conserva transparencia y nitidez del QR).
  const file = await downscaleImage(original, { maxSide: kind === 'logo' ? 512 : 800, maxBytes: 150 * 1024, type: 'image/png' });
  if (file.size > 2 * 1024 * 1024) throw new Error('La imagen no debe superar los 2 MB.');
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${kind}/${kind}-${Date.now()}.${ext}`;
  // Nombre único por subida → se puede cachear un año en navegador y CDN sin riesgo de ver una versión vieja.
  const { error } = await supabase.storage
    .from('branding')
    .upload(path, file, { upsert: false, cacheControl: '31536000', contentType: file.type });
  if (error) throw toAppError(error);
  return supabase.storage.from('branding').getPublicUrl(path).data.publicUrl;
}

/** Borra del bucket una imagen de marca que dejó de usarse (silencioso si falla). */
export async function removeBrandingAsset(publicUrl: string | null | undefined): Promise<void> {
  const marker = '/object/public/branding/';
  const i = publicUrl?.indexOf(marker) ?? -1;
  if (!publicUrl || i < 0) return;
  const path = decodeURIComponent(publicUrl.slice(i + marker.length).split('?')[0]);
  await supabase.storage.from('branding').remove([path]).catch(() => undefined);
}
