'use client'
import { useEffect, useState } from 'react'
import {
  BarChart, Bar, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import api from '../../services/api'
import { executionService } from '../../services/executionService'
import { planService } from '../../services/planService'
import type { DriftEvent } from '../../types/execution'
import type { DebateEntry } from '../../services/planService'
import { Brain, TrendingUp, TrendingDown, Minus, Clock, RotateCcw, CheckCircle, Swords, ChevronDown, ChevronRight, ShieldAlert, MessageSquare, ThumbsUp } from 'lucide-react'

interface AdaptiveWeight {
  key: string
  value: number
  confidence: number
  sample_count: number
  active: boolean
}

interface DriftMetric {
  schedule_drift_pct?: number
  effort_drift_pct?: number
  scope_drift_pct?: number
  overall_drift?: number
  severity: string
}

interface Props {
  planId: string
  driftMetric: DriftMetric | null
}

export default function DriftAnalyticsTab({ planId, driftMetric }: Props) {
  const [velocity, setVelocity] = useState<{ date: string; tasks_completed: number }[]>([])
  const [accuracy, setAccuracy] = useState<{ name: string; estimated_hours: number; actual_hours: number }[]>([])
  const [weights, setWeights] = useState<AdaptiveWeight[]>([])
  const [driftEvents, setDriftEvents] = useState<DriftEvent[]>([])
  const [debateLog, setDebateLog] = useState<DebateEntry[]>([])
  const [planMode, setPlanMode] = useState('')
  const [expandedIteration, setExpandedIteration] = useState<number | null>(null)
  const [loadingCharts, setLoadingCharts] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [velRes, accRes, wRes] = await Promise.all([
          api.get(`/api/v1/analytics/plans/${planId}/velocity`),
          api.get(`/api/v1/analytics/plans/${planId}/accuracy`),
          api.get('/api/v1/analytics/weights'),
        ])
        setVelocity(velRes.data.velocity)
        setAccuracy(
          accRes.data.tasks.map((t: any) => ({
            name: t.name.length > 18 ? t.name.slice(0, 16) + '…' : t.name,
            estimated_hours: t.estimated_hours,
            actual_hours: t.actual_hours,
          }))
        )
        setWeights(wRes.data.weights)
      } catch {
        // silently ignore — no completed tasks yet
      } finally {
        setLoadingCharts(false)
      }
    }
    load()
    executionService.getDriftEvents(planId).then(setDriftEvents).catch(() => {})
    planService.getReasoning(planId)
      .then(r => { setDebateLog(r.debate_log ?? []); setPlanMode(r.mode ?? '') })
      .catch(() => {})
  }, [planId])

  const activeWeights = weights.filter(w => w.active && w.key !== 'effort_estimation_bias')

  const driftBars = driftMetric
    ? [
        { name: 'Schedule', value: driftMetric.schedule_drift_pct ?? 0 },
        { name: 'Effort', value: driftMetric.effort_drift_pct ?? 0 },
        { name: 'Scope', value: driftMetric.scope_drift_pct ?? 0 },
        { name: 'Overall', value: driftMetric.overall_drift ?? 0 },
      ]
    : []

  const driftColor = (val: number) => {
    if (val > 30) return '#f87171'
    if (val > 15) return '#fbbf24'
    return '#34d399'
  }

  return (
    <div className="space-y-6">
      {/* Drift summary cards */}
      {driftMetric && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Schedule Drift', value: driftMetric.schedule_drift_pct },
            { label: 'Effort Drift', value: driftMetric.effort_drift_pct },
            { label: 'Scope Drift', value: driftMetric.scope_drift_pct },
            { label: 'Overall Drift', value: driftMetric.overall_drift },
          ].map(({ label, value }) => {
            const pct = value ?? 0
            const color = pct > 30 ? 'text-red-400' : pct > 15 ? 'text-yellow-400' : 'text-green-400'
            return (
              <div key={label} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                <p className="text-xs text-gray-400">{label}</p>
                <p className={`text-2xl font-bold mt-1 ${color}`}>{pct.toFixed(1)}%</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Drift bar chart */}
      {driftBars.length > 0 && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Drift Breakdown</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={driftBars} barSize={40}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} unit="%" domain={[0, 'auto']} />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#f3f4f6' }}
                formatter={(val: number) => [`${val.toFixed(1)}%`]}
              />
              <ReferenceLine y={15} stroke="#fbbf24" strokeDasharray="4 4" label={{ value: 'Warn', fill: '#fbbf24', fontSize: 11 }} />
              <ReferenceLine y={30} stroke="#f87171" strokeDasharray="4 4" label={{ value: 'High', fill: '#f87171', fontSize: 11 }} />
              <Bar dataKey="value" name="Drift %" radius={[4, 4, 0, 0]} fill="#60a5fa">
                {driftBars.map((entry, index) => (
                  <Cell key={index} fill={driftColor(entry.value)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loadingCharts && accuracy.length > 0 && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Estimated vs Actual Hours</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={accuracy} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} unit="h" />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#f3f4f6' }}
                formatter={(val: number) => [`${val}h`]}
              />
              <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
              <Bar dataKey="estimated_hours" name="Estimated" fill="#60a5fa" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual_hours" name="Actual" fill="#34d399" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loadingCharts && velocity.length > 0 && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Daily Velocity (Tasks Completed)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={velocity}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#f3f4f6' }}
              />
              <Line
                type="monotone"
                dataKey="tasks_completed"
                name="Tasks"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={{ fill: '#a78bfa', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Adaptive learning insights */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Brain size={15} className="text-purple-400" />
          <h3 className="text-sm font-semibold text-white">AI Learnings</h3>
          <span className="text-xs text-gray-500">— what the model has learned about your estimation patterns</span>
        </div>

        {activeWeights.length === 0 ? (
          <p className="text-sm text-gray-500">
            No patterns detected yet. Complete tasks with actual hours logged across at least 3 plans to activate adaptive adjustments.
          </p>
        ) : (
          <div className="space-y-2">
            {activeWeights.map(w => {
              const category = w.key.replace('category_bias_', '')
              const bias = (w.value - 1.0) * 100
              const over = bias > 0
              const Icon = Math.abs(bias) < 5 ? Minus : over ? TrendingUp : TrendingDown
              const color = Math.abs(bias) < 5 ? 'text-gray-400' : over ? 'text-amber-400' : 'text-emerald-400'
              const confidence = Math.round(w.confidence * 100)
              const isIndustry = w.sample_count === 0
              return (
                <div key={w.key} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Icon size={13} className={color} />
                    <span className="text-sm text-white capitalize">{category}</span>
                    <span className="text-xs text-gray-500">tasks</span>
                    {isIndustry && (
                      <span className="text-[10px] bg-blue-900/40 border border-blue-700/40 text-blue-300 px-1.5 py-0.5 rounded">
                        industry avg
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className={`font-medium ${color}`}>
                      {over ? '+' : ''}{bias.toFixed(0)}% vs estimate
                    </span>
                    {!isIndustry && (
                      <span className="text-gray-600">{w.sample_count} samples · {confidence}% confidence</span>
                    )}
                  </div>
                </div>
              )
            })}
            <p className="text-[11px] text-gray-600 pt-1">
              These patterns are automatically applied to new plan estimates when generating.
            </p>
          </div>
        )}
      </div>

      {/* Planning debate log */}
      {debateLog.length > 0 && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Swords size={15} className="text-purple-400" />
            <h3 className="text-sm font-semibold text-white">Planning Debate</h3>
            {planMode && (
              <span className="text-[10px] bg-purple-900/40 border border-purple-700/40 text-purple-300 px-2 py-0.5 rounded capitalize ml-1">
                {planMode} mode · {debateLog.length} iteration{debateLog.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="space-y-2">
            {debateLog.map(entry => {
              const isOpen = expandedIteration === entry.iteration
              const accepted = entry.verdict === 'accept'
              return (
                <div key={entry.iteration} className="border border-gray-700/60 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedIteration(isOpen ? null : entry.iteration)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-800/60 transition-colors"
                  >
                    <span className={`text-xs font-semibold flex-shrink-0 ${accepted ? 'text-green-400' : 'text-yellow-400'}`}>
                      Pass {entry.iteration}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${accepted ? 'bg-green-900/40 border-green-700/40 text-green-300' : 'bg-yellow-900/30 border-yellow-700/40 text-yellow-300'}`}>
                      {accepted ? 'accepted' : 'revise'}
                    </span>
                    <div className="flex items-center gap-3 ml-2 text-xs text-gray-500">
                      <span>Risk {(entry.risk_score * 100).toFixed(0)}%</span>
                      <span>Critic {entry.critic_score}/10</span>
                    </div>
                    <div className="ml-auto">
                      {isOpen ? <ChevronDown size={13} className="text-gray-500" /> : <ChevronRight size={13} className="text-gray-500" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-700/60 pt-3">
                      {entry.planner_reasoning && (
                        <div>
                          <p className="text-[11px] font-medium text-gray-400 mb-1">Planner reasoning</p>
                          <p className="text-xs text-gray-300">{entry.planner_reasoning}</p>
                        </div>
                      )}
                      {entry.risk_challenges.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <ShieldAlert size={11} className="text-red-400" />
                            <p className="text-[11px] font-medium text-red-300">Risk agent challenges</p>
                          </div>
                          <ul className="space-y-1">
                            {entry.risk_challenges.map((c, i) => (
                              <li key={i} className="text-xs text-gray-400 flex gap-2">
                                <span className="text-red-500 flex-shrink-0">·</span>{c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {entry.critic_issues.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <MessageSquare size={11} className="text-yellow-400" />
                            <p className="text-[11px] font-medium text-yellow-300">Critic issues</p>
                          </div>
                          <ul className="space-y-1">
                            {entry.critic_issues.map((c: any, i) => (
                              <li key={i} className="text-xs text-gray-400 flex gap-2">
                                <span className="text-yellow-500 flex-shrink-0">·</span>
                                <span>
                                  {c.task && <span className="text-gray-300">{c.task}: </span>}
                                  {c.description ?? String(c)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {entry.critic_strengths.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <ThumbsUp size={11} className="text-green-400" />
                            <p className="text-[11px] font-medium text-green-300">Strengths noted</p>
                          </div>
                          <ul className="space-y-1">
                            {entry.critic_strengths.map((s, i) => (
                              <li key={i} className="text-xs text-gray-400 flex gap-2">
                                <span className="text-green-500 flex-shrink-0">·</span>{s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Drift event log */}
      {driftEvents.length > 0 && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={15} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-white">Drift Event Log</h3>
            <span className="text-xs text-gray-500 ml-1">— {driftEvents.length} event{driftEvents.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-2">
            {driftEvents.map(ev => (
              <div key={ev.id} className="flex items-start gap-3 py-2 border-b border-gray-800 last:border-0">
                <div className="flex-shrink-0 mt-0.5">
                  {ev.was_replanned
                    ? <RotateCcw size={13} className="text-blue-400" />
                    : <CheckCircle size={13} className="text-gray-600" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-white capitalize">{ev.trigger_type.replace(/_/g, ' ')}</span>
                    {ev.was_replanned && (
                      <span className="text-[10px] bg-blue-900/50 border border-blue-700/40 text-blue-300 px-1.5 py-0.5 rounded">replanned</span>
                    )}
                  </div>
                  {ev.description && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{ev.description}</p>
                  )}
                </div>
                <p className="text-[11px] text-gray-600 flex-shrink-0 ml-2">
                  {new Date(ev.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loadingCharts && accuracy.length === 0 && velocity.length === 0 && (
        <div className="text-center py-6 text-gray-500 text-sm">
          Charts will appear once tasks are completed and actual hours are logged.
        </div>
      )}
    </div>
  )
}
