# PlanPilot

> AI-powered project planning with drift detection, adaptive learning, and simulation.

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

You describe a goal, set constraints, and an LLM decomposes it into a structured task plan — complete with a dependency graph, critical path analysis, risk scoring, and skill-based team assignments. As work progresses, the system detects schedule and effort drift, then uses AI to replan the remaining work automatically.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Compliance Rules](#compliance-rules)
- [Simulation Mode](#simulation-mode)
- [Adaptive Learning](#adaptive-learning)
- [Environment Variables](#environment-variables)
- [Running Tests](#running-tests)
- [Troubleshooting](#troubleshooting)

---

## Features

| Feature | Description |
|---|---|
| **AI Plan Generation** | Llama 3.3-70b via Groq decomposes a goal into 8–20 tasks with dependency edges |
| **DAG + Critical Path** | ReactFlow visualizes the dependency graph; CPM identifies the critical path |
| **Kanban Board** | Tasks as 4-column cards with filters by assignee, category, and priority |
| **Gantt Timeline** | Chronological timeline view showing early/late start windows per task |
| **Team Skill Assignment** | Team member skills are injected into the LLM prompt — tasks are auto-assigned |
| **Bottleneck Detection** | Tasks blocking downstream work with overdue status surfaced above the board |
| **Compliance Enforcement** | 5 rules prevent invalid task transitions (dependency gate, evidence required, velocity anomaly, etc.) |
| **Drift Detection** | Measures schedule slippage and effort overrun; classifies severity (low → critical) |
| **Adaptive Replanning** | When drift is high/critical, AI regenerates remaining tasks adjusted for observed pace |
| **Adaptive Learning** | Per-user estimation weights update from past projects via exponential moving average |
| **Simulation Mode** | 4 scenarios with bot personalities simulate compressed project days to demo the full loop |
| **Version History** | Old tasks are preserved on regeneration and shown in a History tab |
| **Plan Templates** | 5 built-in templates pre-fill the creation form (SaaS MVP, Mobile App, Data Pipeline, etc.) |
| **CSV Export** | Download all plan tasks as a CSV from the Kanban board |
| **Toast Notifications** | Zustand-powered toast system for all user actions |
| **Responsive Layout** | Mobile-friendly sidebar with hamburger menu |

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
│  │  3.3-70b   │   │  Replanning  │                             │
│  │  3.1-8b    │   │  Engine      │                             │
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
│  team_members    │  │  Redis: token revocation + caching        │
└──────────────────┘  └────────────────────────────────────────────┘
```

### Plan creation flow

```
POST /plans          → create plan (status: draft)
POST /plans/:id/team → add team members (optional)
POST /plans/:id/generate
  → Celery picks up task
  → load adaptive weights
  → build LLM prompt (goal + constraints + team skills + learned biases)
  → Groq API (llama-3.3-70b) → raw task list
  → apply adaptive bias to estimated_hours
  → DAG builder: resolve name → UUID, cycle check, topological sort
  → CPM: compute early/late start, float, critical path
  → constraint validator: deadline / budget / team capacity checks
  → risk evaluator (llama-3.1-8b, second LLM call)
  → persist tasks + dependencies + plan version snapshot
  → plan.status = "active"
```

### Drift detection flow

```
Celery Beat (every N minutes)
  → compute_drift(plan_id)
  → schedule_drift = slippage_hours / total_planned_hours
     (actual_end − planned_end for completed tasks + overdue task penalty)
  → effort_drift   = (actual_hours − estimated_hours) / estimated_hours
  → scope_drift    = |current_task_count − v1_task_count| / v1_task_count
  → overall_drift  = 0.5×schedule + 0.3×effort + 0.2×scope
  → classify: none / low / medium / high / critical
  → if severity >= high → surface replan suggestion
```

---

## Tech Stack

**Backend**
- Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic
- Celery + Redis (async task queue, token revocation, caching)
- PostgreSQL 16 (JSONB for constraints, metadata, compliance flags)
- Groq API — `llama-3.3-70b-versatile` (planning) + `llama-3.1-8b-instant` (risk/drift)
- bcrypt for password hashing, JWT (HS256) for auth

**Frontend**
- Next.js 14 App Router, TypeScript
- Zustand (state management)
- Axios (API client with auto token refresh)
- ReactFlow (DAG visualization)
- Recharts (drift analytics charts)
- Tailwind CSS, clsx, lucide-react

**Infrastructure**
- Docker Compose (all services, health-checked startup order)
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
│   ├── pytest.ini
│   ├── alembic/
│   │   └── versions/
│   │       ├── 001_initial.py
│   │       ├── 002_add_compliance.py
│   │       └── 003_add_team_members.py
│   └── src/
│       ├── main.py                        # FastAPI app + routers
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
        │   ├── settings/page.tsx          # user profile
        │   └── plans/
        │       ├── page.tsx               # plan list
        │       ├── new/page.tsx           # create plan + team members
        │       └── [planId]/page.tsx      # plan detail (all tabs)
        ├── components/
        │   ├── planning/
        │   │   ├── KanbanBoard.tsx        # 4-column board + filters + CSV export
        │   │   ├── DagVisualization.tsx   # ReactFlow DAG graph
        │   │   ├── TeamTab.tsx            # member cards + assigned tasks
        │   │   ├── TeamMemberForm.tsx     # inline add with skill tags
        │   │   ├── PlanTemplates.tsx      # 5 one-click templates
        │   │   └── RegenerateModal.tsx    # edit constraints + re-trigger
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
        │       ├── Layout.tsx
        │       └── ToastContainer.tsx
        ├── services/                      # Axios API wrappers
        ├── store/                         # Zustand: authStore, planStore, executionStore, toastStore
        └── types/                         # TypeScript interfaces
```

---

## Getting Started

### Prerequisites

- Docker and Docker Compose
- A [Groq API key](https://console.groq.com) (free tier is sufficient)

### 1. Clone and configure

```bash
git clone https://github.com/kkrriders/PlanPilot.git
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

This starts six services in dependency order:

| Service | Port | Role |
|---|---|---|
| `postgres` | 5432 | Database (health-checked) |
| `redis` | 6379 | Queue broker + cache (health-checked) |
| `backend` | 8000 | FastAPI — runs migrations on startup |
| `celery_worker` | — | Processes planning, drift, and monitoring jobs |
| `celery_beat` | — | Triggers scheduled drift checks |
| `frontend` | 3000 | Next.js app |

### 3. Open the app

```
http://localhost:3000
```

Register an account, create a plan, and you're running.

> **Tip:** Interactive API docs are at `http://localhost:8000/docs`.

---

## API Reference

### Core endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Create account |
| `POST` | `/api/v1/auth/login` | Get access + refresh tokens |
| `POST` | `/api/v1/auth/refresh` | Refresh access token |
| `POST` | `/api/v1/plans` | Create plan (draft) |
| `POST` | `/api/v1/plans/:id/generate` | Trigger AI generation (async) |
| `GET` | `/api/v1/plans/:id/dag` | Get task dependency graph |
| `GET` | `/api/v1/plans/:id/versions` | Get version history |
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

The simulation panel (click **Simulate** on any active plan) runs bot engineers through your plan in compressed time. Choose from 4 preset scenarios — each step represents one project day:

1. **Complete in-progress tasks** — actual hours vary by bot personality (overrunners, underrunners), creating realistic drift data
2. **Start 1–3 newly unblocked tasks** — dependency-gated; only tasks whose predecessors are done become available
3. **Randomly block ~10% of tasks** — simulates real-world delays
4. **Recompute drift metrics** and update the live severity meter

After 3–4 days the drift alert fires and you can trigger adaptive replanning directly from the panel. The simulation writes to the real database and can be reset at any time.

---

## Adaptive Learning

After a plan is marked complete, the system computes actual vs estimated hours per task category. These ratios feed into per-user exponential moving averages stored as `AdaptiveWeight` records:

```
new_weight = 0.7 × old_weight + 0.3 × observed_ratio
```

Weights activate after **3+ completed plans** and are automatically applied when generating new estimates. The **Analytics → AI Learnings** panel shows what patterns the system has detected (e.g. "dev tasks run +23% over estimate across your projects").

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (asyncpg driver) |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_SECRET` | Yes | Secret key for signing tokens — keep this private |
| `GROQ_API_KEY` | Yes | API key from console.groq.com |
| `CORS_ORIGINS` | Yes | Comma-separated allowed origins |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | JWT access token lifetime (default: 60) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | JWT refresh token lifetime (default: 7) |
| `APP_ENV` | No | `development` or `production` |

---

## Running Tests

The backend has 36 unit tests using pytest:

```bash
# From inside the backend container
docker compose exec backend pytest

# Or locally (requires a running Postgres + Redis)
cd backend
pytest -v
```

Tests cover planning service, DAG builder, CPM, compliance checker, drift detector, and adaptive weights.

---

## Troubleshooting

**`backend` exits immediately on startup**
- Check that `DATABASE_URL` matches your `.env` values.
- Ensure `postgres` is healthy before `backend` starts: `docker compose ps`.

**Plan stays in `generating` status**
- The Celery worker may not be running. Check: `docker compose logs celery_worker`.
- Verify `GROQ_API_KEY` is set and valid.

**`DEPENDENCY_GATE` error when updating a task**
- All predecessor tasks must be in `done` status before you can start or complete the current task.

**Drift not updating**
- Drift is computed by Celery Beat on a schedule. Check: `docker compose logs celery_beat`.
- You can also trigger manually via `POST /api/v1/drift/:plan_id/compute`.

**Port conflicts**
- If ports 3000, 8000, 5432, or 6379 are in use, update the `ports` mappings in `docker-compose.yml`.
