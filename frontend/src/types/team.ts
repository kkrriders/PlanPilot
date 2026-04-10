export interface TeamMember {
  id: string
  plan_id: string
  name: string
  role: string
  skills: string[]
  color: string
  created_at: string
}

export interface TeamMemberCreate {
  name: string
  role: string
  skills: string[]
  color?: string
}
