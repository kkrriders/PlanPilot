'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { usePlanStore } from '@/store/planStore'
import { useExecutionStore } from '@/store/executionStore'
import KanbanBoard from '@/components/planning/KanbanBoard'
import TeamTab from '@/components/planning/TeamTab'
import ExecutionTimeline from '@/components/execution/ExecutionTimeline'
import DriftAlertBanner from '@/components/execution/DriftAlertBanner'
import ReplanningModal from '@/components/execution/ReplanningModal'
import DriftAnalyticsTab from '@/components/execution/DriftAnalyticsTab'
import { executionService } from '@/services/executionService'
import { Activity, LayoutDashboard, BarChart3, RefreshCw, Users } from 'lucide-react'
import AuthGuard from '@/components/shared/AuthGuard'

type Tab = 'board' | 'timeline' | 'drift' | 'team'

function PlanDetailContent() {
  const params = useParams<{ planId: string }>()
  const planId = params.planId
  const { currentPlan, currentDag, fetchPlan, fetchDag, pollPlanStatus } = usePlanStore()
  const { timeline, driftMetric, replanPreview, fetchTimeline, fetchDrift, fetchReplanPreview, clearReplanPreview } = useExecutionStore()
  const [tab, setTab] = useState<Tab>('board')
  const [applyingReplan, setApplyingReplan] = useState(false)

  useEffect(() => {
    if (!planId) return
    fetchPlan(planId)
    fetchDag(planId)
    fetchTimeline(planId)
    fetchDrift(planId)

    const plan = currentPlan
    if (plan?.status === 'generating') {
      pollPlanStatus(planId, () => {
        fetchDag(planId)
        fetchTimeline(planId)
      })
    }
  }, [planId])

  useEffect(() => {
    if (currentPlan?.status === 'generating' && planId) {
      const interval = setInterval(() => {
        fetchPlan(planId)
        fetchDag(planId)
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [currentPlan?.status, planId])

  if (!currentPlan) return <PlanDetailSkeleton />

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

      {isGenerating && (
        <div className="bg-blue-900/30 border border-blue-700 rounded-xl p-4 flex items-center gap-3">
          <RefreshCw size={16} className="text-blue-400 animate-spin" />
          <p className="text-blue-300 text-sm">AI is generating your plan — analyzing goal, building task DAG, running CPM...</p>
        </div>
      )}

      {driftMetric && driftMetric.severity !== 'none' && (
        <DriftAlertBanner
          metric={driftMetric}
          onReplan={() => planId && fetchReplanPreview(planId)}
        />
      )}

      <div className="flex gap-1 bg-gray-900 border border-gray-700 rounded-lg p-1 w-fit">
        {([
          { id: 'board', label: 'Board', icon: LayoutDashboard },
          { id: 'timeline', label: 'Timeline', icon: Activity },
          { id: 'team', label: 'Team', icon: Users },
          { id: 'drift', label: 'Analytics', icon: BarChart3 },
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

      {tab === 'board' && currentDag && !isGenerating && (
        <KanbanBoard
          dag={currentDag}
          planId={planId!}
          onTaskUpdated={() => {
            fetchTimeline(planId!)
            fetchDrift(planId!)
          }}
        />
      )}

      {tab === 'board' && isGenerating && (
        <div className="grid grid-cols-4 gap-4 animate-pulse">
          {[1,2,3,4].map(i => (
            <div key={i} className="space-y-3">
              <div className="h-6 bg-gray-800 rounded" />
              {[1,2].map(j => <div key={j} className="h-28 bg-gray-900 border border-gray-800 rounded-xl" />)}
            </div>
          ))}
        </div>
      )}

      {tab === 'timeline' && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <ExecutionTimeline timeline={timeline} />
        </div>
      )}

      {tab === 'team' && (
        <TeamTab planId={planId!} dag={currentDag} />
      )}

      {tab === 'drift' && (
        <DriftAnalyticsTab planId={planId!} driftMetric={driftMetric} />
      )}

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

function PlanDetailSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-7 w-64 bg-gray-800 rounded" />
          <div className="h-4 w-96 bg-gray-800 rounded" />
        </div>
        <div className="h-6 w-20 bg-gray-800 rounded-full" />
      </div>
      <div className="h-10 w-72 bg-gray-800 rounded-lg" />
      <div className="h-96 bg-gray-900 border border-gray-700 rounded-xl" />
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

export default function PlanDetailPage() {
  return <AuthGuard><PlanDetailContent /></AuthGuard>
}
