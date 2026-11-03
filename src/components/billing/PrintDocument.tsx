import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Payment, TenantConfig, Treatment } from '../../types';
import { PAYMENT_METHODS, TREATMENT_STATUS } from '../../utils/constants';
import { docNumber, fmtDate, fmtDateTime, fullName, money } from '../../utils/format';

export type PrintKind = 'budget' | 'receipt';

/** Documento imprimible (A4) de presupuesto o recibo, con QR de pago dinámico. */
export function PrintDocument({
  kind,
  config,
  treatment,
  payment,
}: {
  kind: PrintKind;
  config: TenantConfig | null;
  treatment: Treatment;
  payment?: Payment | null;
}) {
  const cur = config?.currency ?? 'PEN';
  const items = treatment.items ?? [];
  const payments = [...(treatment.payments ?? [])].sort((a, b) => a.number - b.number);
  const paidUntil = payment ? payments.filter((p) => p.number <= payment.number).reduce((s, p) => s + Number(p.amount), 0) : Number(treatment.paid);
  const balanceAfter = Math.max(Number(treatment.total) - paidUntil, 0);
  const title = kind === 'budget' ? 'PRESUPUESTO' : 'RECIBO DE PAGO';
  const number = kind === 'budget' ? docNumber('P', treatment.number) : docNumber('R', payment?.number ?? 0);
  const showQr = !!config?.payment_qr_url && (kind === 'budget' || balanceAfter > 0);

  return (
    <div className="mx-auto w-full max-w-[794px] bg-white p-8 font-sans text-[12px] leading-relaxed text-slate-800 sm:p-10">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-6 border-b-2 border-sky-600 pb-5">
        <div className="flex items-start gap-4">
          {config?.logo_url && <img src={config.logo_url} alt="" className="h-16 w-16 object-contain" />}
          <div>
            <p className="text-lg font-bold text-slate-900">{config?.business_name ?? 'Consultorio odontológico'}</p>
            {config?.tax_id && <p>RUC: {config.tax_id}</p>}
            {config?.address && <p>{config.address}</p>}
            <p>{[config?.phone, config?.phone_alt].filter(Boolean).join(' · ')}</p>
            {config?.email && <p>{config.email}</p>}
          </div>
        </div>
        <div className="shrink-0 rounded-lg border border-sky-600 px-4 py-3 text-center">
          <p className="text-[11px] font-semibold tracking-widest text-sky-700">{title}</p>
          <p className="mt-0.5 text-base font-bold text-slate-900">{number}</p>
          <p className="text-[11px] text-slate-500">{kind === 'budget' ? fmtDate(treatment.created_at) : fmtDateTime(payment?.paid_at)}</p>
        </div>
      </div>

      {/* Paciente */}
      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-slate-50 p-4">
        <p>
          <span className="text-slate-500">Paciente: </span>
          <b>{fullName(treatment.patient)}</b>
        </p>
        <p>
          <span className="text-slate-500">Documento: </span>
          {treatment.patient?.document_number ?? '—'}
        </p>
        <p>
          <span className="text-slate-500">Teléfono: </span>
          {treatment.patient?.phone ?? '—'}
        </p>
        <p>
          <span className="text-slate-500">Doctor: </span>
          {treatment.doctor?.full_name ?? '—'}
        </p>
        <p className="col-span-2">
          <span className="text-slate-500">Plan: </span>
          {treatment.title} · {docNumber('P', treatment.number)}
          {kind === 'budget' && ` · ${TREATMENT_STATUS[treatment.status].label}`}
        </p>
      </div>

      {kind === 'budget' ? (
        <>
          <table className="mt-5 w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Pieza</th>
                <th className="py-2 pr-2">Procedimiento</th>
                <th className="py-2 pr-2 text-right">Cant.</th>
                <th className="py-2 pr-2 text-right">P. unit.</th>
                <th className="py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id ?? i} className="border-b border-slate-100">
                  <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
                  <td className="py-2 pr-2">{it.tooth_number ?? '—'}</td>
                  <td className="py-2 pr-2">{it.description}</td>
                  <td className="py-2 pr-2 text-right">{it.quantity}</td>
                  <td className="py-2 pr-2 text-right">{money(it.unit_price, cur)}</td>
                  <td className="py-2 text-right font-medium">{money(it.quantity * Number(it.unit_price), cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex justify-end">
            <dl className="w-64 space-y-1">
              <div className="flex justify-between">
                <dt className="text-slate-500">Subtotal</dt>
                <dd>{money(treatment.subtotal, cur)}</dd>
              </div>
              {Number(treatment.discount) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Descuento</dt>
                  <dd>- {money(treatment.discount, cur)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-300 pt-1 text-sm font-bold">
                <dt>Total</dt>
                <dd>{money(treatment.total, cur)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Pagado</dt>
                <dd>{money(treatment.paid, cur)}</dd>
              </div>
              <div className="flex justify-between font-semibold text-sky-700">
                <dt>Saldo pendiente</dt>
                <dd>{money(treatment.balance, cur)}</dd>
              </div>
            </dl>
          </div>
          {treatment.valid_until && <p className="mt-3 text-slate-500">Presupuesto válido hasta el {fmtDate(treatment.valid_until)}.</p>}
          {treatment.notes && <p className="mt-2 whitespace-pre-line text-slate-600">{treatment.notes}</p>}
        </>
      ) : (
        payment && (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-slate-200 p-5 text-center">
              <p className="text-[11px] uppercase tracking-widest text-slate-500">Monto recibido</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{money(payment.amount, cur)}</p>
              <p className="mt-1 text-slate-500">
                {PAYMENT_METHODS[payment.method]}
                {payment.reference ? ` · Op. ${payment.reference}` : ''}
              </p>
            </div>
            <dl className="ml-auto w-72 space-y-1">
              <div className="flex justify-between">
                <dt className="text-slate-500">Total del plan</dt>
                <dd>{money(treatment.total, cur)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Pagado a la fecha</dt>
                <dd>{money(paidUntil, cur)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-300 pt-1 font-bold">
                <dt>Saldo pendiente</dt>
                <dd>{money(balanceAfter, cur)}</dd>
              </div>
            </dl>
            {payment.notes && <p className="text-slate-600">Nota: {payment.notes}</p>}
            {payment.receiver?.full_name && <p className="text-slate-500">Recibido por: {payment.receiver.full_name}</p>}
          </div>
        )
      )}

      {/* QR y datos de pago */}
      {(showQr || config?.bank_details) && (
        <div className="mt-6 flex items-center gap-5 rounded-lg border border-dashed border-slate-300 p-4">
          {showQr && <img src={config?.payment_qr_url ?? ''} alt="QR de pago" className="h-32 w-32 shrink-0 rounded-md object-contain" />}
          <div>
            <p className="text-sm font-semibold text-slate-900">{config?.payment_qr_label || 'Paga escaneando el código QR'}</p>
            {config?.bank_details && <p className="mt-1 whitespace-pre-line text-slate-600">{config.bank_details}</p>}
            <p className="mt-1 text-[11px] text-slate-400">Envíe su constancia indicando el N° {number}.</p>
          </div>
        </div>
      )}

      <p className="mt-8 border-t border-slate-200 pt-3 text-center text-[11px] text-slate-400">
        {config?.receipt_footer || 'Gracias por su preferencia.'} · Documento interno, no válido como comprobante electrónico SUNAT.
      </p>
    </div>
  );
}

/** Monta el documento en la raíz de impresión (fuera del árbol de la app) mientras está abierto. */
export function PrintPortal(props: Parameters<typeof PrintDocument>[0]) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.createElement('div');
    el.className = 'print-root';
    document.body.appendChild(el);
    setHost(el);
    return () => {
      document.body.removeChild(el);
    };
  }, []);
  return host ? createPortal(<PrintDocument {...props} />, host) : null;
}
