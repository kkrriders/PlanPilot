'use client'
import { useState, useEffect, useRef } from 'react'
import { simulationService, SimEvent, StepResult } from '@/services/simulationService'
import { X, Play, SkipForward, RotateCcw, Activity, TrendingUp, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  planId: string
  onClose: () => void
  onStepComplete: () => void   // refresh dag + drift in parent
}

const SEVERITY_COLOR: Record<string, string> = {
  none:     'text-gray-400',
  low:      'text-blue-400',
  medium:   'text-yellow-400',
  high:     'text-orange-400',
  critical: 'text-red-400',
}

const SEVERITY_BAR: Record<string, string> = {
  none:     'bg-gray-600',
  low:      'bg-blue-500',
  medium:   'bg-yellow-500',
  high:     'bg-orange-500',
  critical: 'bg-red-500',
}

export default function SimulationPanel({ planId, onClose, onStepComplete }: Props) {
  const [day, setDay] = useState(0)
  const [log, setLog] = useState<{ day: number; events: SimEvent[] }[]>([])
  const [stats, setStats] = useState<Omit<StepResult, 'events'> | null>(null)
  const [running, setRunning] = useState(false)
  const [stepping, setStepping] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const runStepRef = useRef<() => Promise<void>>(async () => {})
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  // Stop auto-run when simulation completes
  useEffect(() => {
    if (done && autoRef.current) {
      clearInterval(autoRef.current)
      autoRef.current = null
      setRunning(false)
    }
  }, [done])

  // Keep ref in sync so setInterval always calls the latest version of runStep
  useEffect(() => {
    runStepRef.current = runStep
  })

  const runStep = async () => {
    if (stepping || done) return
    setStepping(true)
    setError('')
    try {
      const result = await simulationService.step(planId)
      const nextDay = day + 1
      setDay(nextDay)
      setLog(prev => [...prev, { day: nextDay, events: result.events }])
      const { events, ...rest } = result
      setStats(rest)
      setDone(result.simulation_complete)
      onStepComplete()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Step failed')
      if (autoRef.current) {
        clearInterval(autoRef.current)
        autoRef.current = null
        setRunning(false)
      }
    } finally {
      setStepping(false)
    }
  }

  const toggleAuto = () => {
    if (running) {
      clearInterval(autoRef.current!)
      autoRef.current = null
      setRunning(false)
    } else {
      setRunning(true)
      autoRef.current = setInterval(() => runStepRef.current(), 1800)
    }
  }

  const handleReset = async () => {
    if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null }
    setRunning(false)
    setStepping(false)
    setDone(false)
    setDay(0)
    setLog([])
    setStats(null)
    setError('')
    await simulationService.reset(planId)
    onStepComplete()
  }

  const driftPct = stats?.drift.overall_drift ?? 0
  const severity = stats?.drift.severity ?? 'none'

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-gray-950 border-l border-gray-700 shadow-2xl z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-blue-400" />
          <span className="font-semibold text-white text-sm">Simulation</span>
          {day > 0 && (
            <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">
              Day {day}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="p-1.5 text-gray-500 hover:text-white transition-colors"
            title="Reset simulation"
          >
            <RotateCcw size={13} />
          </button>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="px-4 py-3 border-b border-gray-800 space-y-3">
          {/* Progress */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">
                {stats.completed_tasks}/{stats.total_tasks} tasks complete
                {stats.in_progress_tasks > 0 && <span className="text-blue-400 ml-2">{stats.in_progress_tasks} active</span>}
                {stats.blocked_tasks > 0 && <span className="text-red-400 ml-2">{stats.blocked_tasks} blocked</span>}
              </span>
              <span className="text-white font-medium">{stats.progress_pct}%</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${stats.progress_pct}%` }}
              />
            </div>
          </div>

          {/* Drift meter */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400 flex items-center gap-1">
                <TrendingUp size={10} />
                Drift
              </span>
              <span className={clsx('font-medium', SEVERITY_COLOR[severity])}>
                {severity !== 'none' ? severity.toUpperCase() : 'NONE'} — {driftPct.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5">
              <div
                className={clsx('h-1.5 rounded-full transition-all duration-500', SEVERITY_BAR[severity])}
                style={{ width: `${Math.min(driftPct, 100)}%` }}
              />
            </div>
          </div>

          {/* Drift alert */}
          {(severity === 'high' || severity === 'critical') && (
            <div className="flex items-start gap-2 bg-orange-950/50 border border-orange-800 rounded-lg p-2">
              <AlertCircle size={13} className="text-orange-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-orange-300">
                Significant drift detected. Use <strong>Request Replan</strong> on the main panel to let the AI revise the remaining work.
              </p>
            </div>
          )}
          {severity === 'medium' && (
            <div className="flex items-start gap-2 bg-yellow-950/50 border border-yellow-800/60 rounded-lg p-2">
              <Clock size={13} className="text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-300">
                Medium drift forming — schedule slipping. Keep running to see adaptive replanning trigger.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Activity log */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {log.length === 0 && (
          <div className="text-center py-12">
            <Activity size={28} className="text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Press <strong className="text-gray-300">Run Day</strong> to start</p>
            <p className="text-gray-600 text-xs mt-1">Each step = one compressed project day</p>
          </div>
        )}

        {[...log].reverse().map(({ day: d, events }) => (
          <div key={d}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-gray-800" />
              <span className="text-[10px] text-gray-500 font-medium">DAY {d}</span>
              <div className="h-px flex-1 bg-gray-800" />
            </div>
            <div className="space-y-2">
              {events.map((ev, i) => (
                <EventRow key={i} event={ev} />
              ))}
              {events.length === 0 && (
                <p className="text-xs text-gray-600 italic">No tasks ready — all dependencies pending.</p>
              )}
            </div>
          </div>
        ))}

        {done && (
          <div className="text-center py-4">
            <CheckCircle size={20} className="text-emerald-400 mx-auto mb-2" />
            <p className="text-emerald-400 text-sm font-medium">Simulation complete</p>
          </div>
        )}

        <div ref={logEndRef} />
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-t border-gray-800 flex gap-2">
        <button
          onClick={toggleAuto}
          disabled={done}
          className={clsx(
            'flex items-center gap-2 flex-1 justify-center px-3 py-2 text-sm font-medium rounded-lg transition-colors',
            running
              ? 'bg-orange-700 hover:bg-orange-600 text-white'
              : 'bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white'
          )}
        >
          <Play size={13} className={running ? 'animate-pulse' : ''} />
          {running ? 'Pause' : 'Auto Run'}
        </button>

        <button
          onClick={runStep}
          disabled={stepping || done || running}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 rounded-lg transition-colors"
        >
          <SkipForward size={13} />
          Day
        </button>
      </div>

      {error && (
        <p className="px-4 pb-3 text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}

function EventRow({ event }: { event: SimEvent }) {
  const isCompleted = event.type === 'completed'
  const isBlocked = event.type === 'blocked'
  const isStarted = event.type === 'started'

  const iconCls = isCompleted ? 'text-emerald-400' : isBlocked ? 'text-red-400' : 'text-blue-400'
  const borderCls = isCompleted ? 'border-emerald-900/50' : isBlocked ? 'border-red-900/50' : 'border-gray-800'

  return (
    <div className={clsx('border rounded-lg p-2.5 space-y-1', borderCls, 'bg-gray-900/50')}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{event.emoji}</span>
          <span className="text-xs font-medium text-white">{event.bot}</span>
          <span className={clsx('text-[10px] uppercase font-medium', iconCls)}>
            {isCompleted ? '✓ done' : isBlocked ? '⊘ blocked' : '▶ started'}
          </span>
        </div>
        {isCompleted && event.over_under !== undefined && (
          <span className={clsx(
            'text-[10px] font-medium',
            event.over_under > 0 ? 'text-orange-400' : 'text-emerald-400'
          )}>
            {event.over_under > 0 ? '+' : ''}{event.over_under}h
          </span>
        )}
      </div>

      <p className="text-[11px] text-gray-300 leading-snug truncate" title={event.task}>
        {event.task}
      </p>

      {isCompleted && event.estimated_hours && (
        <p className="text-[10px] text-gray-600">
          {event.estimated_hours}h est → {event.actual_hours}h actual
        </p>
      )}

      <p className="text-[10px] text-gray-500 leading-snug line-clamp-2">{event.note}</p>
    </div>
  )
}
