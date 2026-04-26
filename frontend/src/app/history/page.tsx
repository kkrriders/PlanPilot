'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { planService, type ArchivedPlan } from '@/services/planService'
import AuthGuard from '@/components/shared/AuthGuard'
import {
  CheckCircle2, Clock, TrendingUp, BarChart3, GitBranch,
  RotateCcw, Target, Calendar,
} from 'lucide-react'

function HistoryContent() {
  const [plans, setPlans] = useState<ArchivedPlan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    planService.listArchived()
      .then(setPlans)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-44 bg-gray-900 rounded-xl border border-gray-800" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Project History</h1>
          <p className="text-gray-400 text-sm mt-1">Completed projects and their outcomes</p>
        </div>
        <span className="text-sm text-gray-500">{plans.length} completed project{plans.length !== 1 ? 's' : ''}</span>
      </div>

      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <CheckCircle2 size={40} className="text-gray-700" />
          <p className="text-gray-400 font-medium">No completed projects yet</p>
          <p className="text-sm text-gray-600">Mark a plan as complete from the plan detail page to archive it here.</p>
          <Link href="/plans" className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">
            View active plans
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map(plan => <PlanCard key={plan.id} plan={plan} />)}
        </div>
      )}
    </div>
  )
}

function PlanCard({ plan }: { plan: ArchivedPlan }) {
  const createdDate = new Date(plan.created_at)
  const completedDate = new Date(plan.completed_at)
  const daysElapsed = Math.round((completedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24))
  const hoursVariance = plan.actual_hours != null
    ? Math.round(((plan.actual_hours - plan.estimated_hours) / plan.estimated_hours) * 100)
    : null

  const riskColor = plan.risk_score == null ? 'text-gray-400'
    : plan.risk_score > 0.7 ? 'text-red-400'
    : plan.risk_score > 0.4 ? 'text-yellow-400'
    : 'text-green-400'

  return (
    <Link href={`/plans/${plan.id}`}>
      <div className="bg-gray-900 border border-gray-700 hover:border-gray-600 rounded-xl p-5 transition-colors cursor-pointer">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
              <h2 className="text-base font-semibold text-white truncate">{plan.title}</h2>
            </div>
            <p className="text-sm text-gray-400 line-clamp-2">{plan.goal}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 text-xs text-gray-500">
            <Calendar size={11} />
            <span>{completedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Metric
            icon={<Target size={13} className="text-blue-400" />}
            label="Completion"
            value={`${plan.completion_rate}%`}
            sub={`${plan.completed_tasks}/${plan.total_tasks} tasks`}
            valueColor={plan.completion_rate === 100 ? 'text-emerald-400' : 'text-blue-400'}
          />
          <Metric
            icon={<Clock size={13} className="text-purple-400" />}
            label="Duration"
            value={`${daysElapsed}d`}
            sub="start to finish"
          />
          <Metric
            icon={<BarChart3 size={13} className="text-yellow-400" />}
            label="Est. Hours"
            value={`${plan.estimated_hours}h`}
            sub={plan.actual_hours != null ? `${plan.actual_hours}h actual` : 'no actuals'}
          />
          {hoursVariance != null && (
            <Metric
              icon={<TrendingUp size={13} className={hoursVariance > 0 ? 'text-orange-400' : 'text-emerald-400'} />}
              label="Hours Variance"
              value={`${hoursVariance > 0 ? '+' : ''}${hoursVariance}%`}
              sub={hoursVariance > 0 ? 'over estimate' : hoursVariance < 0 ? 'under estimate' : 'on target'}
              valueColor={Math.abs(hoursVariance) > 20 ? 'text-orange-400' : 'text-emerald-400'}
            />
          )}
          <Metric
            icon={<GitBranch size={13} className="text-gray-400" />}
            label="Versions"
            value={String(plan.versions)}
            sub={plan.versions > 1 ? 'replanned' : 'no replanning'}
          />
          <Metric
            icon={<RotateCcw size={13} className="text-blue-400" />}
            label="Drift Events"
            value={String(plan.drift_events)}
            sub={plan.drift_events > 0 ? 'detected' : 'clean run'}
          />
        </div>

        {/* Risk / confidence footer */}
        {(plan.risk_score != null || plan.confidence != null) && (
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-800 text-xs text-gray-500">
            {plan.risk_score != null && (
              <span>Final risk: <span className={`font-semibold ${riskColor}`}>{(plan.risk_score * 100).toFixed(0)}%</span></span>
            )}
            {plan.confidence != null && (
              <span>Confidence: <span className="font-semibold text-blue-400">{(plan.confidence * 100).toFixed(0)}%</span></span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}

function Metric({ icon, label, value, sub, valueColor = 'text-white' }: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  valueColor?: string
}) {
  return (
    <div className="bg-gray-800/60 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <p className="text-[11px] text-gray-500 truncate">{label}</p>
      </div>
      <p className={`text-base font-bold ${valueColor}`}>{value}</p>
      <p className="text-[11px] text-gray-600 truncate">{sub}</p>
    </div>
  )
}

export default function HistoryPage() {
  return <AuthGuard><HistoryContent /></AuthGuard>
}
