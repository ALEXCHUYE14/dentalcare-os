import type { DocumentKind } from '../types';

export interface TemplateContext {
  patient: string;
  document: string;
  doctor: string;
  date: string;
  business: string;
}

interface Template {
  id: string;
  label: string;
  title: string;
  body: (c: TemplateContext) => string;
}

const BLANK = '____________________';

/** Plantillas editables: el profesional ajusta el texto antes de emitir el documento. */
export const DOC_TEMPLATES: Record<DocumentKind, Template[]> = {
  receta: [
    {
      id: 'receta',
      label: 'Receta',
      title: 'Receta médica',
      body: () => '',
    },
  ],
  consentimiento: [
    {
      id: 'general',
      label: 'Procedimiento odontológico',
      title: 'Consentimiento informado',
      body: (c) =>
        `Yo, ${c.patient}, identificado(a) con ${c.document}, declaro que el/la Dr(a). ${c.doctor} me ha explicado de forma clara y comprensible el procedimiento de ${BLANK}, su naturaleza, objetivos y beneficios esperados.\n\n` +
        'Se me han informado los riesgos y posibles complicaciones (dolor, inflamación, sangrado, infección, reacción a la anestesia, sensibilidad, parestesia temporal o permanente, fractura de piezas o instrumentos, entre otros), las alternativas de tratamiento disponibles y las consecuencias de no realizarlo.\n\n' +
        'He podido formular todas mis preguntas, que fueron respondidas satisfactoriamente. Sé que puedo revocar este consentimiento en cualquier momento antes del procedimiento, sin expresión de causa.\n\n' +
        'Por lo expuesto, AUTORIZO la realización del procedimiento indicado.',
    },
    {
      id: 'exodoncia',
      label: 'Exodoncia / cirugía',
      title: 'Consentimiento informado – Exodoncia',
      body: (c) =>
        `Yo, ${c.patient}, identificado(a) con ${c.document}, autorizo al/a la Dr(a). ${c.doctor} a realizar la extracción de la(s) pieza(s) ${BLANK}.\n\n` +
        'Se me explicó que pueden presentarse: dolor, inflamación, hematoma, sangrado, alveolitis, infección, limitación de la apertura bucal, lesión de piezas vecinas, comunicación oro-sinusal, fractura radicular o de tabla ósea y alteración temporal o permanente de la sensibilidad del labio, mentón o lengua.\n\n' +
        'Me comprometo a seguir las indicaciones post-operatorias y a asistir a los controles programados. Entiendo las alternativas de tratamiento y las consecuencias de no realizarlo.',
    },
    {
      id: 'endodoncia',
      label: 'Endodoncia',
      title: 'Consentimiento informado – Endodoncia',
      body: (c) =>
        `Yo, ${c.patient}, identificado(a) con ${c.document}, autorizo al/a la Dr(a). ${c.doctor} a realizar el tratamiento de conductos de la pieza ${BLANK}.\n\n` +
        'Se me explicó que el tratamiento puede requerir varias sesiones, que existe la posibilidad de dolor o inflamación posterior, fractura de instrumentos dentro del conducto, perforación, fracaso del tratamiento con necesidad de retratamiento, cirugía apical o extracción, y que la pieza deberá rehabilitarse con una restauración o corona para evitar su fractura.',
    },
  ],
  indicaciones: [
    {
      id: 'post-exodoncia',
      label: 'Post-exodoncia',
      title: 'Indicaciones post-exodoncia',
      body: () =>
        '1. Mantener la gasa mordida durante 30 a 45 minutos.\n' +
        '2. Aplicar hielo en la zona (por fuera) 15 minutos cada hora durante las primeras 24 horas.\n' +
        '3. No escupir, no enjuagarse ni usar sorbete durante las primeras 24 horas.\n' +
        '4. Dieta blanda y fría o tibia; evitar alimentos calientes, duros o picantes.\n' +
        '5. No fumar ni consumir alcohol por al menos 72 horas.\n' +
        '6. Dormir con la cabeza ligeramente elevada la primera noche.\n' +
        '7. Cepillar los dientes con cuidado, evitando la zona operada el primer día.\n' +
        '8. Tomar la medicación indicada en los horarios prescritos.\n' +
        '9. Acudir de inmediato si presenta sangrado abundante, fiebre o inflamación que aumenta después del tercer día.',
    },
    {
      id: 'post-endodoncia',
      label: 'Post-endodoncia',
      title: 'Indicaciones post-endodoncia',
      body: () =>
        '1. Es normal sentir molestia al masticar durante 2 a 5 días.\n' +
        '2. Evite masticar con la pieza tratada hasta su restauración definitiva.\n' +
        '3. Si la restauración provisional se cae o se fractura, comuníquese con el consultorio.\n' +
        '4. Tome la medicación indicada.\n' +
        '5. La pieza debe restaurarse de forma definitiva a la brevedad para evitar fracturas.',
    },
    {
      id: 'post-blanqueamiento',
      label: 'Post-blanqueamiento',
      title: 'Indicaciones post-blanqueamiento',
      body: () =>
        '1. Durante 48 horas evite alimentos y bebidas con colorantes: café, té, vino, gaseosas oscuras, salsas, chocolate.\n' +
        '2. No fume durante el tratamiento.\n' +
        '3. Puede presentar sensibilidad temporal; use pasta para dientes sensibles.\n' +
        '4. Mantenga una buena higiene oral y acuda a sus controles.',
    },
  ],
  constancia: [
    {
      id: 'atencion',
      label: 'Constancia de atención',
      title: 'Constancia de atención odontológica',
      body: (c) =>
        `Se deja constancia que ${c.patient}, identificado(a) con ${c.document}, fue atendido(a) en ${c.business} el día ${c.date}, recibiendo tratamiento odontológico de ${BLANK}.\n\n` +
        `Se recomienda descanso de ${BLANK} a partir de la fecha.\n\n` +
        'Se expide la presente a solicitud del interesado(a) para los fines que estime conveniente.',
    },
  ],
  referencia: [
    {
      id: 'interconsulta',
      label: 'Interconsulta',
      title: 'Hoja de referencia / interconsulta',
      body: (c) =>
        `Paciente: ${c.patient} (${c.document}).\n\n` +
        `Se refiere al/a la paciente a ${BLANK} para evaluación y manejo de ${BLANK}.\n\n` +
        'Motivo de la referencia:\n\nHallazgos clínicos / radiográficos:\n\nTratamiento realizado hasta la fecha:\n\nAgradeceré su valiosa opinión.',
    },
  ],
};
