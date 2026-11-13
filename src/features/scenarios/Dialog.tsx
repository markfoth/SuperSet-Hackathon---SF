import { useEffect, useRef, type ReactNode } from 'react';

export function Dialog({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null), closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex="0"]')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab' || !panel) return;
      const controls = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')]
        .filter((control) => control.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); panel.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop decision-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`modal decision-dialog ${className}`}>
      <div className="decision-dialog-heading"><h2>{title}</h2><button className="icon-btn" type="button" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>×</button></div>
      {children}
    </section>
  </div>;
}
