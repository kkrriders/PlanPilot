import api from './api'
import type { Plan, PlanConstraints, DagData, PlanVersion } from '../types/plan'

export const planService = {
  create: (title: string, goal: string, constraints: PlanConstraints) =>
    api.post<Plan>('/api/v1/plans', { title, goal, constraints }).then(r => r.data),

  list: () => api.get<Plan[]>('/api/v1/plans').then(r => r.data),

  get: (id: string) => api.get<Plan>(`/api/v1/plans/${id}`).then(r => r.data),

  getStatus: (id: string) => api.get<{ status: string; risk_score?: number; confidence?: number }>(`/api/v1/plans/${id}/status`).then(r => r.data),

  getDag: (id: string) => api.get<DagData>(`/api/v1/plans/${id}/dag`).then(r => r.data),

  getVersions: (id: string) => api.get<PlanVersion[]>(`/api/v1/plans/${id}/versions`).then(r => r.data),

  update: (id: string, data: Partial<Plan>) => api.patch<Plan>(`/api/v1/plans/${id}`, data).then(r => r.data),

  delete: (id: string) => api.delete(`/api/v1/plans/${id}`),
}
