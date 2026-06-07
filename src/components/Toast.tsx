import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { haptic } from '../lib/haptics'

type Toast = {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void
  celebrate?: boolean
}

type ToastApi = {
  show: (message: string, opts?: { actionLabel?: string; onAction?: () => void; celebrate?: boolean; duration?: number }) => void
}

const ToastCtx = createContext<ToastApi>({ show: () => {} })

export function useToast() {
  return useContext(ToastCtx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const show = useCallback<ToastApi['show']>(
    (message, opts) => {
      const id = ++idRef.current
      const toast: Toast = {
        id,
        message,
        actionLabel: opts?.actionLabel,
        onAction: opts?.onAction,
        celebrate: opts?.celebrate,
      }
      setToasts((t) => [...t.slice(-2), toast])
      if (opts?.celebrate) haptic([12, 40, 12])
      const dur = opts?.duration ?? (opts?.actionLabel ? 5000 : 2600)
      window.setTimeout(() => remove(id), dur)
    },
    [remove],
  )

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.celebrate ? ' celebrate' : ''}`}>
            <span className="grow small">{t.message}</span>
            {t.actionLabel && (
              <button
                className="toast-action"
                onClick={() => {
                  t.onAction?.()
                  remove(t.id)
                }}
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
