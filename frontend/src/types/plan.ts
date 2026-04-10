export interface PlanConstraints {
  deadline_days?: number
  team_size?: number
  budget_usd?: number
  tech_stack?: string[]
  notes?: string
}

export interface Plan {
  id: string
  title: string
  goal: string
  constraints: PlanConstraints
  status: 'draft' | 'generating' | 'active' | 'paused' | 'completed' | 'failed'
  risk_score?: number
  confidence?: number
  current_version: number
  job_id?: string
  created_at: string
  updated_at: string
}

export interface PlanVersion {
  id: string
  plan_id: string
  version: number
  trigger: string
  snapshot: Record<string, unknown>
  created_at: string
}

export interface DagData {
  nodes: DagNode[]
  edges: DagEdge[]
  critical_path: string[]
}

export interface DagNode {
  id: string
  type: string
  data: {
    label: string
    category?: string
    status: string
    estimated_hours?: number
    priority: number
    is_on_critical_path: boolean
  }
  position?: { x: number; y: number }
}

export interface DagEdge {
  id: string
  source: string
  target: string
}
