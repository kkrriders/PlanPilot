import { useState } from 'react'
import { X, Play, CheckCircle, AlertCircle, Ban, MessageSquare } from 'lucide-react'
import { executionService } from '../../services/executionService'

interface Props {
  planId: string
  task: {
    id: string
    label: string
    status: string
    category?: string
    estimated_hours?: number
    is_on_critical_path: boolean
  }
  onClose: () => void
  onUpdated: () => void
}

const EVENT_OPTIONS = [
  { value: 'started', label: 'Start task', icon: Play, newStatus: 'in_progress', color: 'text-blue-400' },
  { value: 'progress', label: 'Log progress', icon: MessageSquare, newStatus: 'in_progress', color: 'text-cyan-400' },
  { value: 'blocked', label: 'Mark blocked', icon: AlertCircle, newStatus: 'blocked', color: 'text-yellow-400' },
  { value: 'completed', label: 'Mark complete', icon: CheckCircle, newStatus: 'completed', color: 'text-green-400' },
  { value: 'failed', label: 'Mark failed', icon: Ban, newStatus: 'failed', color: 'text-red-400' },
]

export default function TaskUpdateModal({ planId, task, onClose, onUpdated }: Props) {
  const [eventType, setEventType] = useState('progress')
  const [pctComplete, setPctComplete] = useState(0)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selected = EVENT_OPTIONS.find(e => e.value === eventType)!

  const submit = async () => {
    setLoading(true)
    setError('')
    try {
      await executionService.logEvent(planId, task.id, {
        event_type: eventType,
        pct_complete: pctComplete,
        note: note || undefined,
        new_status: selected.newStatus,
      })
      onUpdated()
      onClose()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to log event')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-5 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-white text-sm leading-tight max-w-[220px]">{task.label}</h3>
            <div className="flex items-center gap-2 mt-1">
              {task.category && (
                <span className="text-[10px] text-gray-400 uppercase">{task.category}</span>
              )}
              {task.is_on_critical_path && (
                <span className="text-[10px] text-yellow-400">⚡ Critical Path</span>
              )}
              <span className="text-[10px] text-gray-500 capitalize">{task.status}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
            <X size={16} />
          </button>
        </div>

        {/* Event type picker */}
        <div className="space-y-1 mb-4">
          <p className="text-xs text-gray-400 mb-2">Action</p>
          {EVENT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setEventType(opt.value)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                eventType === opt.value
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <opt.icon size={14} className={opt.color} />
              {opt.label}
            </button>
          ))}
        </div>

        {/* Progress slider */}
        {(eventType === 'progress' || eventType === 'started') && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Progress</span>
              <span>{pctComplete}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={pctComplete}
              onChange={e => setPctComplete(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
        )}

        {/* Note */}
        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-1">Note (optional)</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Add context..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs resize-none h-16 focus:outline-none focus:border-blue-500"
          />
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <button
          onClick={submit}
          disabled={loading}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
