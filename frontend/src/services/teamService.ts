import api from './api'
import type { TeamMember, TeamMemberCreate } from '../types/team'

export const teamService = {
  list: (planId: string) =>
    api.get<TeamMember[]>(`/api/v1/plans/${planId}/team`).then(r => r.data),

  add: (planId: string, body: TeamMemberCreate) =>
    api.post<TeamMember>(`/api/v1/plans/${planId}/team`, body).then(r => r.data),

  update: (planId: string, memberId: string, body: Partial<TeamMemberCreate>) =>
    api.patch<TeamMember>(`/api/v1/plans/${planId}/team/${memberId}`, body).then(r => r.data),

  remove: (planId: string, memberId: string) =>
    api.delete(`/api/v1/plans/${planId}/team/${memberId}`),
}
