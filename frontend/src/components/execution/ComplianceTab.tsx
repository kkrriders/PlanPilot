'use client'
import { useEffect, useState } from 'react'
import { executionService } from '@/services/executionService'
import type { ComplianceViolation } from '@/types/execution'
import { ShieldAlert, ShieldCheck, AlertTriangle, Info } from 'lucide-react'

interface Props {
  planId: string
}

const SEVERITY_STYLE: Record<string, { cls: string; icon: React.ReactNode }> = {
  error: { cls: 'bg-red-900/30 border-red-700/50 text-red-300', icon: <ShieldAlert size={13} className="text-red-400 flex-shrink-0" /> },
  warning: { cls: 'bg-yellow-900/20 border-yellow-700/40 text-yellow-300', icon: <AlertTriangle size={13} className="text-yellow-400 flex-shrink-0" /> },
  info: { cls: 'bg-blue-900/20 border-blue-700/40 text-blue-300', icon: <Info size={13} className="text-blue-400 flex-shrink-0" /> },
}

export default function ComplianceTab({ planId }: Props) {
  const [violations, setViolations] = useState<ComplianceViolation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    executionService.getComplianceViolations(planId)
      .then(setViolations)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [planId])

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-800 rounded-xl" />)}
      </div>
    )
  }

  if (violations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <ShieldCheck size={32} className="text-green-400" />
        <p className="text-white font-medium">No compliance issues</p>
        <p className="text-sm text-gray-400">All logged events pass compliance checks.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Compliance Flags</h3>
        <span className="text-xs text-gray-500">{violations.length} event{violations.length !== 1 ? 's' : ''} with flags</span>
      </div>

      <div className="space-y-3">
        {violations.map(v => (
          <div key={v.log_id} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-white">{v.task_name}</p>
                <p className="text-xs text-gray-400 capitalize mt-0.5">{v.event_type.replace(/_/g, ' ')}</p>
              </div>
              <p className="text-xs text-gray-500 flex-shrink-0 ml-4">
                {new Date(v.logged_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div className="space-y-1.5">
              {v.flags.map((flag, i) => {
                const style = SEVERITY_STYLE[flag.severity] ?? SEVERITY_STYLE.info
                return (
                  <div key={i} className={`flex items-start gap-2 text-xs border rounded-lg px-3 py-2 ${style.cls}`}>
                    {style.icon}
                    <div>
                      <span className="font-medium capitalize">{flag.rule.replace(/_/g, ' ')}</span>
                      {flag.message && <span className="text-gray-400 ml-1">— {flag.message}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
