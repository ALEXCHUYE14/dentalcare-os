import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Armchair,
  Building2,
  ChevronDown,
  CircleCheck,
  Copy,
  ImageUp,
  KeyRound,
  ListChecks,
  Palette,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  ScrollText,
  Shield,
  Trash2,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ConfirmDialog, EmptyState, ErrorBox, LoadingBlock } from '../components/ui/Feedback';
import { Field, Input, Select, Switch, Textarea } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { Avatar, Badge, Card, CardHeader, PageHeader, Tabs } from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { invalidateCatalogs } from '../hooks/useCatalogs';
import { errorMessage } from '../lib/supabase';
import { getAuditDetail, listAudit } from '../services/audit';
import { removeBrandingAsset, uploadBrandingAsset } from '../services/settings';
import {
  createStaffUser,
  deleteChair,
  deleteStaffUser,
  generatePassword,
  listChairs,
  listProfiles,
  resetStaffPassword,
  saveChair,
  updateProfile,
} from '../services/staff';
import { deleteProcedure, listProcedures, saveProcedure } from '../services/treatments';
import type { AppRole, AuditEntry, Procedure, Profile, TenantConfig } from '../types';
import { AGENDA_COLORS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_TONE } from '../utils/constants';
import { cn, fmtDate, fmtDateTime, money } from '../utils/format';

type Tab = 'perfil' | 'negocio' | 'marca' | 'agenda' | 'procedimientos' | 'usuarios' | 'auditoria';

function SaveBar({ dirty, saving, onSave, onReset }: { dirty: boolean; saving: boolean; onSave: () => void; onReset: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
      {dirty && <span className="mr-auto text-xs text-amber-600">Cambios sin guardar</span>}
      <Button variant="ghost" onClick={onReset} disabled={!dirty || saving}>
        Descartar
      </Button>
      <Button icon={<Save />} onClick={onSave} loading={saving} disabled={!dirty}>
        Guardar
      </Button>
    </div>
  );
}

function useConfigForm<K extends keyof TenantConfig>(keys: K[]) {
  const { config, save } = useSettings();
  const toast = useToast();
  const pick = () => Object.fromEntries(keys.map((k) => [k, config?.[k] ?? ''])) as Record<K, string>;
  const [form, setForm] = useState<Record<K, string>>(pick);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setForm(pick());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);
  const dirty = keys.some((k) => String(config?.[k] ?? '') !== String(form[k] ?? ''));
  const submit = async (validate?: (f: Record<K, string>) => string | null) => {
    const err = validate?.(form);
    if (err) return toast.error(err);
    setSaving(true);
    try {
      const patch = Object.fromEntries(keys.map((k) => [k, form[k] === '' ? null : form[k]])) as Partial<TenantConfig>;
      await save(patch);
      toast.success('Configuración guardada');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return { form, setForm, dirty, saving, submit, reset: () => setForm(pick()) };
}

function BusinessTab() {
  const { form, setForm, dirty, saving, submit, reset } = useConfigForm(['business_name', 'tax_id', 'address', 'phone', 'phone_alt', 'email', 'currency']);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Card>
      <CardHeader title="Identidad del negocio" subtitle="Se muestra en la app, presupuestos y recibos" icon={<Building2 />} />
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Nombre comercial" required className="sm:col-span-2">
          <Input value={form.business_name} onChange={set('business_name')} />
        </Field>
        <Field label="RUC / ID fiscal" hint="11 dígitos para RUC peruano">
          <Input inputMode="numeric" value={form.tax_id} onChange={set('tax_id')} maxLength={20} />
        </Field>
        <Field label="Moneda">
          <Select value={form.currency} onChange={set('currency')}>
            <option value="PEN">PEN – Sol peruano</option>
            <option value="USD">USD – Dólar</option>
            <option value="EUR">EUR – Euro</option>
            <option value="MXN">MXN – Peso mexicano</option>
            <option value="COP">COP – Peso colombiano</option>
            <option value="CLP">CLP – Peso chileno</option>
          </Select>
        </Field>
        <Field label="Dirección" className="sm:col-span-2">
          <Input value={form.address} onChange={set('address')} />
        </Field>
        <Field label="Teléfono principal">
          <Input type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Teléfono alterno / WhatsApp">
          <Input type="tel" inputMode="tel" value={form.phone_alt} onChange={set('phone_alt')} />
        </Field>
        <Field label="Correo de contacto" className="sm:col-span-2">
          <Input type="email" value={form.email} onChange={set('email')} />
        </Field>
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onReset={reset}
        onSave={() =>
          void submit((f) =>
            !f.business_name.trim()
              ? 'El nombre comercial es obligatorio.'
              : f.tax_id && !/^\d{8,11}$/.test(f.tax_id.trim())
                ? 'El RUC debe contener solo dígitos (8 a 11).'
                : null,
          )
        }
      />
    </Card>
  );
}

function ImageUploader({
  label,
  description,
  url,
  kind,
  icon,
  onChange,
}: {
  label: string;
  description: string;
  url: string | null;
  kind: 'logo' | 'qr';
  icon: ReactNode;
  onChange: (url: string | null) => Promise<void>;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const handle = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const publicUrl = await uploadBrandingAsset(file, kind);
      await onChange(publicUrl);
      toast.success(`${label} actualizado`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div
        className={cn(
          'flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-slate-50',
          url ? 'border-slate-200' : 'border-slate-300',
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handle(e.dataTransfer.files?.[0]);
        }}
      >
        {url ? <img src={url} alt={label} className="h-full w-full bg-white object-contain p-2" /> : <div className="text-slate-300 [&_svg]:h-10 [&_svg]:w-10">{icon}</div>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => void handle(e.target.files?.[0])} />
          <Button size="sm" icon={<ImageUp />} loading={busy} onClick={() => inputRef.current?.click()}>
            {url ? 'Reemplazar' : 'Subir imagen'}
          </Button>
          {url && (
            <Button size="sm" variant="ghost" icon={<X />} disabled={busy} onClick={() => void onChange(null)}>
              Quitar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function BrandingTab() {
  const { config, save } = useSettings();
  const toast = useToast();
  const { form, setForm, dirty, saving, submit, reset } = useConfigForm(['payment_qr_label', 'bank_details', 'receipt_footer']);
  const setUrl = (key: 'logo_url' | 'payment_qr_url') => async (url: string | null) => {
    const previous = config?.[key];
    try {
      await save({ [key]: url });
      // La imagen reemplazada ya no se usa: liberar almacenamiento
      if (previous && previous !== url) void removeBrandingAsset(previous);
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Logotipo institucional" subtitle="Aparece en el menú lateral y en los documentos impresos" icon={<Palette />} />
        <div className="p-4">
          <ImageUploader
            kind="logo"
            label="Logotipo"
            description="PNG o SVG con fondo transparente, máx. 2 MB. Arrastra el archivo o súbelo."
            url={config?.logo_url ?? null}
            icon={<Building2 />}
            onChange={setUrl('logo_url')}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Pasarela de cobro y QR dinámico" subtitle="El QR se incrusta en presupuestos y recibos con saldo pendiente" icon={<QrCode />} />
        <div className="space-y-5 p-4">
          <ImageUploader
            kind="qr"
            label="Código QR de pagos"
            description="Exporta tu QR de Yape, Plin o tu banco y súbelo aquí. Puedes reemplazarlo cuando quieras."
            url={config?.payment_qr_url ?? null}
            icon={<QrCode />}
            onChange={setUrl('payment_qr_url')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Texto del QR">
              <Input value={form.payment_qr_label} onChange={(e) => setForm((f) => ({ ...f, payment_qr_label: e.target.value }))} placeholder="Yapea al 9XX XXX XXX" />
            </Field>
            <Field label="Pie de página de documentos">
              <Input value={form.receipt_footer} onChange={(e) => setForm((f) => ({ ...f, receipt_footer: e.target.value }))} />
            </Field>
            <Field label="Datos bancarios / transferencia" className="sm:col-span-2" hint="Banco, titular, N° de cuenta y CCI">
              <Textarea rows={3} value={form.bank_details} onChange={(e) => setForm((f) => ({ ...f, bank_details: e.target.value }))} placeholder={'BCP Soles: 000-0000000-0-00\nCCI: 002-000-000000000000-00\nTitular: …'} />
            </Field>
          </div>
        </div>
        <SaveBar dirty={dirty} saving={saving} onSave={() => void submit()} onReset={reset} />
      </Card>
    </div>
  );
}

function AgendaTab() {
  const toast = useToast();
  const { form, setForm, dirty, saving, submit, reset } = useConfigForm(['open_time', 'close_time', 'timezone']);
  const chairs = useAsync(() => listChairs(true), []);
  const [newChair, setNewChair] = useState('');
  const [toDelete, setToDelete] = useState<string | null>(null);

  const addChair = async () => {
    if (!newChair.trim()) return;
    try {
      await saveChair({ name: newChair });
      setNewChair('');
      await chairs.reload(true);
      void invalidateCatalogs();
      toast.success('Sillón agregado');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="self-start">
        <CardHeader title="Horario de atención" subtitle="Define la grilla de la agenda y la tasa de ocupación" />
        <div className="grid grid-cols-2 gap-4 p-4">
          <Field label="Apertura">
            <Input type="time" value={form.open_time.slice(0, 5)} onChange={(e) => setForm((f) => ({ ...f, open_time: e.target.value }))} />
          </Field>
          <Field label="Cierre">
            <Input type="time" value={form.close_time.slice(0, 5)} onChange={(e) => setForm((f) => ({ ...f, close_time: e.target.value }))} />
          </Field>
          <Field label="Zona horaria" className="col-span-2">
            <Select value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}>
              {['America/Lima', 'America/Bogota', 'America/Mexico_City', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Guayaquil', 'America/La_Paz', 'Europe/Madrid'].map((tz) => (
                <option key={tz}>{tz}</option>
              ))}
            </Select>
          </Field>
        </div>
        <SaveBar
          dirty={dirty}
          saving={saving}
          onReset={reset}
          onSave={() => void submit((f) => (f.close_time.slice(0, 5) <= f.open_time.slice(0, 5) ? 'El cierre debe ser posterior a la apertura.' : null))}
        />
      </Card>
      <Card>
        <CardHeader title="Sillones / Boxes" subtitle="Cada sillón es una columna en la vista diaria" icon={<Armchair />} />
        <div className="flex gap-2 border-b border-slate-100 p-4">
          <Input value={newChair} onChange={(e) => setNewChair(e.target.value)} placeholder="Ej. Sillón 3 – Ortodoncia" onKeyDown={(e) => e.key === 'Enter' && void addChair()} />
          <Button icon={<Plus />} onClick={() => void addChair()}>
            Agregar
          </Button>
        </div>
        {chairs.loading && !chairs.data ? (
          <LoadingBlock />
        ) : (
          <ul className="divide-y divide-slate-100">
            {(chairs.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <Armchair className="h-4 w-4 text-slate-400" />
                <span className={cn('flex-1 text-sm', !c.active && 'text-slate-400 line-through')}>{c.name}</span>
                <Switch
                  checked={c.active}
                  label="Activo"
                  onChange={async (v) => {
                    try {
                      await saveChair({ id: c.id, name: c.name, active: v });
                      await chairs.reload(true);
                      void invalidateCatalogs();
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                />
                <Button size="icon-sm" variant="ghost" className="text-slate-400 hover:text-rose-600" onClick={() => setToDelete(c.id)} aria-label="Eliminar">
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ConfirmDialog
        open={!!toDelete}
        title="Eliminar sillón"
        message="Las citas asignadas a este sillón quedarán sin sillón. Si solo quieres dejar de usarlo, desactívalo."
        danger
        confirmLabel="Eliminar"
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          try {
            if (toDelete) await deleteChair(toDelete);
            await chairs.reload(true);
            void invalidateCatalogs();
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setToDelete(null);
          }
        }}
      />
    </div>
  );
}

function ProceduresTab() {
  const toast = useToast();
  const { config } = useSettings();
  const cur = config?.currency ?? 'PEN';
  const { data, loading, error, reload } = useAsync(() => listProcedures(true), []);
  const [draft, setDraft] = useState<{ id?: string; name: string; category: string; price: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft?.name.trim()) return toast.error('Ingresa el nombre del procedimiento.');
    setSaving(true);
    try {
      await saveProcedure({ id: draft.id, name: draft.name, category: draft.category, default_price: Number(draft.price.replace(',', '.')) || 0 });
      setDraft(null);
      await reload(true);
      void invalidateCatalogs();
      toast.success('Procedimiento guardado');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p: Procedure) => {
    try {
      await saveProcedure({ ...p, active: !p.active });
      await reload(true);
      void invalidateCatalogs();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const remove = async (p: Procedure) => {
    try {
      await deleteProcedure(p.id);
      await reload(true);
      void invalidateCatalogs();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card>
      <CardHeader
        title="Catálogo de procedimientos"
        subtitle="Precios base para armar presupuestos rápidamente"
        icon={<ListChecks />}
        action={
          <Button size="sm" icon={<Plus />} onClick={() => setDraft({ name: '', category: '', price: '' })}>
            Nuevo
          </Button>
        }
      />
      {draft && (
        <div className="grid gap-3 border-b border-slate-100 bg-slate-50 p-4 sm:grid-cols-[1fr_180px_140px_auto] sm:items-end">
          <Field label="Nombre">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Categoría">
            <Input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
          </Field>
          <Field label="Precio base">
            <Input inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value.replace(/[^\d.,]/g, '') })} />
          </Field>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button onClick={save} loading={saving}>
              Guardar
            </Button>
          </div>
        </div>
      )}
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={() => void reload()} />
        </div>
      ) : loading && !data ? (
        <LoadingBlock />
      ) : !data?.length ? (
        <EmptyState icon={<ListChecks />} title="Catálogo vacío" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setDraft({ id: p.id, name: p.name, category: p.category ?? '', price: String(p.default_price) })}
              >
                <p className={cn('truncate text-sm font-medium', !p.active && 'text-slate-400 line-through')}>{p.name}</p>
                <p className="text-xs text-slate-500">{p.category || 'Sin categoría'}</p>
              </button>
              <span className="text-sm tabular-nums">{money(p.default_price, cur)}</span>
              <Switch checked={p.active} onChange={() => void toggle(p)} label="Activo" />
              <Button size="icon-sm" variant="ghost" className="text-slate-400 hover:text-rose-600" onClick={() => void remove(p)} aria-label="Eliminar">
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const toast = useToast();
  return (
    <div className="flex gap-2">
      <Input value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" className="font-mono" placeholder="Mínimo 8 caracteres" />
      <Button variant="secondary" size="icon" onClick={() => onChange(generatePassword())} aria-label="Generar contraseña" title="Generar contraseña segura">
        <RefreshCw />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        disabled={!value}
        onClick={() => void navigator.clipboard?.writeText(value).then(() => toast.success('Contraseña copiada'), () => toast.error('No se pudo copiar'))}
        aria-label="Copiar contraseña"
        title="Copiar"
      >
        <Copy />
      </Button>
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface StaffDraft {
  full_name: string;
  email: string;
  password: string;
  role: AppRole;
  specialty: string;
  phone: string;
  license_number: string;
  color: string;
}

/** Alta de personal (vía Edge Function) o edición de datos de un usuario existente. */
function StaffFormModal({ open, editing, onClose, onSaved }: { open: boolean; editing: Profile | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const blank = (): StaffDraft => ({
    full_name: editing?.full_name ?? '',
    email: editing?.email ?? '',
    password: editing ? '' : generatePassword(),
    role: editing?.role ?? 'doctor',
    specialty: editing?.specialty ?? '',
    phone: editing?.phone ?? '',
    license_number: editing?.license_number ?? '',
    color: editing?.color ?? AGENDA_COLORS[Math.floor(Math.random() * AGENDA_COLORS.length)],
  });
  const [f, setF] = useState<StaffDraft>(blank);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    if (open) {
      setF(blank());
      setCreated(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const set = (k: keyof StaffDraft) => (e: { target: { value: string } }) => setF((d) => ({ ...d, [k]: e.target.value }));

  const save = async () => {
    if (!f.full_name.trim()) return toast.error('El nombre es obligatorio.');
    if (!editing) {
      if (!EMAIL_RE.test(f.email.trim())) return toast.error('Ingresa un correo válido.');
      if (f.password.length < 8) return toast.error('La contraseña debe tener al menos 8 caracteres.');
    }
    setSaving(true);
    try {
      if (editing) {
        const patch: Parameters<typeof updateProfile>[1] = {
          full_name: f.full_name.trim(),
          specialty: f.specialty.trim() || null,
          phone: f.phone.trim() || null,
          color: f.color,
        };
        // Solo se envía si cambió: así la edición funciona aunque falte aplicar la migración 002
        if ((f.license_number.trim() || null) !== (editing.license_number ?? null)) patch.license_number = f.license_number.trim() || null;
        await updateProfile(editing.id, patch);
        toast.success('Datos actualizados');
        onSaved();
        onClose();
      } else {
        await createStaffUser({
          full_name: f.full_name.trim(),
          email: f.email.trim().toLowerCase(),
          password: f.password,
          role: f.role,
          specialty: f.specialty.trim() || null,
          phone: f.phone.trim() || null,
          license_number: f.license_number.trim() || null,
          color: f.color,
        });
        setCreated({ email: f.email.trim().toLowerCase(), password: f.password });
        onSaved();
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    const text = `Acceso a ${window.location.origin}\nUsuario: ${created.email}\nContraseña temporal: ${created.password}`;
    return (
      <Modal
        open={open}
        onClose={onClose}
        size="sm"
        title="Usuario creado"
        subtitle="Comparte estas credenciales de forma privada"
        footer={
          <>
            <Button
              variant="secondary"
              icon={<Copy />}
              onClick={() => void navigator.clipboard?.writeText(text).then(() => toast.success('Credenciales copiadas'), () => toast.error('No se pudo copiar'))}
            >
              Copiar todo
            </Button>
            <Button onClick={onClose}>Listo</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 rounded-lg bg-teal-50 p-3 text-teal-800">
            <CircleCheck className="h-4 w-4 shrink-0" /> La cuenta ya está activa con el rol {ROLE_LABELS[f.role]}.
          </div>
          <InfoRowPlain label="Usuario" value={created.email} />
          <InfoRowPlain label="Contraseña temporal" value={created.password} mono />
          <p className="text-xs text-slate-500">La contraseña no se volverá a mostrar. Si se pierde, usa “Restablecer contraseña”.</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      size="md"
      title={editing ? 'Editar datos del usuario' : 'Nuevo usuario del personal'}
      subtitle={editing ? editing.email ?? undefined : 'La cuenta queda activa de inmediato, sin confirmación por correo'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button icon={editing ? <Save /> : <UserPlus />} onClick={save} loading={saving}>
            {editing ? 'Guardar' : 'Crear usuario'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre completo" required className="sm:col-span-2">
          <Input value={f.full_name} onChange={set('full_name')} placeholder="Dra. Ana Torres" autoFocus />
        </Field>
        {!editing && (
          <>
            <Field label="Correo electrónico (usuario)" required className="sm:col-span-2">
              <Input type="email" value={f.email} onChange={set('email')} autoComplete="off" placeholder="ana@clinica.pe" />
            </Field>
            <Field label="Contraseña temporal" required className="sm:col-span-2" hint="Compártela con la persona; podrá cambiarla en Configuración → Mi perfil.">
              <PasswordField value={f.password} onChange={(v) => setF((d) => ({ ...d, password: v }))} />
            </Field>
            <Field label="Rol" required className="sm:col-span-2">
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setF((d) => ({ ...d, role: r }))}
                    className={cn(
                      'rounded-lg border p-3 text-left transition',
                      f.role === r
                        ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-500/20'
                        : 'border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <p className="text-sm font-medium">{ROLE_LABELS[r]}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{ROLE_DESCRIPTIONS[r]}</p>
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}
        <Field label="Especialidad">
          <Input value={f.specialty} onChange={set('specialty')} placeholder="Endodoncia, Ortodoncia…" />
        </Field>
        <Field label="N° de colegiatura (COP)" hint="Se imprime en recetas">
          <Input value={f.license_number} onChange={set('license_number')} maxLength={40} />
        </Field>
        <Field label="Teléfono">
          <Input type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} />
        </Field>
        <Field label="Color en la agenda">
          <div className="flex h-10 items-center gap-1.5">
            {AGENDA_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={cn('h-6 w-6 rounded-full ring-offset-2', f.color === c && 'ring-2 ring-slate-400')}
                style={{ backgroundColor: c }}
                onClick={() => setF((d) => ({ ...d, color: c }))}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function InfoRowPlain({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn('break-all text-sm font-medium', mono && 'font-mono')}>{value}</p>
    </div>
  );
}

function ResetPasswordModal({ user, onClose }: { user: Profile | null; onClose: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (user) setPassword(generatePassword());
  }, [user]);
  if (!user) return null;
  const save = async () => {
    if (password.length < 8) return toast.error('La contraseña debe tener al menos 8 caracteres.');
    setSaving(true);
    try {
      await resetStaffPassword(user.id, password);
      await navigator.clipboard?.writeText(password).catch(() => undefined);
      toast.success('Contraseña actualizada y copiada al portapapeles');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      size="sm"
      title="Restablecer contraseña"
      subtitle={`${user.full_name} · ${user.email ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button icon={<KeyRound />} onClick={save} loading={saving}>
            Cambiar contraseña
          </Button>
        </>
      }
    >
      <Field label="Nueva contraseña" hint="La sesión actual de la persona seguirá abierta hasta que expire o cierre sesión.">
        <PasswordField value={password} onChange={setPassword} />
      </Field>
    </Modal>
  );
}

function UsersTab() {
  const toast = useToast();
  const { profile: me, refreshProfile } = useAuth();
  const { data, loading, error, reload, setData } = useAsync(listProfiles, []);
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [form, setForm] = useState<{ editing: Profile | null } | null>(null);
  const [resetFor, setResetFor] = useState<Profile | null>(null);
  const [toDelete, setToDelete] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const patch = async (p: Profile, change: Partial<Profile>) => {
    const prev = data;
    setData((list) => list?.map((x) => (x.id === p.id ? { ...x, ...change } : x)) ?? null);
    try {
      await updateProfile(p.id, change);
      void invalidateCatalogs();
      toast.success('Usuario actualizado');
    } catch (e) {
      setData(prev);
      toast.error(errorMessage(e));
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteStaffUser(toDelete.id);
      setData((list) => list?.filter((x) => x.id !== toDelete.id) ?? null);
      void invalidateCatalogs();
      toast.success('Cuenta eliminada');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  const afterSave = () => {
    void reload(true);
    void invalidateCatalogs();
    if (form?.editing?.id === me?.id) void refreshProfile(); // el menú lateral muestra mis datos
  };

  const pending = (data ?? []).filter((p) => !p.active).length;

  return (
    <Card>
      <CardHeader
        title="Control de accesos (RBAC)"
        subtitle={pending ? `${pending} usuario(s) pendientes de activación` : 'Crea cuentas, asigna roles y gestiona accesos del personal'}
        icon={<Shield />}
        action={
          <Button size="sm" icon={<UserPlus />} onClick={() => setForm({ editing: null })}>
            Nuevo usuario
          </Button>
        }
      />
      <div className="border-b border-slate-100 bg-sky-50/60 px-4 py-3 text-xs text-sky-800">
        Crea las cuentas del personal con <b>Nuevo usuario</b>: quedan activas con su rol y una contraseña temporal. Quien se registre por su cuenta desde
        la pantalla de acceso queda <b>pendiente</b> hasta que lo actives. Roles: <b>Administrador</b> (todo), <b>Doctor</b> (clínica, odontograma,
        recetas, presupuestos), <b>Recepcionista</b> (agenda, pacientes, caja) y <b>Asistente</b> (agenda, consulta clínica y radiografías).
      </div>
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={() => void reload()} />
        </div>
      ) : loading && !data ? (
        <LoadingBlock />
      ) : (
        <ul className="divide-y divide-slate-100">
          {(data ?? []).map((p) => (
            <li key={p.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="relative">
                  <button type="button" onClick={() => setColorFor(colorFor === p.id ? null : p.id)} aria-label="Color en agenda">
                    <Avatar name={p.full_name || p.email || '?'} color={p.color} />
                  </button>
                  {colorFor === p.id && (
                    <div className="animate-slide absolute left-0 top-11 z-10 flex gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                      {AGENDA_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={cn('h-6 w-6 rounded-full ring-offset-2', p.color === c && 'ring-2 ring-slate-400')}
                          style={{ backgroundColor: c }}
                          onClick={() => {
                            setColorFor(null);
                            void patch(p, { color: c });
                          }}
                          aria-label={c}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    {p.full_name || 'Sin nombre'}
                    {p.id === me?.id && <Badge tone="sky">Tú</Badge>}
                    {!p.active && <Badge tone="amber">Pendiente</Badge>}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {p.email} · desde {fmtDate(p.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
                <Select
                  className="h-9 w-40 text-xs"
                  value={p.role}
                  disabled={p.id === me?.id}
                  title={p.id === me?.id ? 'No puedes cambiar tu propio rol' : undefined}
                  onChange={(e) => void patch(p, { role: e.target.value as AppRole })}
                >
                  {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
                <Badge tone={ROLE_TONE[p.role]} className="hidden xl:inline-flex">
                  {ROLE_LABELS[p.role]}
                </Badge>
                <Switch checked={p.active} onChange={(v) => void patch(p, { active: v })} label="Acceso activo" disabled={p.id === me?.id} />
                <div className="ml-auto flex items-center sm:ml-0">
                  <Button size="icon-sm" variant="ghost" onClick={() => setForm({ editing: p })} aria-label="Editar datos" title="Editar datos">
                    <Pencil />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setResetFor(p)} aria-label="Restablecer contraseña" title="Restablecer contraseña">
                    <KeyRound />
                  </Button>
                  {!p.active && p.id !== me?.id && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-slate-400 hover:text-rose-600"
                      onClick={() => setToDelete(p)}
                      aria-label="Eliminar cuenta"
                      title="Eliminar cuenta"
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <StaffFormModal open={!!form} editing={form?.editing ?? null} onClose={() => setForm(null)} onSaved={afterSave} />
      <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title="Eliminar cuenta"
        message={
          <>
            Se eliminará definitivamente la cuenta de <b>{toDelete?.full_name || toDelete?.email}</b>. Los registros que haya creado se conservan sin autor. Si
            solo quieres impedir el acceso, basta con mantenerla desactivada.
          </>
        }
        danger
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      />
    </Card>
  );
}

const AUDIT_TABLES: Record<string, string> = {
  patients: 'Pacientes',
  appointments: 'Citas',
  odontogram_records: 'Odontograma',
  clinical_notes: 'Notas clínicas',
  clinical_documents: 'Documentos clínicos',
  patient_files: 'Archivos',
  treatments: 'Presupuestos',
  payments: 'Pagos',
  expenses: 'Gastos',
  cash_sessions: 'Caja',
  lab_orders: 'Laboratorio',
  inventory_movements: 'Inventario',
  tenants_config: 'Configuración',
  profiles: 'Usuarios',
};

const AUDIT_ACTIONS: Record<AuditEntry['action'], { label: string; tone: 'teal' | 'amber' | 'rose' }> = {
  INSERT: { label: 'Creó', tone: 'teal' },
  UPDATE: { label: 'Modificó', tone: 'amber' },
  DELETE: { label: 'Eliminó', tone: 'rose' },
};

const fmtValue = (v: unknown) => {
  if (v === null || v === undefined || v === '') return '—';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
};

function AuditDetailView({ entry }: { entry: AuditEntry }) {
  const { data, loading, error } = useAsync(() => getAuditDetail(entry.id), [entry.id]);
  if (loading) return <LoadingBlock />;
  if (error || !data) return <p className="px-4 py-3 text-xs text-rose-600">{error ?? 'Sin detalle'}</p>;
  const oldD = data.old_data ?? {};
  const newD = data.new_data ?? {};
  const keys =
    entry.action === 'UPDATE'
      ? Object.keys(newD).filter((k) => k !== 'updated_at' && JSON.stringify(oldD[k]) !== JSON.stringify(newD[k]))
      : Object.keys(entry.action === 'DELETE' ? oldD : newD).filter((k) => !['id', 'created_at', 'updated_at'].includes(k));
  if (!keys.length) return <p className="px-4 py-3 text-xs text-slate-500">Sin cambios relevantes en los datos.</p>;
  return (
    <div className="overflow-x-auto px-4 pb-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
            <th className="py-1 pr-3">Campo</th>
            {entry.action !== 'INSERT' && <th className="py-1 pr-3">{entry.action === 'UPDATE' ? 'Antes' : 'Valor'}</th>}
            {entry.action !== 'DELETE' && <th className="py-1">{entry.action === 'UPDATE' ? 'Después' : 'Valor'}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {keys.map((k) => (
            <tr key={k} className="align-top">
              <td className="py-1 pr-3 font-mono text-slate-500">{k}</td>
              {entry.action !== 'INSERT' && <td className="max-w-[280px] break-words py-1 pr-3 text-rose-700">{fmtValue(oldD[k])}</td>}
              {entry.action !== 'DELETE' && <td className="max-w-[280px] break-words py-1 text-teal-700">{fmtValue(newD[k])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditTab() {
  const [table, setTable] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const people = useAsync(listProfiles, []);
  const { data, loading, error, reload } = useAsync(() => listAudit({ page, table }), [page, table]);
  const names = new Map((people.data ?? []).map((p) => [p.id, p.full_name || p.email || 'Usuario']));

  return (
    <Card>
      <CardHeader
        title="Auditoría"
        subtitle="Quién creó, modificó o eliminó información clínica y financiera"
        icon={<ScrollText />}
        action={
          <Select
            className="h-9 w-44 text-xs"
            value={table}
            onChange={(e) => {
              setTable(e.target.value);
              setPage(1);
              setOpen(null);
            }}
            aria-label="Módulo"
          >
            <option value="">Todos los módulos</option>
            {Object.entries(AUDIT_TABLES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        }
      />
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={() => void reload()} />
        </div>
      ) : loading && !data ? (
        <LoadingBlock />
      ) : !data?.rows.length ? (
        <EmptyState icon={<ScrollText />} title="Sin registros" />
      ) : (
        <>
          <ul className={cn('divide-y divide-slate-100', loading && 'opacity-60')}>
            {data.rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
                >
                  <Badge tone={AUDIT_ACTIONS[r.action].tone}>{AUDIT_ACTIONS[r.action].label}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      <b>{r.actor ? names.get(r.actor) ?? 'Usuario eliminado' : 'Sistema'}</b>
                      <span className="text-slate-500"> · {AUDIT_TABLES[r.table_name] ?? r.table_name}</span>
                    </p>
                    <p className="text-xs text-slate-500">{fmtDateTime(r.created_at)}</p>
                  </div>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open === r.id && 'rotate-180')} />
                </button>
                {open === r.id && <AuditDetailView entry={r} />}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>Página {page}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1 || loading} onClick={() => (setPage((p) => p - 1), setOpen(null))}>
                Anterior
              </Button>
              <Button size="sm" variant="secondary" disabled={!data.hasMore || loading} onClick={() => (setPage((p) => p + 1), setOpen(null))}>
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function ProfileTab() {
  const toast = useToast();
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [specialty, setSpecialty] = useState(profile?.specialty ?? '');
  const [license, setLicense] = useState(profile?.license_number ?? '');
  const [saving, setSaving] = useState(false);
  if (!profile) return null;
  const licenseChanged = license.trim() !== (profile.license_number ?? '');
  const dirty = name !== profile.full_name || phone !== (profile.phone ?? '') || specialty !== (profile.specialty ?? '') || licenseChanged;
  return (
    <Card>
      <CardHeader title="Mi perfil" subtitle={`${profile.email} · ${ROLE_LABELS[profile.role]}`} icon={<User />} />
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Nombre completo" className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Teléfono">
          <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Especialidad">
          <Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Endodoncia, Ortodoncia…" />
        </Field>
        <Field label="N° de colegiatura (COP)" hint="Se imprime bajo tu firma en recetas y documentos">
          <Input value={license} onChange={(e) => setLicense(e.target.value)} maxLength={40} />
        </Field>
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onReset={() => {
          setName(profile.full_name);
          setPhone(profile.phone ?? '');
          setSpecialty(profile.specialty ?? '');
          setLicense(profile.license_number ?? '');
        }}
        onSave={async () => {
          if (!name.trim()) return toast.error('El nombre es obligatorio.');
          setSaving(true);
          try {
            await updateProfile(profile.id, {
              full_name: name.trim(),
              phone: phone.trim() || null,
              specialty: specialty.trim() || null,
              // Solo se envía si cambió: así guardar funciona aunque falte aplicar la migración 002
              ...(licenseChanged ? { license_number: license.trim() || null } : {}),
            });
            await refreshProfile();
            void invalidateCatalogs();
            toast.success('Perfil actualizado');
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setSaving(false);
          }
        }}
      />
    </Card>
  );
}

function ChangePasswordCard() {
  const toast = useToast();
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (password.length < 8) return toast.error('La contraseña debe tener al menos 8 caracteres.');
    if (password !== confirm) return toast.error('Las contraseñas no coinciden.');
    setSaving(true);
    try {
      await updatePassword(password);
      setPassword('');
      setConfirm('');
      toast.success('Contraseña actualizada');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <CardHeader title="Cambiar contraseña" subtitle="Reemplaza la contraseña temporal que te asignaron" icon={<KeyRound />} />
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Repite la contraseña">
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end border-t border-slate-100 px-4 py-3">
        <Button icon={<KeyRound />} onClick={submit} loading={saving} disabled={!password}>
          Actualizar contraseña
        </Button>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const { can } = useAuth();
  const isAdmin = can(['admin']);
  const [tab, setTab] = useState<Tab>(isAdmin ? 'negocio' : 'perfil');

  const tabs = [
    ...(isAdmin
      ? ([
          { id: 'negocio', label: 'Negocio', icon: <Building2 /> },
          { id: 'marca', label: 'Marca y cobros', icon: <QrCode /> },
          { id: 'agenda', label: 'Agenda y sillones', icon: <Armchair /> },
          { id: 'procedimientos', label: 'Procedimientos', icon: <ListChecks /> },
          { id: 'usuarios', label: 'Usuarios y roles', icon: <Shield /> },
          { id: 'auditoria', label: 'Auditoría', icon: <ScrollText /> },
        ] as const)
      : []),
    { id: 'perfil', label: 'Mi perfil', icon: <User /> },
  ] as { id: Tab; label: string; icon: ReactNode }[];

  return (
    <div>
      <PageHeader title="Configuración" subtitle={isAdmin ? 'Panel administrativo y configuración global' : 'Tus datos de usuario'} />
      <Tabs<Tab> className="mb-4" value={tab} onChange={setTab} tabs={tabs} />
      <div className="animate-fade">
        {tab === 'negocio' && isAdmin && <BusinessTab />}
        {tab === 'marca' && isAdmin && <BrandingTab />}
        {tab === 'agenda' && isAdmin && <AgendaTab />}
        {tab === 'procedimientos' && isAdmin && <ProceduresTab />}
        {tab === 'usuarios' && isAdmin && <UsersTab />}
        {tab === 'auditoria' && isAdmin && <AuditTab />}
        {tab === 'perfil' && (
          <div className="space-y-4">
            <ProfileTab />
            <ChangePasswordCard />
          </div>
        )}
      </div>
    </div>
  );
}
