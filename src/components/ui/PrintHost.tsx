import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Monta su contenido en la raíz de impresión (fuera del árbol de la app) mientras está abierto. */
export function PrintHost({ children }: { children: ReactNode }) {
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
  return host ? createPortal(children, host) : null;
}
