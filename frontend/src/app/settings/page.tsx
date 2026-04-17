'use client'
import { useEffect, useState } from 'react'
import { Save, User } from 'lucide-react'
import api from '@/services/api'
import AuthGuard from '@/components/shared/AuthGuard'
import { useToastStore } from '@/store/toastStore'

function SettingsContent() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToastStore()

  useEffect(() => {
    api.get('/api/v1/users/me')
      .then(r => {
        setFullName(r.data.full_name || '')
        setEmail(r.data.email || '')
      })
      .catch(() => toast('Failed to load profile', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.patch('/api/v1/users/me', { full_name: fullName.trim() || null })
      toast('Profile saved', 'success')
    } catch (e: any) {
      toast(e?.response?.data?.detail || 'Failed to save changes', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse max-w-lg">
        <div className="h-7 w-48 bg-gray-800 rounded" />
        <div className="h-4 w-72 bg-gray-800 rounded" />
        <div className="h-48 bg-gray-900 border border-gray-700 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Profile Settings</h1>
        <p className="text-gray-400 text-sm mt-1">Manage your account information</p>
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center">
            <User size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">{fullName || email}</p>
            <p className="text-xs text-gray-500">{email}</p>
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">Email address</label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-gray-500 text-sm cursor-not-allowed select-none"
          />
          <p className="text-[10px] text-gray-600 mt-1">Email cannot be changed</p>
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">Full name</label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Your full name"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Save size={14} />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return <AuthGuard><SettingsContent /></AuthGuard>
}
