'use client'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { useToastStore } from '@/store/toastStore'
import type { ToastType } from '@/store/toastStore'

const ICON: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const STYLE: Record<ToastType, string> = {
  success: 'bg-emerald-950 border-emerald-700 text-emerald-200',
  error:   'bg-red-950 border-red-700 text-red-200',
  warning: 'bg-yellow-950 border-yellow-700 text-yellow-200',
  info:    'bg-gray-800 border-gray-600 text-gray-200',
}

export default function ToastContainer() {
  const { toasts, dismiss } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => {
        const Icon = ICON[t.type]
        return (
          <div
            key={t.id}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm shadow-xl pointer-events-auto animate-in slide-in-from-right-4 ${STYLE[t.type]}`}
          >
            <Icon size={14} className="flex-shrink-0" />
            <span className="max-w-[300px]">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="ml-1 opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
