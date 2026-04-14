import { create } from 'zustand'
import type { Plan, DagData } from '../types/plan'
import type { Task } from '../types/task'
import { planService } from '../services/planService'

interface PlanState {
  plans: Plan[]
  currentPlan: Plan | null
  currentDag: DagData | null
  currentTasks: Task[]
  loading: boolean
  error: string | null

  fetchPlans: () => Promise<void>
  fetchPlan: (id: string) => Promise<void>
  fetchDag: (id: string) => Promise<void>
  pollPlanStatus: (id: string, onReady: (plan: Plan) => void) => () => void
  setCurrentPlan: (plan: Plan | null) => void
}

export const usePlanStore = create<PlanState>((set, get) => ({
  plans: [],
  currentPlan: null,
  currentDag: null,
  currentTasks: [],
  loading: false,
  error: null,

  fetchPlans: async () => {
    set({ loading: true, error: null })
    try {
      const plans = await planService.list()
      set({ plans, loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  fetchPlan: async (id) => {
    set({ loading: true, error: null })
    try {
      const plan = await planService.get(id)
      set({ currentPlan: plan, loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  fetchDag: async (id) => {
    try {
      const dag = await planService.getDag(id)
      set({ currentDag: dag })
    } catch (e: any) {
      set({ error: e.message })
    }
  },

  pollPlanStatus: (id, onReady) => {
    const interval = setInterval(async () => {
      try {
        const status = await planService.getStatus(id)
        if (status.status === 'active' || status.status === 'failed') {
          clearInterval(interval)
          const plan = await planService.get(id)
          set((state) => ({
            plans: state.plans.map(p => p.id === id ? plan : p),
            currentPlan: plan,
          }))
          onReady(plan)
        }
      } catch {
        clearInterval(interval)
      }
    }, 2000)
    return () => clearInterval(interval)
  },

  setCurrentPlan: (plan) => set({ currentPlan: plan }),
}))
