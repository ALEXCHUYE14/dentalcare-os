import type { ClinicalDocument, Patient, TenantConfig } from '../../types';
import { DOC_KINDS } from '../../utils/constants';
import { ageFrom, docNumber, fmtDate, fullName } from '../../utils/format';

/** Documento clínico imprimible (A4): receta, consentimiento, indicaciones, constancia o referencia. */
export function ClinicalDocumentPrint({ doc, patient, config }: { doc: ClinicalDocument; patient: Patient; config: TenantConfig | null }) {
  const meta = DOC_KINDS[doc.kind];
  const age = ageFrom(patient.birth_date);
  const doctor = doc.doctor;

  return (
    <div className="mx-auto flex min-h-[960px] w-full max-w-[794px] flex-col bg-white p-8 font-sans text-[12.5px] leading-relaxed text-slate-800 sm:p-10">
      {/* Membrete */}
      <div className="flex items-start justify-between gap-6 border-b-2 border-sky-600 pb-4">
        <div className="flex items-start gap-4">
          {config?.logo_url && <img src={config.logo_url} alt="" className="h-14 w-14 object-contain" />}
          <div>
            <p className="text-lg font-bold text-slate-900">{config?.business_name ?? 'Consultorio odontológico'}</p>
            {config?.address && <p>{config.address}</p>}
            <p>{[config?.phone, config?.phone_alt].filter(Boolean).join(' · ')}</p>
            {config?.email && <p>{config.email}</p>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-sm font-semibold text-slate-900">{docNumber(meta.prefix, doc.number)}</p>
          <p className="text-[11px] text-slate-500">{fmtDate(doc.created_at, { day: '2-digit', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>

      <h1 className="mt-6 text-center text-base font-bold uppercase tracking-wide text-slate-900">{doc.title}</h1>

      {/* Paciente */}
      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-slate-50 p-4">
        <p className="col-span-2">
          <span className="text-slate-500">Paciente: </span>
          <b>{fullName(patient)}</b>
        </p>
        <p>
          <span className="text-slate-500">Documento: </span>
          {patient.document_number ? `${patient.document_type} ${patient.document_number}` : '—'}
        </p>
        <p>
          <span className="text-slate-500">Edad: </span>
          {age !== null ? `${age} años` : '—'}
        </p>
        {doc.kind === 'receta' && patient.allergies.length > 0 && (
          <p className="col-span-2 font-medium text-rose-700">Alergias: {patient.allergies.join(', ')}</p>
        )}
      </div>

      {/* Cuerpo */}
      <div className="mt-6 flex-1">
        {doc.kind === 'receta' && doc.items.length > 0 && (
          <div>
            <p className="mb-3 font-serif text-2xl font-bold italic text-sky-700">Rp/</p>
            <ol className="space-y-3">
              {doc.items.map((it, i) => (
                <li key={i} className="border-b border-slate-100 pb-2">
                  <p className="font-semibold text-slate-900">
                    {i + 1}. {it.drug}
                  </p>
                  <p className="text-slate-600">
                    {[it.dose, it.frequency && `cada ${it.frequency}`, it.duration && `por ${it.duration}`].filter(Boolean).join(' · ')}
                  </p>
                  {it.notes && <p className="text-[11.5px] text-slate-500">{it.notes}</p>}
                </li>
              ))}
            </ol>
          </div>
        )}
        {doc.body && (
          <div className={doc.kind === 'receta' ? 'mt-5' : ''}>
            {doc.kind === 'receta' && <p className="mb-1 font-semibold text-slate-900">Indicaciones</p>}
            <p className="whitespace-pre-line text-justify">{doc.body}</p>
          </div>
        )}
      </div>

      {/* Firmas */}
      <div className={`mt-16 grid gap-10 ${doc.kind === 'consentimiento' ? 'grid-cols-2' : 'grid-cols-1 justify-items-end'}`}>
        {doc.kind === 'consentimiento' && (
          <div className="text-center">
            <div className="mx-auto mb-1 h-16 w-16 rounded border border-slate-300" title="Huella digital" />
            <div className="border-t border-slate-400 pt-1">
              <p className="font-medium">{fullName(patient)}</p>
              <p className="text-[11px] text-slate-500">
                {patient.document_number ? `${patient.document_type} ${patient.document_number}` : 'Firma del paciente o representante'}
              </p>
            </div>
          </div>
        )}
        <div className="w-64 self-end text-center">
          <div className="border-t border-slate-400 pt-1">
            <p className="font-medium">{doctor?.full_name ? `Dr(a). ${doctor.full_name}` : 'Firma y sello del profesional'}</p>
            {doctor?.specialty && <p className="text-[11px] text-slate-500">{doctor.specialty}</p>}
            {doctor?.license_number && <p className="text-[11px] text-slate-500">COP {doctor.license_number}</p>}
          </div>
        </div>
      </div>

      <p className="mt-8 border-t border-slate-200 pt-3 text-center text-[10.5px] text-slate-400">
        {config?.business_name ?? 'DentalCare OS'} · Documento {docNumber(meta.prefix, doc.number)} emitido el {fmtDate(doc.created_at)}
      </p>
    </div>
  );
}
