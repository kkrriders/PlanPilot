'use client'
import { useState } from 'react'
import type { DagData } from '../../types/plan'
import TaskUpdateModal from '../execution/TaskUpdateModal'
import { Clock, Zap, Flag, ShieldCheck, ShieldAlert } from 'lucide-react'
import clsx from 'clsx'

const COLUMNS = [
  { id: 'pending',     label: 'Pending',     headerCls: 'border-gray-500',  countCls: 'bg-gray-700 text-gray-300' },
  { id: 'in_progress', label: 'In Progress', headerCls: 'border-blue-400',  countCls: 'bg-blue-900 text-blue-300' },
  { id: 'blocked',     label: 'Blocked',     headerCls: 'border-red-400',   countCls: 'bg-red-900  text-red-300'  },
  { id: 'completed',   label: 'Completed',   headerCls: 'border-green-400', countCls: 'bg-green-900 text-green-300' },
  { id: 'failed',      label: 'Failed',      headerCls: 'border-rose-500',  countCls: 'bg-rose-900 text-rose-300' },
]

const CATEGORY_COLORS: Record<string, string> = {
  design:   'bg-purple-900 text-purple-300',
  dev:      'bg-blue-900   text-blue-300',
  test:     'bg-emerald-900 text-emerald-300',
  deploy:   'bg-amber-900  text-amber-300',
  review:   'bg-pink-900   text-pink-300',
  research: 'bg-cyan-900   text-cyan-300',
  planning: 'bg-indigo-900 text-indigo-300',
}

const PRIORITY_LABELS: Record<number, { label: string; cls: string }> = {
  1: { label: 'Critical', cls: 'text-red-400' },
  2: { label: 'High',     cls: 'text-orange-400' },
  3: { label: 'Medium',   cls: 'text-yellow-400' },
  4: { label: 'Low',      cls: 'text-blue-400' },
  5: { label: 'Minimal',  cls: 'text-gray-400' },
}

interface Props {
  dag: DagData
  planId: string
  onTaskUpdated?: () => void
}

export default function KanbanBoard({ dag, planId, onTaskUpdated }: Props) {
  const [selectedTask, setSelectedTask] = useState<{ id: string; data: any } | null>(null)

  const byStatus = Object.fromEntries(COLUMNS.map(c => [c.id, [] as typeof dag.nodes]))
  dag.nodes.forEach(node => {
    const status = node.data.status
    if (byStatus[status]) byStatus[status].push(node)
    // skipped tasks fall into pending visually
    else if (status === 'skipped') byStatus['pending'].push(node)
  })

  // Only show columns that have tasks or are core statuses
  const visibleColumns = COLUMNS.filter(
    c => ['pending', 'in_progress', 'blocked', 'completed'].includes(c.id) || byStatus[c.id].length > 0
  )

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[520px]">
        {visibleColumns.map(col => (
          <div key={col.id} className="flex-shrink-0 w-72">
            {/* Column header */}
            <div className={clsx('flex items-center justify-between mb-3 pb-2 border-b-2', col.headerCls)}>
              <span className="font-semibold text-white text-sm">{col.label}</span>
              <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', col.countCls)}>
                {byStatus[col.id].length}
              </span>
            </div>

            {/* Cards */}
            <div className="space-y-3">
              {byStatus[col.id].length === 0 && (
                <div className="border border-dashed border-gray-700 rounded-xl h-20 flex items-center justify-center">
                  <span className="text-gray-600 text-xs">No tasks</span>
                </div>
              )}
              {byStatus[col.id].map(node => (
                <TaskCard
                  key={node.id}
                  node={node}
                  onClick={() => setSelectedTask({ id: node.id, data: node.data })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedTask && (
        <TaskUpdateModal
          planId={planId}
          task={{
            id: selectedTask.id,
            label: selectedTask.data.label,
            status: selectedTask.data.status,
            category: selectedTask.data.category,
            estimated_hours: selectedTask.data.estimated_hours,
            is_on_critical_path: selectedTask.data.is_on_critical_path,
          }}
          onClose={() => setSelectedTask(null)}
          onUpdated={() => {
            setSelectedTask(null)
            onTaskUpdated?.()
          }}
        />
      )}
    </>
  )
}

function TaskCard({ node, onClick }: { node: any; onClick: () => void }) {
  const { label, category, status, estimated_hours, priority, is_on_critical_path, description, assigned_to } = node.data

  const catCls = CATEGORY_COLORS[category] || 'bg-gray-800 text-gray-300'
  const priorityInfo = PRIORITY_LABELS[priority] || PRIORITY_LABELS[3]

  const bullets: string[] = description
    ? description.split(/[.;\n]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 4).slice(0, 3)
    : []

  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-gray-900 border border-gray-700 rounded-xl p-4 cursor-pointer',
        'hover:border-gray-500 hover:bg-gray-800 transition-all group',
        is_on_critical_path && 'border-l-2 border-l-yellow-400'
      )}
    >
      {/* Top badges */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {category && (
          <span className={clsx('text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide', catCls)}>
            {category}
          </span>
        )}
        {is_on_critical_path && (
          <span className="flex items-center gap-0.5 text-[10px] text-yellow-400 font-medium">
            <Zap size={9} />
            CP
          </span>
        )}
      </div>

      {/* Task name */}
      <p className="font-semibold text-white text-sm leading-snug mb-2">{label}</p>

      {/* Description bullets */}
      {bullets.length > 0 && (
        <ul className="space-y-1 mb-3">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-gray-400">
              <span className="text-gray-600 mt-0.5 flex-shrink-0">•</span>
              <span className="leading-snug">{b}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-800">
        <div className="flex items-center gap-3">
          {estimated_hours && (
            <span className="flex items-center gap-1 text-[11px] text-gray-500">
              <Clock size={10} />
              {estimated_hours}h
            </span>
          )}
          <span className={clsx('flex items-center gap-1 text-[11px]', priorityInfo.cls)}>
            <Flag size={10} />
            {priorityInfo.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {assigned_to && (
            <div
              className="w-5 h-5 rounded-full bg-blue-700 flex items-center justify-center text-[9px] font-bold text-white"
              title={assigned_to}
            >
              {assigned_to.charAt(0).toUpperCase()}
            </div>
          )}
          {status === 'completed' && (
            <ShieldCheck size={12} className="text-green-400" title="Completed with evidence" />
          )}
          {status === 'blocked' && (
            <ShieldAlert size={12} className="text-yellow-400" title="Task is blocked" />
          )}
          <span className="text-[10px] text-gray-600 group-hover:text-gray-400 transition-colors">
            Update →
          </span>
        </div>
      </div>
    </div>
  )
}
