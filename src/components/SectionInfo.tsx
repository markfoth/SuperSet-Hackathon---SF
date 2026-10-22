import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Native modal supplies focus containment, Escape, and focus return to the info button. */
export function SectionInfo({ title, children }: { title: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button className="section-info-button" aria-label={`${title} information`} aria-haspopup="dialog"
      onClick={() => dialog.current?.showModal()}><span aria-hidden="true">i</span></button>
    {createPortal(<dialog ref={dialog} className="modal section-info-dialog" aria-label={`${title} information`}
      onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="section-info-content">
        <button className="icon-btn close" aria-label="Close information" onClick={() => dialog.current?.close()}>×</button>
        <h2>{title}</h2>
        {children}
      </div>
    </dialog>, document.body)}
  </>;
}
