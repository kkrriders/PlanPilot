import api from './api'
import type { TimelineEntry } from '../types/task'
import type { DriftMetric, ReplanPreview } from '../types/execution'

export const executionService = {
  start: (planId: string) => api.post(`/api/v1/plans/${planId}/execution/start`).then(r => r.data),

  logEvent: (planId: string, taskId: string, data: {
    event_type: string
    pct_complete: number
    note?: string
    new_status?: string
    evidence_url?: string
  }) => api.post(`/api/v1/plans/${planId}/execution/tasks/${taskId}/log`, data).then(r => r.data),

  getComplianceViolations: (planId: string) =>
    api.get(`/api/v1/plans/${planId}/execution/compliance`).then(r => r.data),

  getTimeline: (planId: string) =>
    api.get<TimelineEntry[]>(`/api/v1/plans/${planId}/execution/timeline`).then(r => r.data),

  getBottlenecks: (planId: string) =>
    api.get(`/api/v1/plans/${planId}/execution/bottlenecks`).then(r => r.data),

  getDriftMetrics: (planId: string) =>
    api.get<DriftMetric>(`/api/v1/plans/${planId}/drift/metrics`).then(r => r.data),

  getDriftHistory: (planId: string) =>
    api.get<DriftMetric[]>(`/api/v1/plans/${planId}/drift/history`).then(r => r.data),

  getDriftEvents: (planId: string) =>
    api.get(`/api/v1/plans/${planId}/drift/events`).then(r => r.data),

  previewReplan: (planId: string) =>
    api.get<ReplanPreview>(`/api/v1/plans/${planId}/drift/replan/preview`).then(r => r.data),

  applyReplan: (planId: string) =>
    api.post(`/api/v1/plans/${planId}/drift/replan`).then(r => r.data),
}
