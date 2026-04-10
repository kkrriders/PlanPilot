'use client'
import { Zap } from 'lucide-react'

interface Template {
  label: string
  goal: string
  deadline_days: string
  team_size: string
  budget_usd: string
  tech_stack: string
  notes: string
}

const TEMPLATES: Template[] = [
  {
    label: 'SaaS MVP',
    goal: 'Build a full-stack SaaS MVP with user authentication, subscription billing (Stripe), a core feature set, admin dashboard, and deployment pipeline. The product should be production-ready with monitoring and CI/CD.',
    deadline_days: '90',
    team_size: '3',
    budget_usd: '15000',
    tech_stack: 'React, FastAPI, PostgreSQL, Redis, Stripe, Docker',
    notes: 'Focus on ruthless feature prioritization. Stripe integration and auth are critical path.',
  },
  {
    label: 'Mobile App',
    goal: 'Build a cross-platform mobile app with onboarding flow, core features, push notifications, offline support, and publish to both App Store and Google Play.',
    deadline_days: '60',
    team_size: '2',
    budget_usd: '10000',
    tech_stack: 'React Native, Expo, Node.js, PostgreSQL, Firebase',
    notes: 'App Store review can take 1-2 weeks — submit early. Offline sync is highest complexity.',
  },
  {
    label: 'Data Pipeline',
    goal: 'Build an end-to-end data pipeline: ingestion from multiple sources, transformation and cleaning, data warehouse loading, scheduled orchestration, and a reporting dashboard with key business metrics.',
    deadline_days: '30',
    team_size: '2',
    budget_usd: '5000',
    tech_stack: 'Python, Airflow, dbt, Snowflake, Tableau',
    notes: 'Data quality validation is critical. Schema changes downstream are expensive — model carefully upfront.',
  },
  {
    label: 'API Integration',
    goal: 'Design, build, and document a REST API integration layer connecting two or more third-party services, with webhook handling, retry logic, error alerting, and a developer-facing SDK.',
    deadline_days: '21',
    team_size: '1',
    budget_usd: '3000',
    tech_stack: 'FastAPI, Redis, PostgreSQL, OpenAPI',
    notes: 'Treat third-party rate limits and webhook reliability as first-class concerns from day one.',
  },
  {
    label: 'Marketing Launch',
    goal: 'Plan and execute a full product launch: landing page, SEO content strategy, email campaign, social media plan, influencer outreach, launch day coordination, and post-launch analytics review.',
    deadline_days: '45',
    team_size: '4',
    budget_usd: '8000',
    tech_stack: '',
    notes: 'Launch day timing is critical path — all content approvals must happen 2 weeks prior.',
  },
]

interface Props {
  onSelect: (t: Template) => void
}

export default function PlanTemplates({ onSelect }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Zap size={14} className="text-yellow-400" />
        <h2 className="font-semibold text-white text-sm">Start from a template</h2>
        <span className="text-xs text-gray-500">(optional — pre-fills the form)</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map(t => (
          <button
            key={t.label}
            type="button"
            onClick={() => onSelect(t)}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white rounded-lg transition-all"
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
