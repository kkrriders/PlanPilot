'use client'
import { useState } from 'react'
import { X, Play, CheckCircle, AlertCircle, Ban, MessageSquare, Link, ShieldAlert, ShieldCheck, Clock, ExternalLink } from 'lucide-react'
import { executionService } from '../../services/executionService'
import { useToastStore } from '../../store/toastStore'

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
  { value: 'started',   label: 'Start task',    icon: Play,          newStatus: 'in_progress', color: 'text-blue-400'   },
  { value: 'progress',  label: 'Log progress',  icon: MessageSquare, newStatus: 'in_progress', color: 'text-cyan-400'   },
  { value: 'blocked',   label: 'Mark blocked',  icon: AlertCircle,   newStatus: 'blocked',     color: 'text-yellow-400' },
  { value: 'completed', label: 'Mark complete', icon: CheckCircle,   newStatus: 'completed',   color: 'text-green-400'  },
  { value: 'failed',    label: 'Mark failed',   icon: Ban,           newStatus: 'failed',       color: 'text-red-400'    },
]

const NOTE_MIN = 10
const COMPLETION_NOTE_MIN = 50

export default function TaskUpdateModal({ planId, task, onClose, onUpdated }: Props) {
  const [eventType, setEventType] = useState('progress')
  const [pctComplete, setPctComplete] = useState(0)
  const [note, setNote] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [actualHours, setActualHours] = useState('')
  const [isExternalBlock, setIsExternalBlock] = useState(false)
  const [externalBlockReason, setExternalBlockReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [serverErrors, setServerErrors] = useState<{ code: string; message: string }[]>([])
  const { toast } = useToastStore()

  const selected = EVENT_OPTIONS.find(e => e.value === eventType)!
  const isCompletion = eventType === 'completed'

  // Client-side validation
  const noteOk = note.trim().length >= NOTE_MIN
  const evidenceOk = !isCompletion || (
    (evidenceUrl.startsWith('http') || /^[0-9a-f]{7,40}$/i.test(evidenceUrl.trim()))
    || note.trim().length >= COMPLETION_NOTE_MIN
  )
  const canSubmit = noteOk && evidenceOk && !loading

  const submit = async () => {
    setLoading(true)
    setServerErrors([])
    try {
      await executionService.logEvent(planId, task.id, {
        event_type: eventType,
        pct_complete: pctComplete,
        note: note.trim(),
        new_status: selected.newStatus,
        evidence_url: evidenceUrl.trim() || undefined,
        actual_hours: actualHours ? parseFloat(actualHours) : undefined,
        is_external_block: eventType === 'blocked' ? isExternalBlock : undefined,
        external_block_reason: eventType === 'blocked' && isExternalBlock ? externalBlockReason.trim() || undefined : undefined,
      })
      toast(`Task "${task.label}" updated`, 'success')
      onUpdated()
      onClose()
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      if (detail?.compliance_errors) {
        setServerErrors(detail.compliance_errors)
        toast('Compliance check failed — see errors below', 'error')
      } else {
        const msg = detail || 'Failed to log event'
        setServerErrors([{ code: 'SERVER_ERROR', message: msg }])
        toast(msg, 'error')
      }
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
              {task.category && <span className="text-[10px] text-gray-400 uppercase">{task.category}</span>}
              {task.is_on_critical_path && <span className="text-[10px] text-yellow-400">⚡ Critical Path</span>}
              <span className="text-[10px] text-gray-500 capitalize">{task.status}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1"><X size={16} /></button>
        </div>

        {/* Event picker */}
        <div className="space-y-1 mb-4">
          <p className="text-xs text-gray-400 mb-2">Action</p>
          {EVENT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setEventType(opt.value)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                eventType === opt.value ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
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
              <span>Progress</span><span>{pctComplete}%</span>
            </div>
            <input
              type="range" min={0} max={100} step={5} value={pctComplete}
              onChange={e => setPctComplete(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
        )}

        {/* External blocker — shown when marking as blocked */}
        {eventType === 'blocked' && (
          <div className="mb-3 bg-yellow-950/30 border border-yellow-800/40 rounded-lg p-3">
            <label className="flex items-center gap-2 text-xs text-yellow-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isExternalBlock}
                onChange={e => setIsExternalBlock(e.target.checked)}
                className="accent-yellow-500 w-3.5 h-3.5"
              />
              <ExternalLink size={11} />
              External blocker (outside team control)
            </label>
            {isExternalBlock && (
              <input
                value={externalBlockReason}
                onChange={e => setExternalBlockReason(e.target.value)}
                placeholder="e.g. Waiting for vendor API, pending stakeholder approval..."
                className="w-full mt-2 bg-gray-800 border border-yellow-700/40 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-yellow-500 placeholder-gray-600"
              />
            )}
            {isExternalBlock && (
              <p className="text-[10px] text-yellow-600 mt-1">
                External blockers are excluded from drift overdue penalty.
              </p>
            )}
          </div>
        )}

        {/* Evidence URL — required for completions */}
        {isCompletion && (
          <div className="mb-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
              <Link size={11} />
              Evidence (PR, commit, or deploy URL)
              <span className="text-red-400">*</span>
            </label>
            <input
              value={evidenceUrl}
              onChange={e => setEvidenceUrl(e.target.value)}
              placeholder="https://github.com/... or abc1234"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Or provide a detailed note below (50+ chars) as alternative
            </p>
          </div>
        )}

        {/* Actual hours — shown on completion */}
        {isCompletion && (
          <div className="mb-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
              <Clock size={11} />
              Actual hours spent
              {task.estimated_hours && (
                <span className="text-gray-600 ml-auto">est. {task.estimated_hours}h</span>
              )}
            </label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={actualHours}
              onChange={e => setActualHours(e.target.value)}
              placeholder={task.estimated_hours ? `${task.estimated_hours}` : 'e.g. 4.5'}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* Note */}
        <div className="mb-1">
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs text-gray-400">
              Note <span className="text-red-400">*</span>
            </label>
            <span className={`text-[10px] ${note.trim().length >= NOTE_MIN ? 'text-green-400' : 'text-gray-500'}`}>
              {note.trim().length}/{isCompletion ? COMPLETION_NOTE_MIN : NOTE_MIN}
            </span>
          </div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={isCompletion
              ? "Describe what was completed, tested, and verified..."
              : "What did you work on? Any blockers or notes?"}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs resize-none h-20 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Inline validation hints */}
        <div className="mb-3 space-y-1">
          {!noteOk && note.length > 0 && (
            <p className="text-[10px] text-amber-400 flex items-center gap-1">
              <ShieldAlert size={10} /> Note needs at least {NOTE_MIN} characters
            </p>
          )}
          {isCompletion && !evidenceOk && (
            <p className="text-[10px] text-amber-400 flex items-center gap-1">
              <ShieldAlert size={10} /> Provide a PR/commit URL or write {COMPLETION_NOTE_MIN}+ char note
            </p>
          )}
          {canSubmit && (
            <p className="text-[10px] text-green-400 flex items-center gap-1">
              <ShieldCheck size={10} /> Compliance checks passed
            </p>
          )}
        </div>

        {/* Server compliance errors */}
        {serverErrors.length > 0 && (
          <div className="mb-3 space-y-1.5 bg-red-950/50 border border-red-800 rounded-lg p-3">
            {serverErrors.map((e, i) => (
              <p key={i} className="text-xs text-red-300 flex items-start gap-1.5">
                <ShieldAlert size={12} className="mt-0.5 flex-shrink-0 text-red-400" />
                <span><strong className="text-red-400">{e.code}:</strong> {e.message}</span>
              </p>
            ))}
          </div>
        )}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
