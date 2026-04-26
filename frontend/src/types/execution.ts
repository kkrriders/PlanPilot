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
  modified: Array<{ name: string; old_estimated_hours: number | null; new_estimated_hours: number }>
  new_critical_path: string[]
  new_risk_score: number
  new_confidence: number
  reasoning?: string
  drift_analysis?: {
    root_cause?: string
    categories?: string[]
    [key: string]: unknown
  }
}

export interface DriftEvent {
  id: string
  plan_id: string
  task_id: string | null
  trigger_type: string
  description: string | null
  was_replanned: boolean
  created_at: string
}

export interface ComplianceFlag {
  rule: string
  message: string
  severity: string
}

export interface ComplianceViolation {
  log_id: string
  task_name: string
  event_type: string
  logged_at: string
  flags: ComplianceFlag[]
}
