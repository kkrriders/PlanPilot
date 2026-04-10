'use client'
import { useState, KeyboardEvent } from 'react'
import { Plus, X, User } from 'lucide-react'
import type { TeamMemberCreate } from '@/types/team'

interface Props {
  onAdd: (member: TeamMemberCreate) => void
}

const inputCls = 'bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500'

export default function TeamMemberForm({ onAdd }: Props) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [skillInput, setSkillInput] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [expanded, setExpanded] = useState(false)

  const addSkill = () => {
    const s = skillInput.trim()
    if (s && !skills.includes(s)) setSkills(prev => [...prev, s])
    setSkillInput('')
  }

  const onSkillKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addSkill()
    }
  }

  const removeSkill = (s: string) => setSkills(prev => prev.filter(x => x !== s))

  const handleSubmit = () => {
    if (!name.trim() || !role.trim()) return
    onAdd({ name: name.trim(), role: role.trim(), skills })
    setName('')
    setRole('')
    setSkills([])
    setSkillInput('')
    setExpanded(false)
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
      >
        <Plus size={14} />
        Add team member
      </button>
    )
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <User size={14} className="text-gray-400" />
        <span className="text-sm text-gray-300 font-medium">New member</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name"
          className={`${inputCls} w-full`}
          autoFocus
        />
        <input
          value={role}
          onChange={e => setRole(e.target.value)}
          placeholder="Role (e.g. Backend Engineer)"
          className={`${inputCls} w-full`}
        />
      </div>

      {/* Skills input */}
      <div>
        <div className={`${inputCls} flex flex-wrap gap-1.5 min-h-[38px] cursor-text`}
          onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}
        >
          {skills.map(s => (
            <span key={s} className="flex items-center gap-1 bg-blue-900/50 text-blue-300 text-xs px-2 py-0.5 rounded-full">
              {s}
              <button type="button" onClick={() => removeSkill(s)}>
                <X size={10} />
              </button>
            </span>
          ))}
          <input
            value={skillInput}
            onChange={e => setSkillInput(e.target.value)}
            onKeyDown={onSkillKey}
            onBlur={addSkill}
            placeholder={skills.length === 0 ? 'Skills (press Enter or comma to add)' : ''}
            className="bg-transparent outline-none text-white text-sm flex-1 min-w-[120px] placeholder-gray-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!name.trim() || !role.trim()}
          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg transition-colors"
        >
          Add Member
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
