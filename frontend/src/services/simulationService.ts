import api from './api'

export interface SimEvent {
  type: 'started' | 'completed' | 'blocked'
  task: string
  bot: string
  emoji: string
  note: string
  estimated_hours?: number
  actual_hours?: number
  over_under?: number
}

export interface StepResult {
  events: SimEvent[]
  total_tasks: number
  completed_tasks: number
  in_progress_tasks: number
  blocked_tasks: number
  progress_pct: number
  drift: {
    severity: string
    schedule_drift_pct: number
    effort_drift_pct: number
    overall_drift: number
  }
  simulation_complete: boolean
}

export const simulationService = {
  step: (planId: string) =>
    api.post<StepResult>(`/api/v1/plans/${planId}/simulate/step`).then(r => r.data),

  reset: (planId: string) =>
    api.post(`/api/v1/plans/${planId}/simulate/reset`).then(r => r.data),
}
