import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePlanStore } from '../../store/planStore'
import { useExecutionStore } from '../../store/executionStore'
import DagVisualization from '../../components/planning/DagVisualization'
import ExecutionTimeline from '../../components/execution/ExecutionTimeline'
import DriftAlertBanner from '../../components/execution/DriftAlertBanner'
import ReplanningModal from '../../components/execution/ReplanningModal'
import { executionService } from '../../services/executionService'
import { Activity, GitBranch, BarChart3, RefreshCw } from 'lucide-react'

type Tab = 'dag' | 'timeline' | 'drift'

export default function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>()
  const { currentPlan, currentDag, fetchPlan, fetchDag, pollPlanStatus } = usePlanStore()
  const { timeline, driftMetric, replanPreview, fetchTimeline, fetchDrift, fetchReplanPreview, clearReplanPreview } = useExecutionStore()
  const [tab, setTab] = useState<Tab>('dag')
  const [applyingReplan, setApplyingReplan] = useState(false)

  useEffect(() => {
    if (!planId) return
    fetchPlan(planId)
    fetchDag(planId)
    fetchTimeline(planId)
    fetchDrift(planId)

    // If still generating, poll
    const plan = currentPlan
    if (plan?.status === 'generating') {
      pollPlanStatus(planId, () => {
        fetchDag(planId)
        fetchTimeline(planId)
      })
    }
  }, [planId])

  // Auto-refresh when generating
  useEffect(() => {
    if (currentPlan?.status === 'generating' && planId) {
      const interval = setInterval(() => {
        fetchPlan(planId)
        fetchDag(planId)
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [currentPlan?.status, planId])

  if (!currentPlan) return <div className="text-gray-400">Loading...</div>

  const isGenerating = currentPlan.status === 'generating'

  const handleApplyReplan = async () => {
    if (!planId) return
    setApplyingReplan(true)
    try {
      await executionService.applyReplan(planId)
      clearReplanPreview()
      await fetchPlan(planId)
      await fetchDag(planId)
      await fetchTimeline(planId)
    } finally {
      setApplyingReplan(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{currentPlan.title}</h1>
          <p className="text-gray-400 text-sm mt-1 max-w-2xl">{currentPlan.goal}</p>
        </div>
        <div className="flex items-center gap-3">
          {currentPlan.risk_score != null && (
            <div className="text-right">
              <p className="text-xs text-gray-400">Risk</p>
              <p className={`font-bold ${currentPlan.risk_score > 0.7 ? 'text-red-400' : currentPlan.risk_score > 0.4 ? 'text-yellow-400' : 'text-green-400'}`}>
                {(currentPlan.risk_score * 100).toFixed(0)}%
              </p>
            </div>
          )}
          {currentPlan.confidence != null && (
            <div className="text-right">
              <p className="text-xs text-gray-400">Confidence</p>
              <p className="font-bold text-blue-400">{(currentPlan.confidence * 100).toFixed(0)}%</p>
            </div>
          )}
          <StatusChip status={currentPlan.status} />
        </div>
      </div>

      {/* Generating state */}
      {isGenerating && (
        <div className="bg-blue-900/30 border border-blue-700 rounded-xl p-4 flex items-center gap-3">
          <RefreshCw size={16} className="text-blue-400 animate-spin" />
          <p className="text-blue-300 text-sm">AI is generating your plan — analyzing goal, building task DAG, running CPM...</p>
        </div>
      )}

      {/* Drift alert */}
      {driftMetric && driftMetric.severity !== 'none' && (
        <DriftAlertBanner
          metric={driftMetric}
          onReplan={() => planId && fetchReplanPreview(planId)}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-700 rounded-lg p-1 w-fit">
        {([
          { id: 'dag', label: 'Dependency Graph', icon: GitBranch },
          { id: 'timeline', label: 'Execution Timeline', icon: Activity },
          { id: 'drift', label: 'Drift & Analytics', icon: BarChart3 },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${
              tab === id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'dag' && currentDag && !isGenerating && (
        <DagVisualization
          dag={currentDag}
          planId={planId!}
          onTaskUpdated={() => {
            fetchTimeline(planId!)
            fetchDrift(planId!)
          }}
        />
      )}

      {tab === 'timeline' && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <ExecutionTimeline timeline={timeline} />
        </div>
      )}

      {tab === 'drift' && driftMetric && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Schedule Drift', value: `${driftMetric.schedule_drift_pct?.toFixed(1)}%` },
            { label: 'Effort Drift', value: `${driftMetric.effort_drift_pct?.toFixed(1)}%` },
            { label: 'Scope Drift', value: `${driftMetric.scope_drift_pct?.toFixed(1)}%` },
            { label: 'Overall Drift', value: `${driftMetric.overall_drift?.toFixed(1)}%` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-2xl font-bold text-white mt-1">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Replan modal */}
      {replanPreview && (
        <ReplanningModal
          preview={replanPreview}
          onConfirm={handleApplyReplan}
          onCancel={clearReplanPreview}
          loading={applyingReplan}
        />
      )}
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-gray-700 text-gray-300',
    generating: 'bg-blue-900 text-blue-300',
    active: 'bg-green-900 text-green-300',
    paused: 'bg-yellow-900 text-yellow-300',
    completed: 'bg-emerald-900 text-emerald-300',
    failed: 'bg-red-900 text-red-300',
  }
  return (
    <span className={`text-xs px-3 py-1 rounded-full capitalize font-medium ${colors[status] || colors.draft}`}>
      {status}
    </span>
  )
}
