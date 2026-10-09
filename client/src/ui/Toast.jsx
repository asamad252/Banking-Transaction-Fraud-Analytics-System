// Toast stack. Each message slides in from the right and springs back out.
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { animated, useTransition } from '@react-spring/web';
import Icon from './Icon.jsx';

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback((message, tone = 'good') => {
    const id = nextId++;
    setToasts((list) => [...list.slice(-3), { id, message, tone }]);
    setTimeout(() => dismiss(id), tone === 'bad' ? 7000 : 4200);
  }, [dismiss]);

  const transitions = useTransition(toasts, {
    keys: (toast) => toast.id,
    from: { opacity: 0, x: 48 },
    enter: { opacity: 1, x: 0 },
    leave: { opacity: 0, x: 48 },
    config: { tension: 300, friction: 26 },
  });

  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {transitions((style, toast) => (
          <animated.div
            className={`toast toast-${toast.tone}`}
            style={{ opacity: style.opacity, transform: style.x.to((x) => `translateX(${x}px)`) }}
          >
            <Icon name={toast.tone === 'bad' ? 'alert' : 'check'} size={16} />
            <span>{toast.message}</span>
            <button type="button" className="icon-button" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              <Icon name="close" size={14} />
            </button>
          </animated.div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
