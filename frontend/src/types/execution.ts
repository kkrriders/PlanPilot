export interface ExecutionLog {
  id: string
  task_id: string
  plan_id: string
  event_type: string
  prev_status?: string
  new_status?: string
  pct_complete: number
  note?: string
  logged_at: string
}

export interface DriftMetric {
  id: string
  plan_id: string
  computed_at: string
  schedule_drift_pct?: number
  scope_drift_pct?: number
  effort_drift_pct?: number
  overall_drift?: number
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical'
  details: Record<string, unknown>
}

export interface ReplanPreview {
  added: Array<{ name: string; estimated_hours: number; category?: string }>
  removed: Array<{ name: string; id: string }>
  modified: Array<{ name: string; new_estimated_hours: number }>
  new_critical_path: string[]
  new_risk_score: number
  new_confidence: number
  reasoning?: string
}
