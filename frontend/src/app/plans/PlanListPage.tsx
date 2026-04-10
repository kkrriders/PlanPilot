import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePlanStore } from '../../store/planStore'
import { Plus, ChevronRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function PlanListPage() {
  const { plans, fetchPlans, loading } = usePlanStore()

  useEffect(() => { fetchPlans() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Plans</h1>
        <Link
          to="/plans/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          New Plan
        </Link>
      </div>

      {loading && (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center justify-between p-4 bg-gray-900 border border-gray-700 rounded-xl">
              <div className="space-y-2 flex-1">
                <div className="h-4 w-48 bg-gray-800 rounded" />
                <div className="h-3 w-72 bg-gray-800 rounded" />
              </div>
              <div className="h-5 w-16 bg-gray-800 rounded-full ml-4" />
            </div>
          ))}
        </div>
      )}

      {!loading && plans.length === 0 && (
        <div className="text-center py-16 bg-gray-900 border border-gray-700 rounded-xl">
          <p className="text-gray-400 mb-3">No plans yet</p>
          <Link to="/plans/new" className="text-blue-400 hover:text-blue-300 text-sm">
            Create your first plan
          </Link>
        </div>
      )}

      <div className="space-y-2">
        {plans.map(plan => (
          <Link
            key={plan.id}
            to={`/plans/${plan.id}`}
            className="flex items-center justify-between p-4 bg-gray-900 border border-gray-700 hover:border-gray-500 rounded-xl transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-white">{plan.title}</p>
              <p className="text-sm text-gray-400 truncate">{plan.goal}</p>
              <p className="text-xs text-gray-500 mt-1">
                v{plan.current_version} · {formatDistanceToNow(new Date(plan.created_at), { addSuffix: true })}
              </p>
            </div>
            <div className="flex items-center gap-3 ml-4 shrink-0">
              {plan.risk_score != null && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">Risk</p>
                  <p className={`text-sm font-medium ${plan.risk_score > 0.7 ? 'text-red-400' : plan.risk_score > 0.4 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {(plan.risk_score * 100).toFixed(0)}%
                  </p>
                </div>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                plan.status === 'active' ? 'bg-green-900 text-green-300' :
                plan.status === 'generating' ? 'bg-blue-900 text-blue-300' :
                plan.status === 'completed' ? 'bg-emerald-900 text-emerald-300' :
                'bg-gray-700 text-gray-300'
              }`}>
                {plan.status}
              </span>
              <ChevronRight size={16} className="text-gray-500" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
