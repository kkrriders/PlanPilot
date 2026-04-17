'use client'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useParams } from 'next/navigation'
import { usePlanStore } from '@/store/planStore'
import { useExecutionStore } from '@/store/executionStore'
import KanbanBoard from '@/components/planning/KanbanBoard'
import DagVisualization from '@/components/planning/DagVisualization'
import TeamTab from '@/components/planning/TeamTab'
import RegenerateModal from '@/components/planning/RegenerateModal'
import SimulationPanel from '@/components/simulation/SimulationPanel'
import ExecutionTimeline from '@/components/execution/ExecutionTimeline'
import DriftAlertBanner from '@/components/execution/DriftAlertBanner'
import ReplanningModal from '@/components/execution/ReplanningModal'
import DriftAnalyticsTab from '@/components/execution/DriftAnalyticsTab'
import { executionService } from '@/services/executionService'
import { planService, type VersionHistory } from '@/services/planService'
import { Activity, LayoutDashboard, BarChart3, RefreshCw, Users, RotateCcw, AlertCircle, Settings, Bot, History, GitFork, ChevronDown, ChevronRight, TriangleAlert, Download } from 'lucide-react'
import AuthGuard from '@/components/shared/AuthGuard'
import { useToastStore } from '@/store/toastStore'

type Tab = 'board' | 'dag' | 'timeline' | 'drift' | 'team' | 'history'

interface BottleneckItem {
  task_id: string
  name: string
  status: string
  successor_count: number
  is_delayed: boolean
  is_on_critical_path: boolean
}

function PlanDetailContent() {
  const params = useParams<{ planId: string }>()
  const planId = params.planId
  const { currentPlan, currentDag, fetchPlan, fetchDag, pollPlanStatus } = usePlanStore()
  const { timeline, driftMetric, replanPreview, fetchTimeline, fetchDrift, fetchReplanPreview, clearReplanPreview } = useExecutionStore()
  const [tab, setTab] = useState<Tab>('board')
  const [applyingReplan, setApplyingReplan] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [showRegenerate, setShowRegenerate] = useState(false)
  const [showSimulation, setShowSimulation] = useState(false)
  const [history, setHistory] = useState<VersionHistory[]>([])
  const [bottlenecks, setBottlenecks] = useState<BottleneckItem[]>([])
  const [showBottlenecks, setShowBottlenecks] = useState(true)
  const { toast } = useToastStore()

  const handleExportCsv = () => {
    if (!currentDag || !currentPlan) return
    const headers = ['Task', 'Category', 'Status', 'Est. Hours', 'Priority', 'Assigned To', 'Critical Path']
    const rows = currentDag.nodes.map(n => [
      n.data.label,
      n.data.category ?? '',
      n.data.status,
      n.data.estimated_hours ?? '',
      n.data.priority,
      n.data.assigned_to ?? '',
      n.data.is_on_critical_path ? 'Yes' : 'No',
    ])
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentPlan.title.replace(/[^a-z0-9]/gi, '_')}_tasks.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast('Tasks exported as CSV', 'success')
  }

  const handleRetryGenerate = async () => {
    if (!planId) return
    setRetrying(true)
    try {
      await planService.generate(planId)
      await fetchPlan(planId)
      pollPlanStatus(planId, () => {
        fetchDag(planId)
        fetchTimeline(planId)
      })
    } finally {
      setRetrying(false)
    }
  }

  useEffect(() => {
    if (!planId) return
    fetchPlan(planId)
    fetchDag(planId)
    fetchTimeline(planId)
    fetchDrift(planId)
    planService.getHistory(planId).then(setHistory).catch(() => {})
    executionService.getBottlenecks(planId).then(setBottlenecks).catch(() => {})
  }, [planId])

  // Single polling mechanism — returns cleanup to stop on unmount or status change
  useEffect(() => {
    if (currentPlan?.status === 'generating' && planId) {
      return pollPlanStatus(planId, () => {
        fetchDag(planId)
        fetchTimeline(planId)
      })
    }
  }, [currentPlan?.status, planId])

  if (!currentPlan) return <PlanDetailSkeleton />

  const isGenerating = currentPlan.status === 'generating'

  // Progress metrics derived from DAG
  const totalTasks = currentDag?.nodes.length ?? 0
  const completedTasks = currentDag?.nodes.filter(n => n.data.status === 'completed').length ?? 0
  const inProgressTasks = currentDag?.nodes.filter(n => n.data.status === 'in_progress').length ?? 0
  const blockedTasks = currentDag?.nodes.filter(n => n.data.status === 'blocked').length ?? 0
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  const totalHours = currentDag?.nodes.reduce((s, n) => s + (n.data.estimated_hours ?? 0), 0) ?? 0
  const completedHours = currentDag?.nodes
    .filter(n => n.data.status === 'completed')
    .reduce((s, n) => s + (n.data.estimated_hours ?? 0), 0) ?? 0

  const handleApplyReplan = async () => {
    if (!planId) return
    setApplyingReplan(true)
    try {
      await executionService.applyReplan(planId)
      clearReplanPreview()
      await fetchPlan(planId)
      await fetchDag(planId)
      await fetchTimeline(planId)
      toast('Replan applied — tasks have been updated', 'success')
    } catch {
      toast('Failed to apply replan', 'error')
    } finally {
      setApplyingReplan(false)
    }
  }

  return (
    <div className={clsx('space-y-4 transition-all duration-300', showSimulation && 'pr-[25rem]')}>
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
          {!isGenerating && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSimulation(s => !s)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors',
                  showSimulation
                    ? 'bg-blue-700 border-blue-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 border-gray-600 text-gray-300 hover:text-white'
                )}
              >
                <Bot size={12} />
                Simulate
              </button>
              {currentDag && (
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors"
                >
                  <Download size={12} />
                  Export CSV
                </button>
              )}
              <button
                onClick={() => setShowRegenerate(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors"
              >
                <Settings size={12} />
                Edit & Regenerate
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar — only when plan has tasks */}
      {totalTasks > 0 && !isGenerating && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-white font-medium">{completedTasks}/{totalTasks} tasks</span>
              {inProgressTasks > 0 && <span className="text-blue-400">{inProgressTasks} in progress</span>}
              {blockedTasks > 0 && <span className="text-red-400">{blockedTasks} blocked</span>}
              {totalHours > 0 && (
                <span className="text-gray-400">{completedHours.toFixed(0)}h / {totalHours.toFixed(0)}h</span>
              )}
            </div>
            <span className="text-sm font-bold text-white">{progressPct}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-500 bg-gradient-to-r from-blue-600 to-emerald-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {isGenerating && (
        <div className="bg-blue-900/30 border border-blue-700 rounded-xl p-4 flex items-center gap-3">
          <RefreshCw size={16} className="text-blue-400 animate-spin" />
          <p className="text-blue-300 text-sm">AI is generating your plan — analyzing goal, building task DAG, running CPM...</p>
        </div>
      )}

      {currentPlan.status === 'failed' && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
            <p className="text-red-300 text-sm">Plan generation failed. This is usually a temporary LLM timeout — retrying often succeeds.</p>
          </div>
          <button
            onClick={handleRetryGenerate}
            disabled={retrying}
            className="flex items-center gap-2 px-3 py-1.5 text-xs bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg transition-colors flex-shrink-0"
          >
            <RotateCcw size={12} className={retrying ? 'animate-spin' : ''} />
            {retrying ? 'Retrying...' : 'Retry'}
          </button>
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
          { id: 'dag', label: 'DAG', icon: GitFork },
          { id: 'timeline', label: 'Timeline', icon: Activity },
          { id: 'team', label: 'Team', icon: Users },
          { id: 'drift', label: 'Analytics', icon: BarChart3 },
          ...(history.length > 0 ? [{ id: 'history' as const, label: 'History', icon: History }] : []),
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

      {/* Bottleneck alert strip — shown on board tab when there are blockers */}
      {tab === 'board' && bottlenecks.length > 0 && (
        <div className="bg-yellow-950/40 border border-yellow-700/50 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowBottlenecks(s => !s)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-yellow-900/20 transition-colors"
          >
            <TriangleAlert size={14} className="text-yellow-400 flex-shrink-0" />
            <span className="text-yellow-300 text-xs font-medium">
              {bottlenecks.length} bottleneck{bottlenecks.length !== 1 ? 's' : ''} detected
            </span>
            <span className="text-yellow-600 text-xs ml-1">— blocking downstream tasks</span>
            {showBottlenecks ? (
              <ChevronDown size={12} className="ml-auto text-yellow-600" />
            ) : (
              <ChevronRight size={12} className="ml-auto text-yellow-600" />
            )}
          </button>
          {showBottlenecks && (
            <div className="px-4 pb-3 space-y-1.5">
              {bottlenecks.map(b => (
                <div key={b.task_id} className="flex items-center gap-2 text-xs">
                  {b.is_on_critical_path && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" title="Critical path" />
                  )}
                  <span className="text-yellow-200">{b.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] capitalize flex-shrink-0 ${
                    b.status === 'blocked' ? 'bg-red-900 text-red-300' : 'bg-gray-800 text-gray-400'
                  }`}>{b.status}</span>
                  {b.successor_count > 0 && (
                    <span className="text-yellow-600 flex-shrink-0">blocks {b.successor_count} task{b.successor_count !== 1 ? 's' : ''}</span>
                  )}
                  {b.is_delayed && (
                    <span className="text-orange-400 flex-shrink-0">overdue</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'board' && currentDag && !isGenerating && (
        <KanbanBoard
          dag={currentDag}
          planId={planId!}
          onTaskUpdated={() => {
            fetchTimeline(planId!)
            fetchDrift(planId!)
            executionService.getBottlenecks(planId!).then(setBottlenecks).catch(() => {})
          }}
        />
      )}

      {tab === 'dag' && currentDag && !isGenerating && (
        <DagVisualization
          dag={currentDag}
          planId={planId!}
          onTaskUpdated={() => {
            fetchDag(planId!)
            fetchTimeline(planId!)
            fetchDrift(planId!)
            executionService.getBottlenecks(planId!).then(setBottlenecks).catch(() => {})
          }}
        />
      )}

      {tab === 'dag' && isGenerating && (
        <div className="h-[520px] bg-gray-900 border border-gray-700 rounded-xl flex items-center justify-center">
          <p className="text-gray-500 text-sm">DAG will be available once generation completes</p>
        </div>
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

      {tab === 'history' && (
        <div className="space-y-6">
          {history.map(({ version, tasks }) => (
            <div key={version} className="bg-gray-900 border border-gray-700 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <History size={14} className="text-gray-500" />
                Version {version}
                <span className="text-xs text-gray-600 font-normal">— {tasks.length} tasks</span>
              </h3>
              <div className="space-y-2">
                {tasks.map(t => (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {t.is_on_critical_path && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" title="Critical path" />
                      )}
                      <span className="text-sm text-gray-300 truncate">{t.name}</span>
                      {t.category && (
                        <span className="text-xs text-gray-600 flex-shrink-0">{t.category}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 ml-3 shrink-0">
                      {t.actual_hours != null && t.estimated_hours != null && (
                        <span className={`text-xs ${t.actual_hours > t.estimated_hours ? 'text-orange-400' : 'text-emerald-400'}`}>
                          {t.actual_hours}h / {t.estimated_hours}h est
                        </span>
                      )}
                      {t.assigned_to && (
                        <span className="text-xs text-gray-500">{t.assigned_to}</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                        t.status === 'completed' ? 'bg-emerald-900 text-emerald-300' :
                        t.status === 'failed' ? 'bg-red-900 text-red-300' :
                        'bg-gray-800 text-gray-400'
                      }`}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showSimulation && planId && (
        <SimulationPanel
          planId={planId}
          onClose={() => setShowSimulation(false)}
          onStepComplete={() => {
            fetchDag(planId)
            fetchDrift(planId)
            fetchTimeline(planId)
          }}
        />
      )}

      {showRegenerate && (
        <RegenerateModal
          plan={currentPlan}
          onClose={() => setShowRegenerate(false)}
          onRegenerated={() => {
            setShowRegenerate(false)
            if (planId) {
              fetchPlan(planId)
              planService.getHistory(planId).then(setHistory).catch(() => {})
              pollPlanStatus(planId, () => { fetchDag(planId); fetchTimeline(planId) })
            }
          }}
        />
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
