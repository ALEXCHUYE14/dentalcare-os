import { MessageCircle, Printer } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import type { Payment, Treatment } from '../../types';
import { PAYMENT_METHODS } from '../../utils/constants';
import { docNumber, money, waLink } from '../../utils/format';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { PrintDocument, PrintPortal, type PrintKind } from './PrintDocument';

export function PrintPreviewModal({
  open,
  onClose,
  kind,
  treatment,
  payment,
}: {
  open: boolean;
  onClose: () => void;
  kind: PrintKind;
  treatment: Treatment | null;
  payment?: Payment | null;
}) {
  const { config } = useSettings();
  if (!open || !treatment) return null;
  const cur = config?.currency ?? 'PEN';
  const business = config?.business_name ?? 'el consultorio';

  const message =
    kind === 'budget'
      ? `Hola ${treatment.patient?.first_name ?? ''}, le compartimos su presupuesto ${docNumber('P', treatment.number)} de ${business}: ${treatment.title}. Total ${money(
          treatment.total,
          cur,
        )}, saldo ${money(treatment.balance, cur)}.`
      : `Hola ${treatment.patient?.first_name ?? ''}, confirmamos su pago de ${money(payment?.amount, cur)} (${
          payment ? PAYMENT_METHODS[payment.method] : ''
        }) en ${business}. Recibo ${docNumber('R', payment?.number ?? 0)}.`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={kind === 'budget' ? 'Vista previa del presupuesto' : 'Vista previa del recibo'}
      subtitle="Usa “Imprimir / PDF” y elige “Guardar como PDF” para exportar"
      bodyClassName="bg-slate-100 p-3 sm:p-6"
      footer={
        <>
          {treatment.patient?.phone && (
            <a href={waLink(treatment.patient.phone, message)} target="_blank" rel="noreferrer" className="mr-auto">
              <Button variant="secondary" icon={<MessageCircle />}>
                WhatsApp
              </Button>
            </a>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button icon={<Printer />} onClick={() => window.print()}>
            Imprimir / PDF
          </Button>
        </>
      }
    >
      <div className="overflow-hidden rounded-lg shadow-md ring-1 ring-slate-200">
        <PrintDocument kind={kind} config={config} treatment={treatment} payment={payment} />
      </div>
      <PrintPortal kind={kind} config={config} treatment={treatment} payment={payment} />
    </Modal>
  );
}
