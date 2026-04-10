'use client'
import { useEffect, useState } from 'react'
import { teamService } from '@/services/teamService'
import type { TeamMember, TeamMemberCreate } from '@/types/team'
import type { DagData } from '@/types/plan'
import { Plus, X, Pencil, Check, Users } from 'lucide-react'
import TeamMemberForm from './TeamMemberForm'
import clsx from 'clsx'

const CATEGORY_COLORS: Record<string, string> = {
  design:   'bg-purple-900 text-purple-300',
  dev:      'bg-blue-900   text-blue-300',
  test:     'bg-emerald-900 text-emerald-300',
  deploy:   'bg-amber-900  text-amber-300',
  review:   'bg-pink-900   text-pink-300',
  research: 'bg-cyan-900   text-cyan-300',
  planning: 'bg-indigo-900 text-indigo-300',
}

interface Props {
  planId: string
  dag: DagData | null
}

export default function TeamTab({ planId, dag }: Props) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; role: string; skillInput: string; skills: string[] }>({
    name: '', role: '', skillInput: '', skills: [],
  })

  const load = async () => {
    try {
      const data = await teamService.list(planId)
      setMembers(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [planId])

  const handleAdd = async (body: TeamMemberCreate) => {
    const m = await teamService.add(planId, body)
    setMembers(prev => [...prev, m])
  }

  const handleRemove = async (id: string) => {
    await teamService.remove(planId, id)
    setMembers(prev => prev.filter(m => m.id !== id))
  }

  const startEdit = (m: TeamMember) => {
    setEditingId(m.id)
    setEditForm({ name: m.name, role: m.role, skillInput: '', skills: [...m.skills] })
  }

  const saveEdit = async () => {
    if (!editingId) return
    const updated = await teamService.update(planId, editingId, {
      name: editForm.name,
      role: editForm.role,
      skills: editForm.skills,
    })
    setMembers(prev => prev.map(m => m.id === editingId ? updated : m))
    setEditingId(null)
  }

  // Build assignee → tasks map from dag
  const assigneeTaskMap: Record<string, typeof dag extends null ? never : DagData['nodes']> = {}
  if (dag) {
    dag.nodes.forEach(node => {
      const assignee = node.data.assigned_to
      if (assignee) {
        if (!assigneeTaskMap[assignee]) assigneeTaskMap[assignee] = []
        assigneeTaskMap[assignee].push(node)
      }
    })
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-900 border border-gray-700 rounded-xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Member cards */}
      {members.length === 0 ? (
        <div className="bg-gray-900 border border-dashed border-gray-700 rounded-xl p-8 text-center">
          <Users size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No team members yet.</p>
          <p className="text-gray-500 text-xs mt-1">Add team members to enable skill-based task assignment on replanning.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map(m => (
            <MemberCard
              key={m.id}
              member={m}
              tasks={assigneeTaskMap[m.name] || []}
              isEditing={editingId === m.id}
              editForm={editForm}
              setEditForm={setEditForm}
              onEdit={() => startEdit(m)}
              onSave={saveEdit}
              onCancel={() => setEditingId(null)}
              onRemove={() => handleRemove(m.id)}
            />
          ))}
        </div>
      )}

      <TeamMemberForm onAdd={handleAdd} />
    </div>
  )
}

interface MemberCardProps {
  member: TeamMember
  tasks: DagData['nodes']
  isEditing: boolean
  editForm: { name: string; role: string; skillInput: string; skills: string[] }
  setEditForm: React.Dispatch<React.SetStateAction<{ name: string; role: string; skillInput: string; skills: string[] }>>
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onRemove: () => void
}

function MemberCard({ member, tasks, isEditing, editForm, setEditForm, onEdit, onSave, onCancel, onRemove }: MemberCardProps) {
  const completedCount = tasks.filter(t => t.data.status === 'completed').length
  const inProgressCount = tasks.filter(t => t.data.status === 'in_progress').length

  if (isEditing) {
    return (
      <div className="bg-gray-900 border border-blue-600 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input
            value={editForm.name}
            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            placeholder="Name"
          />
          <input
            value={editForm.role}
            onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            placeholder="Role"
          />
        </div>

        {/* Skills edit */}
        <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 flex flex-wrap gap-1.5 min-h-[38px]">
          {editForm.skills.map(s => (
            <span key={s} className="flex items-center gap-1 bg-blue-900/50 text-blue-300 text-xs px-2 py-0.5 rounded-full">
              {s}
              <button type="button" onClick={() => setEditForm(f => ({ ...f, skills: f.skills.filter(x => x !== s) }))}>
                <X size={10} />
              </button>
            </span>
          ))}
          <input
            value={editForm.skillInput}
            onChange={e => setEditForm(f => ({ ...f, skillInput: e.target.value }))}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                const s = editForm.skillInput.trim()
                if (s && !editForm.skills.includes(s)) setEditForm(f => ({ ...f, skills: [...f.skills, s], skillInput: '' }))
                else setEditForm(f => ({ ...f, skillInput: '' }))
              }
            }}
            placeholder={editForm.skills.length === 0 ? 'Skills...' : ''}
            className="bg-transparent outline-none text-white text-sm flex-1 min-w-[80px] placeholder-gray-500"
          />
        </div>

        <div className="flex gap-2">
          <button onClick={onSave} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">
            <Check size={12} /> Save
          </button>
          <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
          style={{ backgroundColor: member.color }}
        >
          {member.name.charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-white text-sm">{member.name}</p>
            <span className="text-xs text-gray-500">{member.role}</span>
          </div>

          {/* Skills */}
          {member.skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {member.skills.map(s => (
                <span key={s} className="text-[11px] bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">{s}</span>
              ))}
            </div>
          )}

          {/* Task summary */}
          {tasks.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 mb-1.5">
                {tasks.length} task{tasks.length !== 1 ? 's' : ''} assigned
                {completedCount > 0 && ` · ${completedCount} done`}
                {inProgressCount > 0 && ` · ${inProgressCount} in progress`}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tasks.slice(0, 6).map(t => (
                  <span
                    key={t.id}
                    className={clsx(
                      'text-[10px] px-2 py-0.5 rounded-full truncate max-w-[150px]',
                      CATEGORY_COLORS[t.data.category || ''] || 'bg-gray-800 text-gray-300'
                    )}
                    title={t.data.label}
                  >
                    {t.data.label}
                  </span>
                ))}
                {tasks.length > 6 && (
                  <span className="text-[10px] text-gray-500 px-2 py-0.5">+{tasks.length - 6} more</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onEdit} className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors rounded">
            <Pencil size={13} />
          </button>
          <button onClick={onRemove} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors rounded">
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
