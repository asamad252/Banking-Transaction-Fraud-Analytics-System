// Modal dialog that springs in from slightly below and scales to rest.
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { animated, to, useTransition } from '@react-spring/web';
import Icon from './Icon.jsx';

export default function Dialog({ open, onClose, title, description, children, width = 520 }) {
  const titleId = useId();
  const panel = useRef(null);
  const returnFocusTo = useRef(null);
  // Callers often pass a fresh onClose each render; a ref keeps the effect below
  // tied to `open` alone so focus is not yanked around on re-renders.
  const close = useRef(onClose);
  close.current = onClose;

  const transitions = useTransition(open, {
    from: { opacity: 0, y: 28, scale: 0.96 },
    enter: { opacity: 1, y: 0, scale: 1 },
    leave: { opacity: 0, y: 12, scale: 0.98 },
    config: { tension: 320, friction: 28 },
  });

  useEffect(() => {
    if (!open) return undefined;
    returnFocusTo.current = document.activeElement;
    // Wait a frame so the panel exists, then move focus inside it.
    const frame = requestAnimationFrame(() => {
      const first = panel.current?.querySelector('[data-autofocus], input, select, textarea, button');
      (first || panel.current)?.focus();
    });

    const onKeyDown = (event) => {
      if (event.key === 'Escape') close.current();
      if (event.key !== 'Tab' || !panel.current) return;
      // Keep Tab inside the dialog.
      const focusable = panel.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      returnFocusTo.current?.focus?.();
    };
  }, [open]);

  return transitions((style, visible) => visible && createPortal(
    <animated.div
      className="dialog-backdrop"
      style={{ opacity: style.opacity }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <animated.div
        ref={panel}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          maxWidth: width,
          transform: to([style.y, style.scale], (y, s) => `translateY(${y}px) scale(${s})`),
        }}
      >
        <header className="dialog-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        {children}
      </animated.div>
    </animated.div>,
    document.body,
  ));
}
