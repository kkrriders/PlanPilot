'use client'
import { useState, useEffect, useRef } from 'react'
import { simulationService, type SimEvent, type StepResult, type Scenario, SCENARIO_META } from '@/services/simulationService'
import { executionService } from '@/services/executionService'
import api from '@/services/api'
import {
  X, Play, SkipForward, RotateCcw, Activity, TrendingUp,
  CheckCircle, AlertCircle, Clock, Zap, Users, Trophy,
  AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react'
import clsx from 'clsx'

interface Props {
  planId: string
  onClose: () => void
  onStepComplete: () => void
}

const SPEED_OPTIONS = [
  { label: '1×', ms: 1800 },
  { label: '2×', ms: 900  },
  { label: '5×', ms: 360  },
]

const SEVERITY_COLOR: Record<string, string> = {
  none: 'text-gray-400', low: 'text-blue-400', medium: 'text-yellow-400',
  high: 'text-orange-400', critical: 'text-red-400',
}
const SEVERITY_BAR: Record<string, string> = {
  none: 'bg-gray-600', low: 'bg-blue-500', medium: 'bg-yellow-500',
  high: 'bg-orange-500', critical: 'bg-red-500',
}

interface BotScore { done: number; totalOver: number }
interface Bottleneck { task_id: string; name: string; successor_count: number; is_on_critical_path: boolean; is_delayed: boolean }

type Phase = 'setup' | 'running' | 'done'

export default function SimulationPanel({ planId, onClose, onStepComplete }: Props) {
  const [phase, setPhase]           = useState<Phase>('setup')
  const [scenario, setScenario]     = useState<Scenario>('realistic')
  const [speedIdx, setSpeedIdx]     = useState(0)
  const [day, setDay]               = useState(0)
  const [log, setLog]               = useState<{ day: number; events: SimEvent[] }[]>([])
  const [stats, setStats]           = useState<Omit<StepResult, 'events'> | null>(null)
  const [running, setRunning]       = useState(false)
  const [stepping, setStepping]     = useState(false)
  const [error, setError]           = useState('')
  const [replanning, setReplanning] = useState(false)
  const [replanApplied, setReplanApplied] = useState(false)
  const [replanSummary, setReplanSummary] = useState<{ old: number; new: number } | null>(null)
  const [scoreboard, setScoreboard] = useState<Record<string, BotScore>>({})
  const [bottlenecks, setBottlenecks] = useState<Bottleneck[]>([])
  const [showScore, setShowScore]   = useState(false)
  const [summary, setSummary]       = useState<{
    days: number; plannedHours: number; actualHours: number;
    replanApplied: boolean; topOffender: string | null
  } | null>(null)

  const autoRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const runStepRef = useRef<() => Promise<void>>(async () => {})
  const logEndRef  = useRef<HTMLDivElement>(null)

  // Accumulate totals for summary
  const totalsRef = useRef({ plannedHours: 0, actualHours: 0 })

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [log])

  useEffect(() => {
    if (phase === 'done' && autoRef.current) {
      clearInterval(autoRef.current)
      autoRef.current = null
      setRunning(false)
    }
  }, [phase])

  useEffect(() => { runStepRef.current = runStep })

  const updateScoreboard = (events: SimEvent[]) => {
    setScoreboard(prev => {
      const next = { ...prev }
      for (const ev of events) {
        if (ev.type === 'completed') {
          if (!next[ev.bot]) next[ev.bot] = { done: 0, totalOver: 0 }
          next[ev.bot] = {
            done:      next[ev.bot].done + 1,
            totalOver: next[ev.bot].totalOver + (ev.over_under ?? 0),
          }
          totalsRef.current.plannedHours += ev.estimated_hours ?? 0
          totalsRef.current.actualHours  += ev.actual_hours   ?? 0
        }
      }
      return next
    })
  }

  const fetchBottlenecks = async () => {
    try {
      const data = await executionService.getBottlenecks(planId)
      setBottlenecks(data)
    } catch { setBottlenecks([]) }
  }

  const triggerAutoReplan = async () => {
    if (replanApplied || replanning) return
    setReplanning(true)
    try {
      // Fetch current task count before replan
      const dagBefore = await api.get(`/api/v1/plans/${planId}/dag`).then(r => r.data)
      const oldCount = dagBefore.nodes?.length ?? 0

      await api.get(`/api/v1/plans/${planId}/drift/replan/preview`)
      await api.post(`/api/v1/plans/${planId}/drift/replan`)

      const dagAfter = await api.get(`/api/v1/plans/${planId}/dag`).then(r => r.data)
      const newCount = dagAfter.nodes?.length ?? 0

      setReplanApplied(true)
      setReplanSummary({ old: oldCount, new: newCount })
      onStepComplete()
    } catch {
      // Replan failed silently — simulation continues
    } finally {
      setReplanning(false)
    }
  }

  const runStep = async () => {
    if (stepping || phase === 'done') return
    setStepping(true)
    setError('')
    try {
      const nextDay = day + 1
      const result = await simulationService.step(planId, scenario, nextDay)
      setDay(nextDay)
      setLog(prev => [...prev, { day: nextDay, events: result.events }])
      const { events, ...rest } = result
      setStats(rest)
      updateScoreboard(events)
      onStepComplete()
      await fetchBottlenecks()

      // Auto-trigger replan when drift hits high/critical
      if ((result.drift.severity === 'high' || result.drift.severity === 'critical') && !replanApplied) {
        await triggerAutoReplan()
      }

      if (result.simulation_complete) {
        setPhase('done')
        // Build summary
        const topOffender = Object.entries(scoreboard).sort(
          (a, b) => b[1].totalOver - a[1].totalOver
        )[0]?.[0] ?? null
        setSummary({
          days: nextDay,
          plannedHours: totalsRef.current.plannedHours,
          actualHours:  totalsRef.current.actualHours,
          replanApplied,
          topOffender,
        })
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Step failed')
      if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; setRunning(false) }
    } finally {
      setStepping(false)
    }
  }

  const toggleAuto = () => {
    if (running) {
      clearInterval(autoRef.current!); autoRef.current = null; setRunning(false)
    } else {
      setRunning(true)
      autoRef.current = setInterval(() => runStepRef.current(), SPEED_OPTIONS[speedIdx].ms)
    }
  }

  const changeSpeed = (idx: number) => {
    setSpeedIdx(idx)
    if (running) {
      clearInterval(autoRef.current!)
      autoRef.current = setInterval(() => runStepRef.current(), SPEED_OPTIONS[idx].ms)
    }
  }

  const handleReset = async () => {
    if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null }
    setRunning(false); setStepping(false); setDay(0); setLog([]); setStats(null)
    setError(''); setReplanApplied(false); setReplanSummary(null)
    setScoreboard({}); setBottlenecks([]); setSummary(null)
    totalsRef.current = { plannedHours: 0, actualHours: 0 }
    setPhase('setup')
    await simulationService.reset(planId)
    onStepComplete()
  }

  const driftPct  = stats?.drift.overall_drift ?? 0
  const severity  = stats?.drift.severity ?? 'none'

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="fixed right-0 top-0 h-full w-96 bg-gray-950 border-l border-gray-700 shadow-2xl z-40 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-blue-400" />
            <span className="font-semibold text-white text-sm">Simulation</span>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
          <div>
            <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">Choose Scenario</p>
            <div className="space-y-2">
              {(Object.keys(SCENARIO_META) as Scenario[]).map(s => (
                <button
                  key={s}
                  onClick={() => setScenario(s)}
                  className={clsx(
                    'w-full text-left p-3 rounded-xl border transition-colors',
                    scenario === s
                      ? 'border-blue-600 bg-blue-950/40'
                      : 'border-gray-800 bg-gray-900/50 hover:border-gray-600'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={clsx('text-sm font-medium', SCENARIO_META[s].color)}>
                      {SCENARIO_META[s].label}
                    </span>
                    {scenario === s && <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{SCENARIO_META[s].description}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Speed</p>
            <div className="flex gap-2">
              {SPEED_OPTIONS.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => setSpeedIdx(i)}
                  className={clsx(
                    'flex-1 py-1.5 text-sm rounded-lg border transition-colors',
                    speedIdx === i
                      ? 'border-blue-600 bg-blue-950/40 text-white'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gray-800">
          <button
            onClick={() => setPhase('running')}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Play size={14} />
            Start Simulation
          </button>
        </div>
      </div>
    )
  }

  // ── Running / Done screen ─────────────────────────────────────────────────
  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-gray-950 border-l border-gray-700 shadow-2xl z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-blue-400" />
          <span className="font-semibold text-white text-sm">Simulation</span>
          {day > 0 && (
            <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">Day {day}</span>
          )}
          <span className={clsx('text-xs px-2 py-0.5 rounded-full', SCENARIO_META[scenario].color, 'bg-gray-800')}>
            {SCENARIO_META[scenario].label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleReset} className="p-1.5 text-gray-500 hover:text-white transition-colors" title="Reset">
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
                {stats.completed_tasks}/{stats.total_tasks} tasks
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

          {/* Projected days */}
          {stats.projected_days_remaining > 0 && phase !== 'done' && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Clock size={10} />
              <span>~{stats.projected_days_remaining} day{stats.projected_days_remaining !== 1 ? 's' : ''} remaining at current pace</span>
            </div>
          )}

          {/* Key person dropped */}
          {stats.dropped_bot && (
            <div className="flex items-center gap-2 bg-red-950/40 border border-red-800/50 rounded-lg px-2.5 py-1.5">
              <AlertTriangle size={11} className="text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-300"><strong>{stats.dropped_bot}</strong> left the team — their tasks are now blocked</p>
            </div>
          )}

          {/* Drift meter */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400 flex items-center gap-1"><TrendingUp size={10} />Drift</span>
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

          {/* Drift alert / replan status */}
          {replanning && (
            <div className="flex items-center gap-2 bg-blue-950/50 border border-blue-700 rounded-lg p-2">
              <Zap size={13} className="text-blue-400 animate-pulse flex-shrink-0" />
              <p className="text-xs text-blue-300 font-medium">AI detected drift — replanning automatically...</p>
            </div>
          )}
          {replanApplied && replanSummary && (
            <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-700/50 rounded-lg p-2">
              <CheckCircle size={13} className="text-emerald-400 flex-shrink-0" />
              <p className="text-xs text-emerald-300">
                AI replan applied — {replanSummary.old} → {replanSummary.new} tasks
              </p>
            </div>
          )}
          {!replanning && !replanApplied && (severity === 'high' || severity === 'critical') && (
            <div className="flex items-start gap-2 bg-orange-950/50 border border-orange-800 rounded-lg p-2">
              <AlertCircle size={13} className="text-orange-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-orange-300">Significant drift — AI will replan automatically next step.</p>
            </div>
          )}
          {severity === 'medium' && !replanApplied && (
            <div className="flex items-start gap-2 bg-yellow-950/50 border border-yellow-800/60 rounded-lg p-2">
              <Clock size={13} className="text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-300">Medium drift forming — keep running to see adaptive replanning trigger.</p>
            </div>
          )}

          {/* Bottlenecks */}
          {bottlenecks.length > 0 && (
            <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-2 space-y-1">
              <p className="text-xs text-red-300 font-medium flex items-center gap-1">
                <AlertTriangle size={10} /> {bottlenecks.length} bottleneck{bottlenecks.length > 1 ? 's' : ''}
              </p>
              {bottlenecks.slice(0, 2).map(b => (
                <p key={b.task_id} className="text-[10px] text-red-400">
                  {b.is_on_critical_path && '🔴 '}<strong>{b.name}</strong> — blocking {b.successor_count} task{b.successor_count !== 1 ? 's' : ''}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scoreboard toggle */}
      {Object.keys(scoreboard).length > 0 && (
        <button
          onClick={() => setShowScore(s => !s)}
          className="flex items-center justify-between px-4 py-2 border-b border-gray-800 text-xs text-gray-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1.5"><Users size={11} />Team Scoreboard</span>
          {showScore ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      )}
      {showScore && (
        <div className="px-4 py-2 border-b border-gray-800 space-y-1.5">
          {Object.entries(scoreboard)
            .sort((a, b) => b[1].done - a[1].done)
            .map(([name, sc]) => (
              <div key={name} className="flex items-center justify-between text-xs">
                <span className="text-gray-300">{name}</span>
                <div className="flex items-center gap-3 text-gray-500">
                  <span>{sc.done} done</span>
                  <span className={sc.totalOver > 0 ? 'text-orange-400' : 'text-emerald-400'}>
                    {sc.totalOver > 0 ? '+' : ''}{sc.totalOver.toFixed(1)}h
                  </span>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Activity log */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {log.length === 0 && phase === 'running' && (
          <div className="text-center py-12">
            <Activity size={28} className="text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Press <strong className="text-gray-300">Auto Run</strong> or <strong className="text-gray-300">Step</strong> to begin</p>
            <p className="text-gray-600 text-xs mt-1">Each step = one compressed project day</p>
          </div>
        )}

        {/* Summary report */}
        {phase === 'done' && summary && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Trophy size={16} className="text-yellow-400" />
              <span className="font-semibold text-white text-sm">Simulation Complete</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-800 rounded-lg p-2.5">
                <p className="text-gray-500">Duration</p>
                <p className="text-white font-bold text-base">{summary.days} days</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-2.5">
                <p className="text-gray-500">Effort variance</p>
                <p className={clsx('font-bold text-base', summary.actualHours > summary.plannedHours ? 'text-orange-400' : 'text-emerald-400')}>
                  {summary.actualHours > summary.plannedHours ? '+' : ''}
                  {(summary.actualHours - summary.plannedHours).toFixed(0)}h
                </p>
              </div>
              <div className="bg-gray-800 rounded-lg p-2.5">
                <p className="text-gray-500">AI replan</p>
                <p className={clsx('font-bold', summary.replanApplied ? 'text-blue-400' : 'text-gray-500')}>
                  {summary.replanApplied ? 'Applied ✓' : 'Not needed'}
                </p>
              </div>
              {summary.topOffender && (
                <div className="bg-gray-800 rounded-lg p-2.5">
                  <p className="text-gray-500">Most overrun</p>
                  <p className="text-orange-400 font-bold text-xs truncate">{summary.topOffender}</p>
                </div>
              )}
            </div>
            <p className="text-[10px] text-gray-600">
              {summary.plannedHours.toFixed(0)}h planned · {summary.actualHours.toFixed(0)}h actual · {SCENARIO_META[scenario].label} scenario
            </p>
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
              {events.map((ev, i) => <EventRow key={i} event={ev} />)}
              {events.length === 0 && (
                <p className="text-xs text-gray-600 italic">No tasks ready — all dependencies pending.</p>
              )}
            </div>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      {/* Controls */}
      {phase === 'running' && (
        <div className="px-4 py-3 border-t border-gray-800 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={toggleAuto}
              className={clsx(
                'flex items-center gap-2 flex-1 justify-center px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                running ? 'bg-orange-700 hover:bg-orange-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
              )}
            >
              <Play size={13} className={running ? 'animate-pulse' : ''} />
              {running ? 'Pause' : 'Auto Run'}
            </button>
            <button
              onClick={runStep}
              disabled={stepping || running}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 rounded-lg transition-colors"
            >
              <SkipForward size={13} />
              Step
            </button>
          </div>
          {/* Speed selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Speed:</span>
            <div className="flex gap-1 flex-1">
              {SPEED_OPTIONS.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => changeSpeed(i)}
                  className={clsx(
                    'flex-1 py-1 text-xs rounded border transition-colors',
                    speedIdx === i ? 'border-blue-600 text-blue-400 bg-blue-950/30' : 'border-gray-700 text-gray-500 hover:border-gray-500'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="px-4 py-3 border-t border-gray-800">
          <button
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
          >
            <RotateCcw size={13} /> Run Again
          </button>
        </div>
      )}

      {error && <p className="px-4 pb-3 text-xs text-red-400">{error}</p>}
    </div>
  )
}

function EventRow({ event }: { event: SimEvent }) {
  const isCompleted = event.type === 'completed'
  const isBlocked   = event.type === 'blocked'
  const borderCls   = isCompleted ? 'border-emerald-900/50' : isBlocked ? 'border-red-900/50' : 'border-gray-800'
  const iconCls     = isCompleted ? 'text-emerald-400' : isBlocked ? 'text-red-400' : 'text-blue-400'

  return (
    <div className={clsx('border rounded-lg p-2.5 space-y-1 bg-gray-900/50', borderCls)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm flex-shrink-0">{event.emoji}</span>
          <span className="text-xs font-medium text-white truncate">{event.bot}</span>
          <span className={clsx('text-[10px] uppercase font-medium flex-shrink-0', iconCls)}>
            {isCompleted ? '✓ done' : isBlocked ? '⊘ blocked' : '▶ started'}
          </span>
          {event.is_on_critical_path && (
            <span className="text-[9px] bg-red-900/60 text-red-300 px-1 py-0.5 rounded font-medium flex-shrink-0">CP</span>
          )}
        </div>
        {isCompleted && event.over_under !== undefined && (
          <span className={clsx('text-[10px] font-medium flex-shrink-0 ml-1', event.over_under > 0 ? 'text-orange-400' : 'text-emerald-400')}>
            {event.over_under > 0 ? '+' : ''}{event.over_under}h
          </span>
        )}
      </div>

      <p className="text-[11px] text-gray-300 leading-snug truncate" title={event.task}>{event.task}</p>

      {isCompleted && event.estimated_hours != null && (
        <p className="text-[10px] text-gray-600">{event.estimated_hours}h est → {event.actual_hours}h actual</p>
      )}
      <p className="text-[10px] text-gray-500 leading-snug line-clamp-2">{event.note}</p>
    </div>
  )
}
