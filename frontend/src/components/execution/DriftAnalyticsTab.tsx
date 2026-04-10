import { useEffect, useState } from 'react'
import {
  BarChart, Bar, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import api from '../../services/api'

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
  const [loadingCharts, setLoadingCharts] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [velRes, accRes] = await Promise.all([
          api.get(`/api/v1/analytics/plans/${planId}/velocity`),
          api.get(`/api/v1/analytics/plans/${planId}/accuracy`),
        ])
        setVelocity(velRes.data.velocity)
        setAccuracy(
          accRes.data.tasks.map((t: any) => ({
            name: t.name.length > 18 ? t.name.slice(0, 16) + '…' : t.name,
            estimated_hours: t.estimated_hours,
            actual_hours: t.actual_hours,
          }))
        )
      } catch {
        // silently ignore — no completed tasks yet
      } finally {
        setLoadingCharts(false)
      }
    }
    load()
  }, [planId])

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

      {!loadingCharts && accuracy.length === 0 && velocity.length === 0 && (
        <div className="text-center py-10 text-gray-500 text-sm">
          Charts will appear once tasks are completed and actual hours are logged.
        </div>
      )}
    </div>
  )
}
