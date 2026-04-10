import { create } from 'zustand'
import type { TimelineEntry } from '../types/task'
import type { DriftMetric, ReplanPreview } from '../types/execution'
import { executionService } from '../services/executionService'

interface ExecutionState {
  timeline: TimelineEntry[]
  driftMetric: DriftMetric | null
  replanPreview: ReplanPreview | null
  loading: boolean

  fetchTimeline: (planId: string) => Promise<void>
  fetchDrift: (planId: string) => Promise<void>
  fetchReplanPreview: (planId: string) => Promise<void>
  clearReplanPreview: () => void
}

export const useExecutionStore = create<ExecutionState>((set) => ({
  timeline: [],
  driftMetric: null,
  replanPreview: null,
  loading: false,

  fetchTimeline: async (planId) => {
    set({ loading: true })
    try {
      const timeline = await executionService.getTimeline(planId)
      set({ timeline, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  fetchDrift: async (planId) => {
    try {
      const metric = await executionService.getDriftMetrics(planId)
      set({ driftMetric: metric })
    } catch {
      // Ignore drift fetch errors — plan may not have tasks yet
    }
  },

  fetchReplanPreview: async (planId) => {
    set({ loading: true })
    try {
      const preview = await executionService.previewReplan(planId)
      set({ replanPreview: preview, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  clearReplanPreview: () => set({ replanPreview: null }),
}))
