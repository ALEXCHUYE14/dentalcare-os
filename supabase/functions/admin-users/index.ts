// DentalCare OS · Edge Function "admin-users"
// Alta de personal, cambio de contraseña y eliminación de cuentas pendientes.
// Solo la puede usar un administrador activo. La clave service_role nunca sale del servidor.
//
// Despliegue:  supabase functions deploy admin-users --no-verify-jwt
// (el JWT se valida dentro de la función con auth.getUser)

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const ROLES = ['admin', 'doctor', 'recepcionista', 'asistente'] as const;
type Role = (typeof ROLES)[number];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const fail = (error: string, status = 400) => json({ error }, status);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const optional = (v: unknown, max = 200) => str(v, max) || null;

function validPassword(p: unknown): p is string {
  return typeof p === 'string' && p.length >= 8 && p.length <= 72;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Método no permitido', 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return fail('La función no tiene configuradas las variables de Supabase', 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) Identificar a quien llama y exigir rol de administrador activo
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return fail('No autenticado', 401);
  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth.user) return fail('Sesión inválida o expirada. Vuelve a iniciar sesión.', 401);
  const callerId = auth.user.id;

  const { data: caller } = await admin.from('profiles').select('role, active').eq('id', callerId).maybeSingle();
  if (!caller || !caller.active || caller.role !== 'admin') {
    return fail('Solo un administrador activo puede gestionar usuarios', 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Solicitud inválida');
  }

  try {
    switch (body.action) {
      // -------------------------------------------------------------
      case 'create': {
        const email = str(body.email, 254).toLowerCase();
        const fullName = str(body.full_name, 120);
        const role = body.role as Role;
        const password = body.password;
        if (!EMAIL_RE.test(email)) return fail('Correo electrónico inválido');
        if (!fullName) return fail('El nombre completo es obligatorio');
        if (!ROLES.includes(role)) return fail('Rol inválido');
        if (!validPassword(password)) return fail('La contraseña debe tener entre 8 y 72 caracteres');

        const { data: created, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (error || !created.user) {
          const msg = error?.message?.toLowerCase() ?? '';
          if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
            return fail('Ya existe una cuenta con ese correo. Búscala en la lista y actívala.', 409);
          }
          return fail(error?.message ?? 'No se pudo crear el usuario', 500);
        }

        const id = created.user.id;
        // El trigger handle_new_user ya creó el perfil pendiente; aquí se activa con su rol.
        const { error: profileErr } = await admin.from('profiles').upsert(
          {
            id,
            email,
            full_name: fullName,
            role,
            active: true,
            specialty: optional(body.specialty, 120),
            phone: optional(body.phone, 40),
            license_number: optional(body.license_number, 40),
            ...(typeof body.color === 'string' && /^#[0-9a-f]{6}$/i.test(body.color) ? { color: body.color } : {}),
          },
          { onConflict: 'id' },
        );
        if (profileErr) {
          await admin.auth.admin.deleteUser(id); // deshacer para no dejar cuentas huérfanas
          return fail(`No se pudo crear el perfil: ${profileErr.message}`, 500);
        }
        return json({ id });
      }

      // -------------------------------------------------------------
      case 'reset_password': {
        const userId = str(body.user_id, 36);
        const password = body.password;
        if (!UUID_RE.test(userId)) return fail('Usuario inválido');
        if (!validPassword(password)) return fail('La contraseña debe tener entre 8 y 72 caracteres');
        const { error } = await admin.auth.admin.updateUserById(userId, { password });
        if (error) return fail(error.message, 500);
        return json({ ok: true });
      }

      // -------------------------------------------------------------
      case 'delete': {
        const userId = str(body.user_id, 36);
        if (!UUID_RE.test(userId)) return fail('Usuario inválido');
        if (userId === callerId) return fail('No puedes eliminar tu propia cuenta');
        const { data: target } = await admin.from('profiles').select('active').eq('id', userId).maybeSingle();
        // Las cuentas activas no se eliminan: conservan la autoría del historial clínico.
        if (target?.active) return fail('Primero desactiva el acceso. Solo se eliminan cuentas inactivas.');
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) return fail(error.message, 500);
        return json({ ok: true });
      }

      default:
        return fail('Acción no soportada');
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error inesperado', 500);
  }
});
