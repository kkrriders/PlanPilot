'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { Zap } from 'lucide-react'

function getStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[!@#$%^&*()_+\-=\[\]{}|;':",./<>?]/.test(pw)) score++
  if (score <= 1) return { score, label: 'Weak', color: 'bg-red-500' }
  if (score === 2) return { score, label: 'Fair', color: 'bg-yellow-500' }
  if (score === 3) return { score, label: 'Good', color: 'bg-blue-500' }
  return { score, label: 'Strong', color: 'bg-emerald-500' }
}

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { register, login } = useAuthStore()
  const router = useRouter()

  const strength = password ? getStrength(password) : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(email, password, fullName)
      await login(email, password)
      router.push('/dashboard')
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(Array.isArray(detail) ? detail[0]?.msg : detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap className="text-blue-400" size={28} />
            <span className="text-2xl font-bold text-white">PlanPilot</span>
          </div>
        </div>

        <form onSubmit={submit} className="bg-gray-900 rounded-xl border border-gray-700 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Create account</h2>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Full name</label>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              required
            />
            {strength && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map(i => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                        i <= strength.score ? strength.color : 'bg-gray-700'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  {strength.label} — needs uppercase, number, and special character
                </p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>

          <p className="text-center text-sm text-gray-400">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
