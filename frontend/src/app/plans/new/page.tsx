'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { planService } from '@/services/planService'
import { teamService } from '@/services/teamService'
import { usePlanStore } from '@/store/planStore'
import { Zap, ChevronRight, Users, X } from 'lucide-react'
import AuthGuard from '@/components/shared/AuthGuard'
import TeamMemberForm from '@/components/planning/TeamMemberForm'
import PlanTemplates from '@/components/planning/PlanTemplates'
import type { TeamMemberCreate } from '@/types/team'

const MEMBER_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
]

function PlanCreateContent() {
  const router = useRouter()
  const { pollPlanStatus } = usePlanStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    title: '',
    goal: '',
    deadline_days: '',
    team_size: '',
    budget_usd: '',
    tech_stack: '',
    notes: '',
  })

  const [pendingMembers, setPendingMembers] = useState<(TeamMemberCreate & { _localId: string })[]>([])

  const handleAddMember = (member: TeamMemberCreate) => {
    setPendingMembers(prev => [
      ...prev,
      { ...member, color: MEMBER_COLORS[prev.length % MEMBER_COLORS.length], _localId: crypto.randomUUID() },
    ])
  }

  const handleRemoveMember = (localId: string) => {
    setPendingMembers(prev => prev.filter(m => m._localId !== localId))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // 1. Create plan as draft
      const plan = await planService.create(form.title, form.goal, {
        deadline_days: form.deadline_days ? Number(form.deadline_days) : undefined,
        team_size: form.team_size ? Number(form.team_size) : undefined,
        budget_usd: form.budget_usd ? Number(form.budget_usd) : undefined,
        tech_stack: form.tech_stack ? form.tech_stack.split(',').map(s => s.trim()) : [],
        notes: form.notes || undefined,
      })

      // 2. Add team members
      for (const m of pendingMembers) {
        const { _localId, ...body } = m
        await teamService.add(plan.id, body)
      }

      // 3. Trigger generation
      await planService.generate(plan.id)

      // Navigate immediately — the plan detail page owns polling from here
      router.push(`/plans/${plan.id}`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to create plan')
      setLoading(false)
    }
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">New Plan</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <PlanTemplates onSelect={t => setForm(f => ({
          ...f,
          goal: t.goal,
          deadline_days: t.deadline_days,
          team_size: t.team_size,
          budget_usd: t.budget_usd,
          tech_stack: t.tech_stack,
          notes: t.notes,
          title: f.title || t.label,
        }))} />
        {/* Goal & Context */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Zap size={16} className="text-blue-400" />
            Goal & Context
          </h2>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <Field label="Plan Title">
            <input
              value={form.title}
              onChange={set('title')}
              placeholder="e.g. Build e-commerce MVP"
              className={inputCls}
              required
            />
          </Field>

          <Field label="Goal" hint="Describe what you want to achieve in detail">
            <textarea
              value={form.goal}
              onChange={set('goal')}
              placeholder="e.g. Build a full-stack e-commerce platform with product catalog, cart, payments, and admin panel in 3 months..."
              className={`${inputCls} h-28 resize-none`}
              required
            />
          </Field>
        </div>

        {/* Constraints */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-white">Constraints</h2>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Deadline (days)">
              <input type="number" value={form.deadline_days} onChange={set('deadline_days')} className={inputCls} min="1" placeholder="e.g. 90" />
            </Field>
            <Field label="Team Size">
              <input type="number" value={form.team_size} onChange={set('team_size')} className={inputCls} min="1" placeholder="e.g. 4" />
            </Field>
            <Field label="Budget (USD)">
              <input type="number" value={form.budget_usd} onChange={set('budget_usd')} className={inputCls} min="0" placeholder="e.g. 50000" />
            </Field>
            <Field label="Tech Stack" hint="comma-separated">
              <input value={form.tech_stack} onChange={set('tech_stack')} className={inputCls} placeholder="React, FastAPI, Postgres" />
            </Field>
          </div>

          <Field label="Additional Notes">
            <textarea value={form.notes} onChange={set('notes')} className={`${inputCls} h-20 resize-none`} placeholder="Any specific requirements, risks, or context..." />
          </Field>
        </div>

        {/* Team Members */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Users size={16} className="text-blue-400" />
              Team Members
              <span className="text-xs text-gray-500 font-normal">(optional — enables skill-based task assignment)</span>
            </h2>
          </div>

          {/* Member list */}
          {pendingMembers.length > 0 && (
            <div className="space-y-2">
              {pendingMembers.map(m => (
                <div key={m._localId} className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: m.color }}
                  >
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{m.name}</p>
                    <p className="text-xs text-gray-400 truncate">{m.role}{m.skills.length > 0 ? ` · ${m.skills.join(', ')}` : ''}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(m._localId)}
                    className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <TeamMemberForm onAdd={handleAddMember} />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
        >
          {loading ? 'Generating plan...' : <><span>Generate Plan</span> <ChevronRight size={16} /></>}
        </button>

        {loading && (
          <p className="text-sm text-gray-400 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            AI is analyzing your goal and creating a task breakdown with skill-based assignments...
          </p>
        )}
      </form>
    </div>
  )
}

const inputCls = 'w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">
        {label}
        {hint && <span className="text-gray-500 ml-1 text-xs">({hint})</span>}
      </label>
      {children}
    </div>
  )
}

export default function PlanCreatePage() {
  return <AuthGuard><PlanCreateContent /></AuthGuard>
}
