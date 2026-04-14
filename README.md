# PlanPilot

PlanPilot is an AI-powered project planning and execution tracking tool. You describe a goal, set constraints, and an LLM breaks it into a structured task plan — complete with a dependency graph, critical path, risk score, and skill-based team assignments. As work progresses, the system detects drift from the original plan and uses AI to replan the remaining work automatically.

---

## Features

| Feature | Description |
|---|---|
| **AI Plan Generation** | LLM (Llama 3.3-70b via Groq) decomposes a goal into 8–20 tasks with dependencies |
| **DAG + Critical Path** | Tasks are arranged into a dependency graph; CPM identifies the critical path |
| **Kanban Board** | Tasks displayed as Trello-style cards with filters by assignee, category, priority |
| **Team Skill Assignment** | Team members and their skills are injected into the LLM prompt — tasks are auto-assigned |
| **Compliance Enforcement** | 5 rules prevent fake task progression (dependency gate, evidence required, no-skip, velocity anomaly) |
| **Drift Detection** | Measures schedule slippage and effort overrun; classifies severity (low → critical) |
| **Adaptive Replanning** | When drift is significant, AI regenerates remaining tasks adjusted for observed pace |
| **Adaptive Learning** | Per-user estimation weights update from past projects via exponential moving average |
| **Simulation Mode** | Bot engineers simulate compressed project days to demo the full planning → drift → replan loop |
| **Plan Templates** | 5 built-in templates pre-fill the creation form (SaaS MVP, Mobile App, Data Pipeline, etc.) |
| **Export to CSV** | Download all tasks as a CSV from the Kanban board |
| **Plan Versioning** | Every regeneration creates a snapshot; version history is preserved |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│                    Next.js 14 App Router                        │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│   │  Kanban  │  │  Team    │  │Analytics │  │  Simulation  │  │
│   │  Board   │  │  Tab     │  │  Tab     │  │  Panel       │  │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│        └─────────────┴──────────────┴────────────────┘          │
│                     Zustand Stores + Axios                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP / REST
┌──────────────────────────▼──────────────────────────────────────┐
│                     FastAPI Backend                              │
│                                                                  │
│  /auth   /plans   /tasks   /execution   /drift   /analytics     │
│  /team   /simulation                                             │
│                                                                  │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────────┐  │
│  │  Planning   │   │  Execution   │   │  Compliance Checker  │  │
│  │  Service    │   │  Tracker     │   │  (5 rules, enforced  │  │
│  │  ┌────────┐ │   │              │   │   at API boundary)   │  │
│  │  │DAG     │ │   └──────┬───────┘   └──────────────────────┘  │
│  │  │Builder │ │          │                                      │
│  │  │+ CPM   │ │   ┌──────▼───────┐   ┌──────────────────────┐  │
│  │  └────────┘ │   │   Drift      │   │  Adaptive Learning   │  │
│  └──────┬──────┘   │   Detector   │   │  (EMA weights per    │  │
│         │          └──────┬───────┘   │   user/category)     │  │
│  ┌──────▼──────┐          │           └──────────────────────┘  │
│  │  Groq LLM  │   ┌──────▼───────┐                             │
│  │  (llama    │   │  Replanning  │                             │
│  │  3.3-70b)  │   │  Engine      │                             │
│  └────────────┘   └──────────────┘                             │
│                                                                  │
└───────────┬───────────────┬────────────────────────────────────┘
            │               │ enqueue / dequeue
┌───────────▼──────┐  ┌────▼──────────────────────────────────────┐
│   PostgreSQL 16  │  │  Redis 7          Celery Workers           │
│                  │  │                                            │
│  plans           │  │  Queue: planning  → generate_plan_async   │
│  tasks           │  │  Queue: drift     → run_drift_check       │
│  execution_logs  │  │  Queue: monitoring→ check_progress        │
│  drift_metrics   │  │                                           │
│  adaptive_weights│  │  Celery Beat: scheduled drift checks      │
│  team_members    │  └────────────────────────────────────────────┘
└──────────────────┘
```

### Request flow — plan creation

```
POST /plans          → create plan (status: draft)
POST /plans/:id/team → add team members (optional)
POST /plans/:id/generate
  → Celery picks up task
  → load adaptive weights
  → build LLM prompt (goal + constraints + team skills + learned biases)
  → Groq API → raw task list
  → apply adaptive bias to estimated_hours
  → DAG builder: resolve name→UUID, cycle check, topological sort
  → CPM: compute early/late start, float, critical path
  → constraint validator: check deadline / budget / team capacity
  → risk evaluator (second LLM call)
  → persist tasks + dependencies + plan version snapshot
  → plan.status = "active"
```

### Drift detection flow

```
Celery Beat (every N minutes)
  → compute_drift(plan_id)
  → schedule_drift = slippage_hours / total_planned_hours
     (actual_end - planned_end for completed tasks + overdue task penalty)
  → effort_drift   = (actual_hours - estimated_hours) / estimated_hours
  → scope_drift    = |current_task_count - v1_task_count| / v1_task_count
  → overall_drift  = 0.5×schedule + 0.3×effort + 0.2×scope
  → classify: none / low / medium / high / critical
  → if severity >= high → surface replan suggestion
```

---

## Tech Stack

**Backend**
- Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic
- Celery + Redis (async task queue)
- PostgreSQL 16 (JSONB for constraints, metadata, compliance flags)
- Groq API — `llama-3.3-70b-versatile`
- bcrypt for password hashing, JWT (HS256) for auth

**Frontend**
- Next.js 14 App Router, TypeScript
- Zustand (state management)
- Axios (API client with auto token refresh)
- Recharts (drift analytics charts)
- Tailwind CSS, clsx, lucide-react

**Infrastructure**
- Docker Compose (all services)
- Celery Beat (scheduled drift checks)
- Three Celery queues: `planning`, `monitoring`, `drift`

---

## Project Structure

```
PlanPilot/
├── docker-compose.yml
├── .env
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic/
│   │   └── versions/
│   │       ├── 001_initial.py
│   │       ├── 002_add_compliance.py
│   │       └── 003_add_team_members.py
│   └── src/
│       ├── main.py                        # FastAPI app, routers
│       ├── core/
│       │   ├── config.py                  # Settings (env vars)
│       │   ├── database.py                # Async SQLAlchemy engine
│       │   ├── security.py                # JWT + bcrypt
│       │   └── dependencies.py            # get_current_user
│       ├── models/
│       │   ├── user.py
│       │   ├── plan.py                    # Plan, PlanVersion
│       │   ├── task.py                    # Task, TaskDependency
│       │   ├── execution.py               # ExecutionLog, Checkpoint
│       │   ├── drift.py                   # DriftMetric, DriftEvent
│       │   ├── learning.py                # AdaptiveWeight, FeedbackLog
│       │   └── team.py                    # TeamMember
│       ├── schemas/                       # Pydantic request/response models
│       ├── routes/
│       │   ├── auth.py                    # register, login, refresh
│       │   ├── plans.py                   # CRUD + /generate + /dag
│       │   ├── tasks.py
│       │   ├── execution.py               # log_event, compliance endpoint
│       │   ├── drift.py
│       │   ├── analytics.py               # summary, accuracy, velocity, weights
│       │   ├── team.py                    # team member CRUD
│       │   └── simulation.py              # /step, /reset
│       ├── services/
│       │   ├── llm/
│       │   │   ├── groq_provider.py       # Groq API client
│       │   │   └── prompt_templates.py    # DECOMPOSITION, RISK, REPLAN prompts
│       │   ├── planning/
│       │   │   ├── task_planner.py        # Orchestrates full generation pipeline
│       │   │   ├── dag_builder.py         # LLM output → DAG + CPM scheduling
│       │   │   ├── constraint_engine.py   # Deadline / budget / capacity checks
│       │   │   └── plan_evaluator.py      # Risk scoring (second LLM call)
│       │   ├── execution/
│       │   │   ├── tracker.py             # log_event(), get_timeline()
│       │   │   └── progress_monitor.py
│       │   ├── drift/
│       │   │   ├── detector.py            # compute_drift()
│       │   │   └── replanning_engine.py   # AI replan of remaining tasks
│       │   ├── compliance/
│       │   │   └── checker.py             # 5 enforcement rules
│       │   ├── learning/
│       │   │   └── adaptive_weights.py    # EMA weight updates after completion
│       │   └── simulation/
│       │       └── simulator.py           # Bot engineers, compressed-day steps
│       ├── workers/
│       │   ├── celery_app.py
│       │   ├── planning_tasks.py          # generate_plan_async
│       │   ├── execution_tasks.py
│       │   └── drift_tasks.py             # scheduled drift checks
│       └── utils/
│           └── graph.py                   # Topological sort, CPM, cycle detection
│
└── frontend/
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx                   # redirect to /dashboard
        │   ├── login/page.tsx
        │   ├── register/page.tsx
        │   ├── dashboard/page.tsx
        │   └── plans/
        │       ├── page.tsx               # plan list
        │       ├── new/page.tsx           # create plan + team members
        │       └── [planId]/page.tsx      # plan detail (all tabs)
        ├── components/
        │   ├── planning/
        │   │   ├── KanbanBoard.tsx        # 4-column board + filters + CSV export
        │   │   ├── TeamTab.tsx            # member cards + assigned tasks
        │   │   ├── TeamMemberForm.tsx     # inline add with skill tags
        │   │   ├── PlanTemplates.tsx      # 5 one-click templates
        │   │   ├── RegenerateModal.tsx    # edit constraints + re-trigger
        │   │   └── DagVisualization.tsx   # DAG graph view
        │   ├── execution/
        │   │   ├── TaskUpdateModal.tsx    # log events + compliance hints
        │   │   ├── ExecutionTimeline.tsx
        │   │   ├── DriftAlertBanner.tsx
        │   │   ├── DriftAnalyticsTab.tsx  # charts + AI learnings panel
        │   │   └── ReplanningModal.tsx
        │   ├── simulation/
        │   │   └── SimulationPanel.tsx    # side panel, bot log, drift meter
        │   └── shared/
        │       ├── AuthGuard.tsx
        │       └── Layout.tsx
        ├── services/                      # Axios API wrappers
        ├── store/                         # Zustand: authStore, planStore, executionStore
        └── types/                         # TypeScript interfaces
```

---

## Getting Started

### Prerequisites

- Docker and Docker Compose
- A [Groq API key](https://console.groq.com)

### 1. Clone and configure

```bash
git clone https://github.com/your-username/PlanPilot.git
cd PlanPilot
```

Create a `.env` file in the root:

```env
# Database
POSTGRES_USER=planpilot
POSTGRES_PASSWORD=planpilot
POSTGRES_DB=planpilot
DATABASE_URL=postgresql+asyncpg://planpilot:planpilot@postgres:5432/planpilot

# Redis
REDIS_URL=redis://redis:6379/0

# Auth — generate with: openssl rand -hex 32
JWT_SECRET=your_jwt_secret_here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# Groq
GROQ_API_KEY=your_groq_api_key_here

# App
APP_ENV=development
APP_NAME=PlanPilot
CORS_ORIGINS=http://localhost:3000
```

### 2. Start all services

```bash
docker compose up --build
```

This starts:
- `postgres` — database on port 5432
- `redis` — queue broker on port 6379
- `backend` — FastAPI on port 8000 (runs migrations on startup)
- `celery_worker` — processes planning, drift, and monitoring jobs
- `celery_beat` — scheduled drift check triggers
- `frontend` — Next.js on port 3000

### 3. Open the app

```
http://localhost:3000
```

Register an account, create a plan, and you're running.

---

## API Reference

Interactive docs are available at `http://localhost:8000/docs` once the backend is running.

### Core endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Create account |
| `POST` | `/api/v1/auth/login` | Get access + refresh tokens |
| `POST` | `/api/v1/plans` | Create plan (draft) |
| `POST` | `/api/v1/plans/:id/generate` | Trigger AI generation |
| `GET` | `/api/v1/plans/:id/dag` | Get task graph |
| `POST` | `/api/v1/plans/:id/team` | Add team member |
| `POST` | `/api/v1/execution/:plan_id/tasks/:task_id/events` | Log task event (compliance enforced) |
| `GET` | `/api/v1/execution/:plan_id/compliance` | Get compliance violations |
| `GET` | `/api/v1/drift/:plan_id` | Get latest drift metrics |
| `POST` | `/api/v1/drift/:plan_id/replan` | Trigger AI replanning |
| `GET` | `/api/v1/analytics/weights` | Get adaptive learning weights |
| `POST` | `/api/v1/plans/:id/simulate/step` | Advance simulation one day |
| `POST` | `/api/v1/plans/:id/simulate/reset` | Reset simulation |

---

## Compliance Rules

Every task event logged through the API is checked against 5 rules. Errors block the action; warnings are stored as flags.

| Code | Severity | Rule |
|---|---|---|
| `NOTE_REQUIRED` | Error | Every event must include a note of at least 10 characters |
| `DEPENDENCY_GATE` | Error | Cannot start or complete a task while predecessor tasks are still pending |
| `NO_SKIP_GATE` | Error | A task must be started before it can be marked complete |
| `EVIDENCE_REQUIRED` | Error | Completion requires a PR/commit URL, or a note of 50+ characters |
| `VELOCITY_ANOMALY` | Warning | Flagged when a task completes in under 20% of its estimated duration |

---

## Simulation Mode

The simulation panel (click **Simulate** on any active plan) runs bot engineers through your plan in compressed time. Each "day" step:

1. Completes all in-progress tasks — actual hours vary by bot personality (some consistently run over estimate, creating real drift data)
2. Starts 1–3 newly ready tasks (dependency-gated)
3. Randomly blocks ~10% of tasks
4. Recomputes drift metrics and updates the live meter

After 3–4 days the drift alert fires and you can trigger adaptive replanning directly from the panel. The simulation writes directly to the database and can be reset at any time.

---

## How Adaptive Learning Works

After a plan is marked complete, the system computes actual vs estimated hours per task category. These ratios feed into per-user exponential moving averages stored as `AdaptiveWeight` records:

```
new_weight = 0.7 × old_weight + 0.3 × observed_ratio
```

Weights activate after 3+ completed plans and are automatically applied when generating new estimates. The **Analytics → AI Learnings** panel shows what patterns the system has detected (e.g. "dev tasks run +23% over estimate across your projects").

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (asyncpg driver) |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret key for signing tokens — keep this private |
| `GROQ_API_KEY` | API key from console.groq.com |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | JWT refresh token lifetime |
