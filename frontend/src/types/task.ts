export interface Task {
  id: string
  plan_id: string
  version: number
  name: string
  description?: string
  category?: string
  status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'skipped' | 'failed'
  priority: number
  estimated_hours?: number
  actual_hours?: number
  planned_start?: string
  planned_end?: string
  actual_start?: string
  actual_end?: string
  assigned_to?: string
  is_on_critical_path: boolean
  created_at: string
}

export interface TimelineEntry {
  task_id: string
  name: string
  category?: string
  status: string
  is_on_critical_path: boolean
  planned_start?: string
  planned_end?: string
  actual_start?: string
  actual_end?: string
  pct_complete: number
  is_delayed: boolean
}
