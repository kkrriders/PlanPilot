import api from './api'

export interface SimEvent {
  type: 'started' | 'completed' | 'blocked'
  task: string
  task_id: string
  bot: string
  emoji: string
  note: string
  estimated_hours?: number
  actual_hours?: number
  over_under?: number
  is_on_critical_path?: boolean
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
  projected_days_remaining: number
  scenario: string
  dropped_bot: string | null
}

export type Scenario = 'optimistic' | 'realistic' | 'pessimistic' | 'key_person_leaves'

export const SCENARIO_META: Record<Scenario, { label: string; description: string; color: string }> = {
  optimistic:        { label: 'Optimistic',        description: 'Team runs ahead of schedule, rare blocks',       color: 'text-emerald-400' },
  realistic:         { label: 'Realistic',          description: 'Mixed speeds, occasional blockers (default)',    color: 'text-blue-400'    },
  pessimistic:       { label: 'Pessimistic',        description: 'Most tasks over estimate, frequent blocks',      color: 'text-orange-400'  },
  key_person_leaves: { label: 'Key Person Leaves',  description: 'A team member drops out at day 5',              color: 'text-red-400'     },
}

export const simulationService = {
  step: (planId: string, scenario: Scenario, currentDay: number) =>
    api.post<StepResult>(`/api/v1/plans/${planId}/simulate/step`, {
      scenario,
      current_day: currentDay,
    }).then(r => r.data),

  reset: (planId: string) =>
    api.post(`/api/v1/plans/${planId}/simulate/reset`).then(r => r.data),
}
