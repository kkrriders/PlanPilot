import type { DriftMetric } from '../../types/execution'
import { AlertTriangle, XCircle, Info } from 'lucide-react'
import clsx from 'clsx'

const SEVERITY_CONFIG = {
  none: null,
  low: { color: 'bg-blue-900/50 border-blue-700 text-blue-300', Icon: Info, label: 'Low drift' },
  medium: { color: 'bg-yellow-900/50 border-yellow-700 text-yellow-300', Icon: AlertTriangle, label: 'Medium drift' },
  high: { color: 'bg-orange-900/50 border-orange-700 text-orange-300', Icon: AlertTriangle, label: 'High drift — consider replanning' },
  critical: { color: 'bg-red-900/50 border-red-700 text-red-300', Icon: XCircle, label: 'Critical drift — replan recommended' },
}

interface Props {
  metric: DriftMetric
  onReplan: () => void
}

export default function DriftAlertBanner({ metric, onReplan }: Props) {
  const config = SEVERITY_CONFIG[metric.severity]
  if (!config) return null

  const { color, Icon, label } = config

  return (
    <div className={clsx('flex items-center gap-3 px-4 py-3 rounded-lg border mb-4', color)}>
      <Icon size={18} className="shrink-0" />
      <div className="flex-1">
        <span className="font-medium">{label}</span>
        <span className="ml-2 text-sm opacity-80">
          Overall drift: {metric.overall_drift?.toFixed(1)}% |
          Schedule: {metric.schedule_drift_pct?.toFixed(1)}% |
          Effort: {metric.effort_drift_pct?.toFixed(1)}%
        </span>
      </div>
      {metric.severity !== 'low' && (
        <button
          onClick={onReplan}
          className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm font-medium transition-colors"
        >
          Preview Replan
        </button>
      )}
    </div>
  )
}
