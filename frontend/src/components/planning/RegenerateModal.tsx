'use client'
import { useState } from 'react'
import { X, RefreshCw } from 'lucide-react'
import { planService } from '@/services/planService'
import type { Plan } from '@/types/plan'

interface Props {
  plan: Plan
  onClose: () => void
  onRegenerated: () => void
}

const inputCls = 'w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500'

export default function RegenerateModal({ plan, onClose, onRegenerated }: Props) {
  const c = plan.constraints
  const [goal, setGoal] = useState(plan.goal)
  const [deadline, setDeadline] = useState(String(c.deadline_days ?? ''))
  const [teamSize, setTeamSize] = useState(String(c.team_size ?? ''))
  const [budget, setBudget] = useState(String(c.budget_usd ?? ''))
  const [techStack, setTechStack] = useState((c.tech_stack ?? []).join(', '))
  const [notes, setNotes] = useState(c.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Update constraints
      await planService.update(plan.id, {
        goal,
        constraints: {
          deadline_days: deadline ? Number(deadline) : undefined,
          team_size: teamSize ? Number(teamSize) : undefined,
          budget_usd: budget ? Number(budget) : undefined,
          tech_stack: techStack ? techStack.split(',').map(s => s.trim()) : [],
          notes: notes || undefined,
        },
      } as any)
      // Trigger new generation
      await planService.generate(plan.id)
      onRegenerated()
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to regenerate')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-white">Edit & Regenerate</h3>
            <p className="text-xs text-gray-400 mt-0.5">Adjust goal or constraints, then regenerate the task plan.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div>
            <label className="block text-xs text-gray-400 mb-1">Goal</label>
            <textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              className={`${inputCls} h-24 resize-none`}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Deadline (days)</label>
              <input type="number" value={deadline} onChange={e => setDeadline(e.target.value)} className={inputCls} min="1" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Team Size</label>
              <input type="number" value={teamSize} onChange={e => setTeamSize(e.target.value)} className={inputCls} min="1" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Budget (USD)</label>
              <input type="number" value={budget} onChange={e => setBudget(e.target.value)} className={inputCls} min="0" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Tech Stack</label>
              <input value={techStack} onChange={e => setTechStack(e.target.value)} className={inputCls} placeholder="comma-separated" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className={`${inputCls} h-16 resize-none`} />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading || !goal.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Regenerating...' : 'Regenerate Plan'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
