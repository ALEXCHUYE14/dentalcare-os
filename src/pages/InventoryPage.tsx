import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, Package, PackagePlus, Pencil, Search, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ConfirmDialog, EmptyState, ErrorBox, LoadingBlock } from '../components/ui/Feedback';
import { Field, Input, Switch } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { Badge, Card, PageHeader, Segmented } from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { useCatalogs } from '../hooks/useCatalogs';
import { errorMessage } from '../lib/supabase';
import { addMovement, deleteInventoryItem, listInventory, listMovements, saveInventoryItem } from '../services/inventory';
import type { InventoryItem, MovementKind } from '../types';
import { MOVEMENT_KINDS } from '../utils/constants';
import { cn, fmtDateTime, money, round2 } from '../utils/format';

const qty = (n: number) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(n);
const parseNum = (s: string) => (s.trim() ? round2(Number(s.replace(',', '.'))) : 0);
const numInput = (s: string) => s.replace(/[^\d.,]/g, '');

function ItemModal({ open, item, onClose, onSaved }: { open: boolean; item: InventoryItem | null; onClose: () => void; onSaved: (i: InventoryItem) => void }) {
  const toast = useToast();
  const init = () => ({
    name: item?.name ?? '',
    category: item?.category ?? '',
    unit: item?.unit ?? 'unidad',
    min_stock: item ? String(item.min_stock) : '',
    unit_cost: item ? String(item.unit_cost) : '',
    supplier: item?.supplier ?? '',
    active: item?.active ?? true,
    initial: '',
  });
  const [f, setF] = useState(init);
  const [saving, setSaving] = useState(false);
  const [lastKey, setLastKey] = useState<string | null>(null);
  // Reinicia el formulario al abrir otro material (sin efecto: se calcula durante el render)
  const key = open ? item?.id ?? 'new' : null;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) setF(init());
  }

  const save = async () => {
    const min = parseNum(f.min_stock);
    const cost = parseNum(f.unit_cost);
    const initial = parseNum(f.initial);
    if (!f.name.trim()) return toast.error('El nombre es obligatorio.');
    if (![min, cost, initial].every((v) => Number.isFinite(v) && v >= 0)) return toast.error('Revisa los valores numéricos.');
    setSaving(true);
    try {
      let saved = await saveInventoryItem(
        { name: f.name, category: f.category || null, unit: f.unit, min_stock: min, unit_cost: cost, supplier: f.supplier || null, active: f.active },
        item?.id,
      );
      if (!item && initial > 0) {
        const m = await addMovement(saved.id, 'entrada', initial, 'Stock inicial');
        const stock = m.stock_after ?? initial;
        saved = { ...saved, stock, low_stock: stock <= saved.min_stock };
      }
      toast.success(item ? 'Material actualizado' : 'Material creado');
      onSaved(saved);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={item ? 'Editar material' : 'Nuevo material'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" required className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Resina A2 3M Z350" autoFocus maxLength={120} />
        </Field>
        <Field label="Categoría">
          <Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Restauración, Anestesia, Bioseguridad…" />
        </Field>
        <Field label="Unidad">
          <Input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="unidad, caja, jeringa, carpule" />
        </Field>
        <Field label="Stock mínimo" hint="Por debajo se marca como stock bajo">
          <Input inputMode="decimal" value={f.min_stock} onChange={(e) => setF({ ...f, min_stock: numInput(e.target.value) })} placeholder="0" />
        </Field>
        <Field label="Costo unitario">
          <Input inputMode="decimal" value={f.unit_cost} onChange={(e) => setF({ ...f, unit_cost: numInput(e.target.value) })} placeholder="0.00" />
        </Field>
        <Field label="Proveedor">
          <Input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} />
        </Field>
        {item ? (
          <Field label="Estado">
            <div className="flex h-10 items-center gap-2 text-sm">
              <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Activo" /> {f.active ? 'Activo' : 'Inactivo (oculto)'}
            </div>
          </Field>
        ) : (
          <Field label="Stock inicial" hint="Se registra como entrada">
            <Input inputMode="decimal" value={f.initial} onChange={(e) => setF({ ...f, initial: numInput(e.target.value) })} placeholder="0" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function MovementModal({
  target,
  onClose,
  onDone,
}: {
  target: { item: InventoryItem; kind: MovementKind } | null;
  onClose: () => void;
  onDone: (itemId: string, stock: number) => void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<MovementKind>('salida');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  const id = target ? `${target.item.id}:${target.kind}` : null;
  if (id !== lastId) {
    setLastId(id);
    if (target) {
      setKind(target.kind);
      setAmount('');
      setNote('');
    }
  }
  if (!target) return null;
  const { item } = target;

  const save = async () => {
    const q = parseNum(amount);
    if (!Number.isFinite(q) || q < 0 || (kind !== 'ajuste' && q === 0)) return toast.error('Ingresa una cantidad válida.');
    if (kind === 'salida' && q > item.stock) return toast.error(`Solo hay ${qty(item.stock)} ${item.unit} en stock.`);
    setSaving(true);
    try {
      const m = await addMovement(item.id, kind, q, note || null);
      onDone(item.id, m.stock_after ?? item.stock);
      toast.success(`Stock de ${item.name}: ${qty(m.stock_after ?? 0)} ${item.unit}`);
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
      title={item.name}
      subtitle={`Stock actual: ${qty(item.stock)} ${item.unit}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving}>
            Registrar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          size="sm"
          value={kind}
          onChange={setKind}
          options={(Object.keys(MOVEMENT_KINDS) as MovementKind[]).map((k) => ({ value: k, label: MOVEMENT_KINDS[k].label }))}
        />
        <Field label={kind === 'ajuste' ? `Stock contado (${item.unit})` : `Cantidad (${item.unit})`} hint={kind === 'ajuste' ? 'Reemplaza el stock por lo que contaste físicamente' : undefined}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(numInput(e.target.value))} placeholder="0" autoFocus />
        </Field>
        <Field label="Nota">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'entrada' ? 'Compra a proveedor, factura…' : kind === 'salida' ? 'Uso en consultorio, vencido…' : 'Inventario mensual'} maxLength={200} />
        </Field>
      </div>
    </Modal>
  );
}

function MovementHistory({ itemId, unit }: { itemId: string; unit: string }) {
  const { staff } = useCatalogs();
  const { data, loading, error } = useAsync(() => listMovements(itemId), [itemId]);
  if (loading) return <LoadingBlock />;
  if (error) return <p className="px-4 pb-3 text-xs text-rose-600">{error}</p>;
  if (!data?.length) return <p className="px-4 pb-3 text-xs text-slate-500">Sin movimientos registrados.</p>;
  return (
    <ul className="space-y-1 px-4 pb-3 text-xs">
      {data.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center gap-2">
          <Badge tone={MOVEMENT_KINDS[m.kind].tone}>{MOVEMENT_KINDS[m.kind].label}</Badge>
          <span className="font-medium tabular-nums">
            {m.kind === 'entrada' ? '+' : m.kind === 'salida' ? '−' : '='} {qty(m.quantity)} {unit}
          </span>
          <span className="text-slate-400">→ {m.stock_after !== null ? qty(m.stock_after) : '—'}</span>
          <span className="text-slate-500">
            {fmtDateTime(m.created_at)} · {staff.find((s) => s.id === m.created_by)?.full_name ?? '—'}
            {m.note ? ` · ${m.note}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function InventoryPage() {
  const toast = useToast();
  const { can } = useAuth();
  const { config } = useSettings();
  const cur = config?.currency ?? 'PEN';
  const canEdit = can(['admin', 'doctor', 'asistente']);
  const [view, setView] = useState<'todos' | 'bajo' | 'inactivos'>('todos');
  const [search, setSearch] = useState('');
  const { data, loading, error, reload, setData } = useAsync(() => listInventory({ includeInactive: view === 'inactivos' }), [view === 'inactivos']);
  const [itemModal, setItemModal] = useState<{ item: InventoryItem | null } | null>(null);
  const [move, setMove] = useState<{ item: InventoryItem; kind: MovementKind } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<InventoryItem | null>(null);

  const all = useMemo(() => data ?? [], [data]);
  // Filtrado local: la lista es pequeña y ya está en memoria (no se vuelve a consultar al escribir)
  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    return all
      .filter((i) => (view === 'bajo' ? i.active && i.low_stock : view === 'inactivos' ? !i.active : i.active))
      .filter((i) => !t || `${i.name} ${i.category ?? ''} ${i.supplier ?? ''}`.toLowerCase().includes(t));
  }, [all, view, search]);
  const active = all.filter((i) => i.active);
  const low = active.filter((i) => i.low_stock).length;
  const value = active.reduce((s, i) => s + i.stock * i.unit_cost, 0);

  const upsert = (i: InventoryItem) => setData((list) => (list?.some((x) => x.id === i.id) ? list.map((x) => (x.id === i.id ? i : x)) : [...(list ?? []), i].sort((a, b) => a.name.localeCompare(b.name))));

  return (
    <div>
      <PageHeader
        title="Inventario de materiales"
        subtitle="Stock, alertas de reposición y kardex de movimientos"
        actions={
          canEdit && (
            <Button icon={<PackagePlus />} onClick={() => setItemModal({ item: null })}>
              Nuevo material
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Materiales activos</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{active.length}</p>
        </Card>
        <Card className={cn('p-4', low > 0 && 'border-amber-300')}>
          <p className="text-xs text-slate-500">Con stock bajo</p>
          <p className={cn('mt-1 text-xl font-semibold tabular-nums', low > 0 && 'text-amber-700')}>{low}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Valor del inventario</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{money(value, cur)}</p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:flex-row sm:items-center sm:p-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar material, categoría o proveedor…" className="pl-9" />
          </div>
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'todos', label: 'Activos' },
              { value: 'bajo', label: `Stock bajo${low ? ` (${low})` : ''}` },
              { value: 'inactivos', label: 'Inactivos' },
            ]}
          />
        </div>

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={() => void reload()} />
          </div>
        ) : loading && !data ? (
          <LoadingBlock />
        ) : !rows.length ? (
          <EmptyState
            icon={<Package />}
            title={view === 'bajo' ? 'Todo el stock está en orden' : search ? 'Sin coincidencias' : 'Sin materiales'}
            description={!search && view === 'todos' ? 'Registra tus materiales con su stock mínimo para recibir alertas de reposición.' : undefined}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((i) => (
              <li key={i.id}>
                <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(open === i.id ? null : i.id)}>
                    <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open === i.id && 'rotate-180')} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{i.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {[i.category, i.supplier, i.unit_cost > 0 && `${money(i.unit_cost, cur)} / ${i.unit}`].filter(Boolean).join(' · ') || 'Sin categoría'}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="mr-1 text-right">
                      <p className={cn('text-sm font-semibold tabular-nums', i.low_stock && 'text-amber-700')}>
                        {i.low_stock && <TriangleAlert className="mr-1 inline h-3.5 w-3.5" />}
                        {qty(i.stock)} {i.unit}
                      </p>
                      <p className="text-[11px] text-slate-400">mín. {qty(i.min_stock)}</p>
                    </div>
                    <Button size="icon-sm" variant="secondary" onClick={() => setMove({ item: i, kind: 'entrada' })} aria-label="Registrar entrada" title="Entrada">
                      <ArrowDownToLine />
                    </Button>
                    <Button size="icon-sm" variant="secondary" onClick={() => setMove({ item: i, kind: 'salida' })} aria-label="Registrar salida" title="Salida / uso">
                      <ArrowUpFromLine />
                    </Button>
                    {canEdit && (
                      <Button size="icon-sm" variant="ghost" onClick={() => setItemModal({ item: i })} aria-label="Editar" title="Editar">
                        <Pencil />
                      </Button>
                    )}
                    {can(['admin']) && (
                      <Button size="icon-sm" variant="ghost" className="text-slate-400 hover:text-rose-600" onClick={() => setToDelete(i)} aria-label="Eliminar" title="Eliminar">
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
                {open === i.id && <MovementHistory key={`${i.id}:${i.stock}`} itemId={i.id} unit={i.unit} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ItemModal open={!!itemModal} item={itemModal?.item ?? null} onClose={() => setItemModal(null)} onSaved={upsert} />
      <MovementModal
        target={move}
        onClose={() => setMove(null)}
        onDone={(id, stock) => setData((list) => list?.map((x) => (x.id === id ? { ...x, stock, low_stock: stock <= x.min_stock } : x)) ?? null)}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Eliminar material"
        message="Se eliminará el material y todo su historial de movimientos. Si ya no lo usas, es preferible desactivarlo."
        danger
        confirmLabel="Eliminar"
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          try {
            if (toDelete) await deleteInventoryItem(toDelete.id);
            setData((list) => list?.filter((x) => x.id !== toDelete?.id) ?? null);
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
