# DentalCare OS

CRM y sistema de gestión integral para consultorios odontológicos.
React 19 + Vite + TypeScript + Tailwind CSS v4 + Supabase (PostgreSQL, Auth, Storage, Realtime).

## Módulos

| Módulo | Qué incluye |
|---|---|
| **Dashboard** | Citas del día, pacientes activos, ingresos del mes (vs. mes anterior), ocupación de sillones, gráficos de ingresos y flujo de pacientes por semana/mes, agenda del día con avance rápido de estado. Se actualiza en tiempo real. |
| **Pacientes** | CRUD completo, búsqueda por nombre/DNI/teléfono, paginación, tarjetas colapsables en móvil, alergias y alertas médicas destacadas, antecedentes, historial clínico evolutivo por sesión. |
| **Recetas y documentos** | Recetas (Rp/ con medicamento, dosis, frecuencia y duración), consentimientos informados (general, exodoncia, endodoncia), indicaciones post-operatorias, constancias de atención y referencias. Plantillas editables, numeración correlativa, membrete del consultorio, firma con N° COP, impresión/PDF. Inmutables una vez emitidos. |
| **Seguimiento** | Recordatorios de citas (hoy, mañana, pasado) por WhatsApp con confirmación en un clic, cobranza de saldos pendientes, pacientes sin control hace +6/+12 meses (con agendado directo) y cumpleaños de la semana. Marca local de "Enviado" para no repetir mensajes. |
| **Reportes** (admin) | Ingresos y ticket promedio, ingresos por doctor (base para comisiones) y por método de pago, procedimientos más vendidos, citas atendidas por doctor, cancelaciones, pacientes nuevos y aceptación de presupuestos. Rangos predefinidos o personalizados (máx. 1 año) y exportación a CSV/Excel. Todo se calcula en la base de datos. |
| **Laboratorio** | Órdenes de trabajo (coronas, puentes, prótesis, carillas…) con paciente, piezas, color VITA, laboratorio, costo y fecha de entrega; avance de estado en un clic (por enviar → en laboratorio → recibido → instalado) y alerta de entregas vencidas. |
| **Caja y gastos** (admin, recepción) | Apertura de caja con sencillo inicial, cobros por método desde la apertura, cierre con arqueo (el efectivo esperado lo calcula el servidor; sobrante/faltante), historial de cierres, registro de gastos por categoría y utilidad del mes. |
| **Inventario** | Materiales con unidad, costo, proveedor y stock mínimo; entradas, salidas y ajustes por conteo; kardex inmutable por material; alertas de stock bajo y valor del inventario. El stock solo cambia mediante movimientos y nunca puede quedar negativo. |
| **Radiografías y archivos** | Radiografías, fotografías clínicas, PDFs de laboratorio por paciente en un bucket **privado**; se abren con enlaces firmados de 5 minutos. Las imágenes grandes se optimizan en el navegador antes de subir. |
| **Odontograma** | Notación FDI, dentición permanente / temporal / mixta, 5 superficies por pieza, herramientas: caries, obturación, sellante, endodoncia, corona, tratamiento pendiente, extracción indicada, implante, ausente. Estados *Sano / En tratamiento / Realizado*. Sincronizado en tiempo real entre equipos. |
| **Agenda** | Vistas diaria (columna por sillón), semanal y mensual; colores por estado; filtros por doctor, sillón y tratamiento; clic en un horario para agendar; bloqueo de choques de horario por sillón y por doctor (a nivel de base de datos); recordatorio por WhatsApp. |
| **Facturación** | Presupuestos por plan de tratamiento con detalle por pieza y catálogo de procedimientos, descuentos, abonos parciales, saldos automáticos, recibos y presupuestos imprimibles/PDF con QR de pago y envío por WhatsApp. |
| **Configuración** | Identidad del negocio (nombre, RUC, dirección, teléfonos, moneda), logotipo, QR de cobro (Yape/Plin/banco) y datos bancarios, horario y sillones, catálogo de procedimientos, **alta de usuarios con rol**, restablecimiento de contraseñas, **auditoría** (quién creó/modificó/eliminó qué), perfil propio y cambio de contraseña. |

**Roles:** Administrador (todo) · Doctor (clínica, odontograma, recetas, presupuestos) · Recepcionista (agenda, pacientes, caja; no ve notas ni documentos clínicos) · Asistente (agenda, consulta clínica y carga de radiografías).

## Puesta en marcha

### 1. Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Abre **SQL Editor → New query**, pega el contenido de `supabase/schema.sql` y ejecútalo completo.
3. En otra query, ejecuta `supabase/migrations/002_documentos_archivos.sql` (documentos clínicos, archivos, N° COP e índices). Es idempotente: si ya tienes la base en producción, **solo ejecuta este archivo**. Luego ejecuta, en orden, `supabase/migrations/003_seguimiento_reportes.sql` (Seguimiento y Reportes) y `supabase/migrations/004_caja_laboratorio_inventario.sql` (caja, gastos, laboratorio, inventario y gastos en Reportes).
4. En **Authentication → Providers → Email** decide si exiges confirmación de correo (para pruebas puedes desactivarla).
5. En **Project Settings → API** copia la *Project URL* y la *anon public key*.

### 1.1 Gestión de usuarios (Edge Function `admin-users`)
Crear cuentas desde el panel requiere la clave `service_role`, que **nunca** debe ir al navegador. Por eso vive en una Edge Function que comprueba que quien llama es un administrador activo.

**Opción A – CLI** (recomendada):
```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase functions deploy admin-users --no-verify-jwt
```
**Opción B – Dashboard:** *Edge Functions → Deploy a new function → Via Editor*, nómbrala `admin-users`, pega `supabase/functions/admin-users/index.ts`, desactiva **Verify JWT** (la función valida el token por dentro) y despliega.

No hace falta configurar secretos: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya están disponibles en todas las funciones.

Una vez desplegada, en **Configuración → Usuarios y roles → Nuevo usuario** el administrador crea la cuenta con correo, contraseña temporal y rol; la cuenta queda activa al instante. Si todo el personal se da de alta así, desactiva el autorregistro en *Authentication → Sign In / Providers → Allow new users to sign up*.

### 2. Local
```bash
cp .env.example .env      # completa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

### 3. Primer acceso
- Regístrate desde la pantalla de acceso: **la primera cuenta queda como Administrador activo**.
- Crea al resto del personal en **Configuración → Usuarios y roles → Nuevo usuario**. Quien se registre por su cuenta queda *pendiente* hasta que lo actives.
- Cada usuario cambia su contraseña temporal en **Configuración → Mi perfil**. El enlace de "¿Olvidaste tu contraseña?" abre una pantalla para crear la nueva.
- Configura el negocio, sube el logo y el QR en **Configuración → Marca y cobros**.

### 4. Despliegue en Vercel
1. Sube el proyecto a GitHub e impórtalo en Vercel (framework: **Vite**).
2. Agrega las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Deploy. `vercel.json` ya incluye el rewrite para las rutas de la SPA.
4. En Supabase → **Authentication → URL Configuration**, agrega tu dominio de Vercel como *Site URL* / *Redirect URL*.

## Arquitectura

```
supabase/schema.sql        Tablas, enums, triggers, RPC, RLS, storage y realtime
supabase/migrations/       Cambios incrementales (002: documentos clínicos, archivos, N° COP, índices)
supabase/functions/        Edge Function admin-users (alta de personal, contraseñas)
src/
  components/
    ui/                    Button, Field/Input/Select/TagInput/Switch, Modal, Primitives, Feedback, Charts (SVG propio)
    layout/                AppLayout (sidebar colapsable + bottom nav móvil), navegación por rol
    patients/              Formulario, buscador, alertas médicas
    odontogram/            ToothSvg (5 superficies) y Odontogram (herramientas, panel, hallazgos)
    appointments/          Modal de citas
    billing/               Editor y detalle de presupuestos, abonos, documento imprimible con QR
  context/                 Auth, Settings (tenant), Toast
  hooks/                   useAsync, useDebounce, useRealtime, useCatalogs
  services/                Acceso a Supabase por dominio
  pages/                   Dashboard, Pacientes, Expediente, Agenda, Facturación, Configuración, Login
  types/  utils/           Tipos del dominio, formato, constantes, dientes FDI
```

### Lógica de negocio en la base de datos
- `handle_new_user`: crea el perfil; el primer usuario es admin.
- `protect_profile_fields`: solo un admin cambia roles/estado y siempre queda un admin activo.
- `no_chair_overlap` / `no_doctor_overlap`: restricciones de exclusión que impiden citas solapadas.
- `recalc_treatment_subtotal`, `compute_treatment_total`, `recalc_treatment_paid`: subtotal, total, pagado y saldo siempre consistentes; el presupuesto pasa a *En curso* con el primer abono.
- `validate_payment`: impide abonos mayores al saldo o sobre presupuestos anulados.
- `audit_trigger`: bitácora en `audit_log` de pacientes, citas, odontograma, notas, presupuestos, pagos, configuración y perfiles.
- `get_dashboard_stats` / `get_dashboard_series`: métricas del dashboard en la zona horaria configurada.

> Los recibos son documentos internos; no reemplazan el comprobante electrónico SUNAT.

## Consumo de Supabase (egress, egress cacheado y logs)

El sistema está pensado para mantenerse holgadamente dentro del plan gratuito en un consultorio:

| Medida | Efecto |
|---|---|
| Realtime que ignora eventos fuera del rango visible (agenda) o de otro día (dashboard) | Una cita movida en otro mes ya no recarga la agenda de todos los equipos |
| Realtime en pausa con la pestaña oculta; el canal se cierra tras 60 s en segundo plano y se recarga **una sola vez** al volver | Las PCs de recepción con la app abierta todo el día dejan de consumir |
| Odontograma: los cambios de otros equipos se aplican con los datos del evento, sin volver a consultar | Cero consultas extra por clic en una pieza |
| Listados y buscador de pacientes solo piden las columnas que muestran; el buscador no cuenta filas | Menos bytes por búsqueda |
| La renovación del token (cada hora) no vuelve a descargar perfil ni configuración | Menos peticiones y menos logs |
| Roles sin permiso no consultan notas, documentos ni presupuestos | Sin peticiones rechazadas por RLS en los logs |
| Logo y QR reducidos a ≤512/800 px al subir, caché de 1 año (nombre único por versión) y borrado del archivo reemplazado | Menos *cached egress*: el navegador no los vuelve a pedir |
| Radiografías en bucket privado, sin miniaturas; se descargan solo al abrirlas. Imágenes >1,5 MB re-codificadas a ≤3000 px | El egress de archivos solo ocurre cuando alguien mira el archivo |
| Auditoría: el detalle (`old_data`/`new_data`) se descarga solo al expandir una fila | Listado liviano |

Recomendaciones en el panel de Supabase:
- *Authentication → Sign In / Providers*: desactiva el autorregistro si creas las cuentas desde el panel.
- *Database → Publications → supabase_realtime*: deja solo `appointments` y `odontogram_records` (lo que instala `schema.sql`).
- Revisa *Reports → API* una vez al mes; si una tabla aparece con muchas lecturas, es la candidata a optimizar.
