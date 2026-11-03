import { Database } from 'lucide-react';

export default function SetupRequired() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-600">
          <Database className="h-6 w-6" strokeWidth={1.75} />
        </div>
        <h1 className="text-lg font-semibold">Conecta tu proyecto de Supabase</h1>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>Ejecuta <code className="rounded bg-slate-100 px-1">supabase/schema.sql</code> en el SQL Editor de Supabase.</li>
          <li>
            Crea un archivo <code className="rounded bg-slate-100 px-1">.env</code> (o variables en Vercel) con:
          </li>
        </ol>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...`}
        </pre>
        <p className="mt-3 text-sm text-slate-500">Reinicia el servidor de desarrollo o vuelve a desplegar.</p>
      </div>
    </div>
  );
}
