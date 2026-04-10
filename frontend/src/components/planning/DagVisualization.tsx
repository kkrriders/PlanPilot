import { useCallback, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { DagData } from '../../types/plan'
import clsx from 'clsx'
import TaskUpdateModal from '../execution/TaskUpdateModal'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-700 border-gray-500',
  in_progress: 'bg-blue-900 border-blue-400',
  completed: 'bg-green-900 border-green-400',
  blocked: 'bg-red-900 border-red-400',
  failed: 'bg-red-900 border-red-500',
  skipped: 'bg-gray-800 border-gray-600',
}

const CATEGORY_COLORS: Record<string, string> = {
  design: '#8b5cf6',
  dev: '#3b82f6',
  test: '#10b981',
  deploy: '#f59e0b',
  review: '#ec4899',
  research: '#06b6d4',
  planning: '#6366f1',
}

function TaskNode({ data }: { data: any }) {
  const statusClass = STATUS_COLORS[data.status] || STATUS_COLORS.pending
  const catColor = CATEGORY_COLORS[data.category] || '#6b7280'

  // Convert description into bullet points (split on period, semicolon, or newline)
  const bullets: string[] = data.description
    ? data.description
        .split(/[.;\n]+/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 4)
        .slice(0, 3)
    : []

  return (
    <div
      className={clsx(
        'px-3 py-2 rounded-lg border-2 min-w-[160px] max-w-[210px] text-xs shadow-lg',
        statusClass,
        data.is_on_critical_path && 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-gray-950'
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-400" />
      <div className="flex items-center gap-1 mb-1">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: catColor }}
        />
        <span className="text-gray-400 uppercase tracking-wide text-[10px]">{data.category}</span>
        {data.is_on_critical_path && (
          <span className="ml-auto text-yellow-400 text-[10px]">CP</span>
        )}
      </div>
      <p className="font-medium text-white leading-tight">{data.label}</p>
      {bullets.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-1 text-[9px] text-gray-400 leading-tight">
              <span className="text-gray-500 mt-0.5 flex-shrink-0">•</span>
              <span className="line-clamp-1">{b}</span>
            </li>
          ))}
        </ul>
      )}
      {data.estimated_hours && (
        <p className="text-gray-500 mt-1.5 text-[10px]">{data.estimated_hours}h</p>
      )}
      <Handle type="source" position={Position.Right} className="!bg-gray-400" />
    </div>
  )
}

const nodeTypes = { taskNode: TaskNode }

// Auto-layout: position nodes in columns based on topological depth
function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const depths: Record<string, number> = {}
  const adjacency: Record<string, string[]> = {}

  nodes.forEach(n => { adjacency[n.id] = []; depths[n.id] = 0 })
  edges.forEach(e => adjacency[e.source].push(e.target))

  // BFS from root nodes
  const inDegree: Record<string, number> = {}
  nodes.forEach(n => { inDegree[n.id] = 0 })
  edges.forEach(e => { inDegree[e.target] = (inDegree[e.target] || 0) + 1 })

  const queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id)
  while (queue.length) {
    const id = queue.shift()!
    for (const next of adjacency[id]) {
      depths[next] = Math.max(depths[next], depths[id] + 1)
      inDegree[next]--
      if (inDegree[next] === 0) queue.push(next)
    }
  }

  const colGroups: Record<number, string[]> = {}
  nodes.forEach(n => {
    const d = depths[n.id]
    if (!colGroups[d]) colGroups[d] = []
    colGroups[d].push(n.id)
  })

  const positioned = { ...Object.fromEntries(nodes.map(n => [n.id, n])) }
  Object.entries(colGroups).forEach(([col, ids]) => {
    ids.forEach((id, row) => {
      positioned[id] = {
        ...positioned[id],
        position: { x: Number(col) * 250, y: row * 110 },
      }
    })
  })

  return nodes.map(n => positioned[n.id])
}

interface Props {
  dag: DagData
  planId: string
  onTaskUpdated?: () => void
}

export default function DagVisualization({ dag, planId, onTaskUpdated }: Props) {
  const [selectedTask, setSelectedTask] = useState<{ id: string; data: any } | null>(null)

  const positionedNodes = layoutNodes(
    dag.nodes.map(n => ({ ...n, position: { x: 0, y: 0 } })),
    dag.edges
  )

  const styledEdges: Edge[] = dag.edges.map(e => ({
    ...e,
    style: { stroke: '#4b5563', strokeWidth: 1.5 },
    markerEnd: { type: 'arrowclosed' as any, color: '#4b5563' },
  }))

  const [nodes, , onNodesChange] = useNodesState(positionedNodes)
  const [edges, , onEdgesChange] = useEdgesState(styledEdges)

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedTask({ id: node.id, data: node.data })
  }, [])

  return (
    <>
      <div className="w-full h-[520px] rounded-xl border border-gray-700 overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          className="bg-gray-950"
        >
          <Background color="#1f2937" gap={16} />
          <Controls className="!bg-gray-800 !border-gray-700 !text-gray-300" />
          <MiniMap
            nodeColor={(n) => (n.data?.is_on_critical_path ? '#facc15' : '#374151')}
            maskColor="rgba(0,0,0,0.6)"
            className="!bg-gray-900 !border-gray-700"
          />
        </ReactFlow>
        <div className="p-2 bg-gray-900 border-t border-gray-700 flex items-center gap-4 text-xs text-gray-400">
          <span className="text-gray-500">Click a task to update status</span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded border-2 border-yellow-400 ring-1 ring-yellow-400" />
            Critical Path
          </span>
          {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
            <span key={cat} className="flex items-center gap-1 capitalize">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              {cat}
            </span>
          ))}
        </div>
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
