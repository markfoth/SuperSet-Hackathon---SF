import { useEffect, useRef } from 'react';

/** Restore the opener and keep keyboard navigation inside the active dialog. */
export function useModalFocus(onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const focusables = () => [...(root?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])].filter(e => e.getClientRects().length);
    focusables()[0]?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); }
      if (e.key !== 'Tab') return;
      const nodes = focusables();
      if (!nodes.length) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === nodes[0] || !root?.contains(document.activeElement))) { e.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); opener?.focus(); };
  }, []);
  return ref;
}
