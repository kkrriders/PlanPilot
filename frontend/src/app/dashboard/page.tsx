'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePlanStore } from '@/store/planStore'
import { TrendingUp, Activity, CheckCircle, AlertTriangle, Plus } from 'lucide-react'
import api from '@/services/api'
import AuthGuard from '@/components/shared/AuthGuard'

function DashboardContent() {
  const { plans, fetchPlans } = usePlanStore()
  const [summary, setSummary] = useState<any>(null)

  useEffect(() => {
    fetchPlans()
    api.get('/api/v1/analytics/summary').then(r => setSummary(r.data)).catch(() => {})
  }, [])

  const recentPlans = [...plans].slice(0, 5)

  const stats = [
    { label: 'Total Plans', value: summary?.total_plans ?? plans.length, icon: Activity, color: 'text-blue-400' },
    { label: 'Active', value: summary?.active_plans ?? plans.filter(p => p.status === 'active').length, icon: TrendingUp, color: 'text-green-400' },
    { label: 'Completed', value: summary?.completed_plans ?? plans.filter(p => p.status === 'completed').length, icon: CheckCircle, color: 'text-emerald-400' },
    { label: 'Avg Risk', value: summary?.avg_risk_score ? `${(summary.avg_risk_score * 100).toFixed(0)}%` : '—', icon: AlertTriangle, color: 'text-yellow-400' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <Link
          href="/plans/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          New Plan
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <div className={`${color} mb-2`}><Icon size={20} /></div>
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-sm text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
        <h2 className="font-semibold text-white mb-4">Recent Plans</h2>
        {recentPlans.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 mb-3">No plans yet</p>
            <Link href="/plans/new" className="text-blue-400 hover:text-blue-300 text-sm">Create your first plan</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {recentPlans.map(plan => (
              <Link
                key={plan.id}
                href={`/plans/${plan.id}`}
                className="flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-750 rounded-lg transition-colors"
              >
                <div>
                  <p className="font-medium text-white text-sm">{plan.title}</p>
                  <p className="text-xs text-gray-400 truncate max-w-xs">{plan.goal}</p>
                </div>
                <div className="flex items-center gap-3">
                  {plan.risk_score != null && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      plan.risk_score > 0.7 ? 'bg-red-900 text-red-300' :
                      plan.risk_score > 0.4 ? 'bg-yellow-900 text-yellow-300' :
                      'bg-green-900 text-green-300'
                    }`}>
                      Risk {(plan.risk_score * 100).toFixed(0)}%
                    </span>
                  )}
                  <StatusBadge status={plan.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-gray-700 text-gray-300',
    generating: 'bg-blue-900 text-blue-300 animate-pulse',
    active: 'bg-green-900 text-green-300',
    paused: 'bg-yellow-900 text-yellow-300',
    completed: 'bg-emerald-900 text-emerald-300',
    failed: 'bg-red-900 text-red-300',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${colors[status] || colors.draft}`}>
      {status}
    </span>
  )
}

export default function DashboardPage() {
  return <AuthGuard><DashboardContent /></AuthGuard>
}
