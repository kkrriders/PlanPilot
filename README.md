# PlanPilot

> AI-powered project planning with multi-agent orchestration, drift detection, adaptive learning, and simulation.

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

You describe a goal, set constraints, and a multi-agent LLM pipeline decomposes it into a structured task plan — complete with a dependency graph, critical path analysis, risk scoring, and skill-based team assignments. As work progresses, the system detects schedule and effort drift, then uses AI to replan the remaining work automatically. Completed projects are archived with full outcome summaries.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Multi-Agent Planning](#multi-agent-planning)
- [Planning Modes](#planning-modes)
- [Compliance Rules](#compliance-rules)
- [Simulation Mode](#simulation-mode)
- [Adaptive Learning](#adaptive-learning)
- [Project History](#project-history)
- [Environment Variables](#environment-variables)
- [Running Tests](#running-tests)
- [Troubleshooting](#troubleshooting)

---

## Features

| Feature | Description |
|---|---|
| **Multi-Agent Planning** | PlannerAgent → RiskAgent + CriticAgent run in parallel per iteration; planner revises based on challenges before plan is accepted |
| **Planning Modes** | Fast (1 pass), Accurate (3 passes, standard thresholds), Debate (3 passes, stricter acceptance criteria) |
| **Planning Debate Log** | Per-iteration risk challenges, critic issues, and planner reasoning are stored and shown in the Analytics tab |
| **DAG + Critical Path** | ReactFlow visualizes the dependency graph; CPM identifies the critical path (yellow ring on nodes) |
| **Kanban Board** | Tasks as 4-column cards with filters by assignee, category, and priority |
| **Gantt Timeline** | Chronological timeline view showing early/late start windows per task |
| **Team Skill Assignment** | Team member skills are injected into the LLM prompt — tasks are auto-assigned |
| **Bottleneck Detection** | Tasks blocking downstream work with overdue status surfaced above the board |
| **Compliance Enforcement** | 5 rules prevent invalid task transitions; dedicated Compliance tab shows all flagged events |
| **Drift Detection** | Measures schedule slippage and effort overrun; classifies severity (low → critical) |
| **Drift Event Log** | Full history of drift triggers and whether they resulted in a replan, shown in Analytics tab |
| **Adaptive Replanning** | When drift is high/critical, AI regenerates only remaining tasks — completed work is preserved |
| **Replan Preview** | Shows added/removed/modified tasks with old→new hour diff and AI-identified root cause before applying |
| **Adaptive Learning** | Per-user estimation weights update automatically after each completed task with actual hours logged |
| **Estimation Insights** | Dashboard and Analytics tab surface learned over/under-estimation patterns per task category |
| **Simulation Mode** | 4 scenarios with bot personalities simulate compressed project days to demo the full loop |
| **Version History** | Old tasks preserved on regeneration; shown in History tab |
| **Project History** | Completed plans archived to a dedicated `/history` page with outcome summaries |
| **CSV Export** | Download all plan tasks as a CSV from the plan detail header |
| **Toast Notifications** | Zustand-powered toast system; rate-limit (429) errors auto-surface a warning |
| **Responsive Layout** | Mobile-friendly sidebar with hamburger menu |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                              Browser                                  │
│                        Next.js 14 App Router                         │
│   ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌──────────────────┐  │
│   │  Kanban  │  │   DAG    │  │ Analytics  │  │   Simulation     │  │
│   │  Board   │  │  Graph   │  │ + Debate   │  │   Panel          │  │
│   └────┬─────┘  └────┬─────┘  └─────┬──────┘  └────────┬─────────┘  │
│        └─────────────┴───────────────┴──────────────────┘            │
│                       Zustand Stores + Axios                          │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ HTTP / REST
┌───────────────────────────▼──────────────────────────────────────────┐
│                        FastAPI Backend                                │
│                                                                       │
│  /auth  /plans  /tasks  /execution  /drift  /analytics  /simulation  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                  Multi-Agent Orchestrator                     │    │
│  │                                                               │    │
│  │  ┌─────────────┐    ┌─────────────┐    ┌──────────────────┐  │    │
│  │  │ PlannerAgent│───▶│  RiskAgent  │    │   CriticAgent    │  │    │
│  │  │ (llama-70b) │    │ (llama-8b)  │◀──▶│   (llama-8b)     │  │    │
│  │  └──────┬──────┘    └──────┬──────┘    └────────┬─────────┘  │    │
│  │         │                  └──────────────┬──────┘            │    │
│  │         │◀─────── revise / accept ─────────┘                  │    │
│  │         │   (up to 3 iterations; debate mode = strict)        │    │
│  └─────────┼────────────────────────────────────────────────────┘    │
│            │                                                          │
│  ┌─────────▼──────────┐   ┌──────────────┐   ┌───────────────────┐  │
│  │   Planning Service  │   │  Compliance  │   │  Adaptive Learning│  │
│  │  ┌───────────────┐  │   │  Checker     │   │  (EMA weights,    │  │
│  │  │  DAG Builder  │  │   │  (5 rules)   │   │   triggered on    │  │
│  │  │  + CPM        │  │   └──────────────┘   │   task completion)│  │
│  │  └───────────────┘  │                      └───────────────────┘  │
│  └────────────────────┘                                               │
│                                                                       │
│  ┌──────────────────────┐   ┌──────────────────────────────────────┐ │
│  │  Drift Detector      │   │  Replanning Engine                   │ │
│  │  schedule/effort/    │──▶│  (skips completed tasks, replans     │ │
│  │  scope drift %       │   │   remaining work only)               │ │
│  └──────────────────────┘   └──────────────────────────────────────┘ │
│                                                                       │
└──────────┬──────────────────────┬─────────────────────────────────────┘
           │                      │ enqueue / dequeue
┌──────────▼──────────┐  ┌────────▼──────────────────────────────────────┐
│   PostgreSQL 16      │  │  Redis 7            Celery Workers             │
│                      │  │                                                │
│  plans               │  │  Queue: planning  → generate_plan_async       │
│  tasks (versioned)   │  │  Queue: drift     → run_drift_check           │
│  execution_logs      │  │  Queue: monitoring→ check_progress            │
│  drift_metrics       │  │                                                │
│  drift_events        │  │  Celery Beat: scheduled drift checks           │
│  adaptive_weights    │  │  Redis: token revocation + plan preview cache  │
│  plan_versions       │  │         (5 min TTL for replan previews)        │
│  team_members        │  └────────────────────────────────────────────────┘
└─────────────────────┘
```

### Plan generation flow

```
POST /plans/:id/generate?mode=accurate
  → Celery picks up task
  → load adaptive weights + team context
  → load completed tasks from current version (preserved on regeneration)
  → Multi-Agent Orchestrator (up to 3 iterations):
      iteration N:
        PlannerAgent (llama-3.3-70b)
          → if N > 0: injects risk challenges + critic issues into prompt
          → outputs: tasks[], reasoning, confidence
        RiskAgent + CriticAgent run in parallel (llama-3.1-8b each)
          → risk: score, risk_factors, challenges
          → critic: score/10, verdict (accept/revise), issues[], strengths[]
        if risk_score ≤ threshold AND verdict == "accept" → break
  → debate_log saved to PlanVersion.snapshot
  → apply adaptive bias to estimated_hours
  → DAG builder: resolve name→UUID, cycle check, topological sort, CPM
  → constraint validator: deadline / budget / team capacity
  → carry over completed/in-progress tasks to new version
  → persist tasks + dependencies + version snapshot
  → plan.status = "active"
```

### Drift detection flow

```
Celery Beat (every N minutes)
  → compute_drift(plan_id)
  → schedule_drift = slippage_hours / total_planned_hours
  → effort_drift   = (actual_hours − estimated_hours) / estimated_hours
  → scope_drift    = |current_task_count − v1_task_count| / v1_task_count
  → overall_drift  = 0.5×schedule + 0.3×effort + 0.2×scope
  → classify: none / low / medium / high / critical
  → log DriftEvent (with was_replanned flag)
  → if severity >= high → surface replan suggestion
```

---

## Tech Stack

**Backend**
- Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic
- Celery + Redis (async task queue, token revocation, replan preview cache)
- PostgreSQL 16 (JSONB for constraints, metadata, debate logs, compliance flags)
- Groq API — `llama-3.3-70b-versatile` (planner) + `llama-3.1-8b-instant` (risk agent, critic agent, drift)
- bcrypt for password hashing, PyJWT (HS256) with Redis-backed token revocation

**Frontend**
- Next.js 14 App Router, TypeScript
- Zustand (authStore, planStore, executionStore, toastStore)
- Axios with auto token refresh interceptor + 429 rate-limit toast
- ReactFlow (DAG visualization with topological layout)
- Recharts (drift breakdown, velocity, est vs actual hours charts)
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
│   └── src/
│       ├── main.py                         # FastAPI app + routers
│       ├── core/
│       │   ├── config.py                   # Settings (env vars)
│       │   ├── database.py                 # Async SQLAlchemy engine
│       │   ├── security.py                 # JWT + bcrypt
│       │   └── dependencies.py             # get_current_user
│       ├── models/
│       │   ├── user.py
│       │   ├── plan.py                     # Plan, PlanVersion
│       │   ├── task.py                     # Task, TaskDependency
│       │   ├── execution.py                # ExecutionLog, Checkpoint
│       │   ├── drift.py                    # DriftMetric, DriftEvent
│       │   ├── learning.py                 # AdaptiveWeight, FeedbackLog
│       │   └── team.py                     # TeamMember
│       ├── schemas/                        # Pydantic request/response models
│       ├── routes/
│       │   ├── auth.py                     # register, login, refresh, logout
│       │   ├── plans.py                    # CRUD, /generate, /complete, /archived
│       │   │                               # /dag, /history, /reasoning, /versions
│       │   ├── tasks.py
│       │   ├── execution.py                # log_event, compliance, bottlenecks
│       │   ├── drift.py                    # metrics, history, events, replan
│       │   ├── analytics.py                # summary, accuracy, velocity, weights
│       │   ├── team.py
│       │   └── simulation.py               # /step, /reset
│       ├── agents/
│       │   ├── base_agent.py               # BaseAgent ABC
│       │   ├── shared_memory.py            # Cross-agent state (goal, constraints,
│       │   │                               # completed_tasks, iteration outputs)
│       │   ├── multi_agent_orchestrator.py # Coordinates iterations, builds debate_log
│       │   ├── planner_agent.py            # Generates task list; injects completed
│       │   │                               # tasks + revision feedback each pass
│       │   ├── risk_agent.py               # Scores risk, emits challenges
│       │   ├── critic_agent.py             # Reviews plan quality, accept/revise
│       │   ├── drift_agent.py              # Analyzes drift root cause
│       │   └── replanner_agent.py          # Replans remaining (not completed) tasks
│       ├── services/
│       │   ├── llm/
│       │   │   └── groq_provider.py        # AsyncGroq client, complete/complete_json
│       │   ├── planning/
│       │   │   ├── task_planner.py         # Orchestrates generation + carry-over logic
│       │   │   ├── dag_builder.py          # LLM output → DAG + CPM scheduling
│       │   │   └── constraint_engine.py    # Deadline / budget / capacity checks
│       │   ├── execution/
│       │   │   └── tracker.py              # log_event(), get_timeline()
│       │   ├── drift/
│       │   │   ├── detector.py             # compute_drift()
│       │   │   └── replanning_engine.py    # AI replan preview + apply
│       │   ├── compliance/
│       │   │   └── checker.py              # 5 enforcement rules
│       │   ├── learning/
│       │   │   └── adaptive_weights.py     # EMA upsert; triggered on task completion
│       │   └── simulation/
│       │       └── simulator.py            # Bot engineers, compressed-day steps
│       ├── workers/
│       │   ├── celery_app.py
│       │   ├── planning_tasks.py           # generate_plan_async
│       │   └── drift_tasks.py              # scheduled drift checks
│       └── utils/
│           └── graph.py                    # Topological sort, CPM, cycle detection
│
└── frontend/
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx                    # redirect → /dashboard
        │   ├── login/page.tsx
        │   ├── register/page.tsx
        │   ├── dashboard/page.tsx          # stats + recent plans + estimation insights
        │   ├── history/page.tsx            # archived completed projects with summaries
        │   ├── settings/page.tsx
        │   └── plans/
        │       ├── page.tsx                # plan list (excludes completed)
        │       ├── new/page.tsx            # create plan + team members
        │       └── [planId]/page.tsx       # plan detail (7 tabs + Mark Complete)
        ├── components/
        │   ├── planning/
        │   │   ├── KanbanBoard.tsx         # 4-column board; skipped tasks hidden
        │   │   ├── DagVisualization.tsx    # ReactFlow DAG; stale-edge safe
        │   │   ├── TeamTab.tsx
        │   │   ├── PlanTemplates.tsx
        │   │   └── RegenerateModal.tsx     # mode selector (Fast/Accurate/Debate)
        │   ├── execution/
        │   │   ├── TaskUpdateModal.tsx
        │   │   ├── ExecutionTimeline.tsx
        │   │   ├── DriftAlertBanner.tsx
        │   │   ├── DriftAnalyticsTab.tsx   # drift charts, debate log, AI learnings,
        │   │   │                           # drift event log
        │   │   ├── ReplanningModal.tsx     # old→new hours diff, drift root cause
        │   │   └── ComplianceTab.tsx       # per-event compliance flags
        │   ├── simulation/
        │   │   └── SimulationPanel.tsx
        │   └── shared/
        │       ├── AuthGuard.tsx
        │       ├── Layout.tsx              # sidebar with History nav link
        │       └── ToastContainer.tsx
        ├── services/
        │   ├── api.ts                      # Axios; 401 refresh + 429 toast interceptors
        │   ├── planService.ts              # plans CRUD, generate(mode), complete,
        │   │                              # listArchived, getReasoning, getHistory
        │   └── executionService.ts         # log, compliance, drift, replan
        ├── store/                          # Zustand: authStore, planStore,
        │                                  # executionStore, toastStore
        └── types/                          # TypeScript interfaces
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
| `redis` | 6379 | Queue broker + token revocation + cache |
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
| `POST` | `/api/v1/auth/refresh` | Rotate refresh token |
| `POST` | `/api/v1/auth/logout` | Revoke refresh token |
| `GET` | `/api/v1/plans` | List active plans (excludes completed) |
| `POST` | `/api/v1/plans` | Create plan (draft) |
| `POST` | `/api/v1/plans/:id/generate?mode=accurate` | Trigger AI generation (async) |
| `POST` | `/api/v1/plans/:id/complete` | Mark plan complete and archive it |
| `GET` | `/api/v1/plans/archived` | List completed plans with summary stats |
| `GET` | `/api/v1/plans/:id/dag` | Get task dependency graph (current version) |
| `GET` | `/api/v1/plans/:id/reasoning` | Get debate log + planner reasoning for latest version |
| `GET` | `/api/v1/plans/:id/history` | Get tasks from previous versions grouped by version |
| `GET` | `/api/v1/plans/:id/versions` | Get all plan version snapshots |
| `POST` | `/api/v1/plans/:id/execution/tasks/:task_id/log` | Log task event (compliance enforced) |
| `GET` | `/api/v1/plans/:id/execution/compliance` | Get all compliance-flagged events |
| `GET` | `/api/v1/plans/:id/execution/bottlenecks` | Get blocking tasks |
| `GET` | `/api/v1/plans/:id/drift/metrics` | Get latest drift metrics |
| `GET` | `/api/v1/plans/:id/drift/events` | Get drift event log |
| `GET` | `/api/v1/plans/:id/drift/replan/preview` | Generate replan preview (cached 5 min) |
| `POST` | `/api/v1/plans/:id/drift/replan` | Apply previewed replan |
| `GET` | `/api/v1/analytics/weights` | Get adaptive learning weights |
| `POST` | `/api/v1/plans/:id/simulate/step` | Advance simulation one day |
| `POST` | `/api/v1/plans/:id/simulate/reset` | Reset simulation |

---

## Multi-Agent Planning

Plan generation uses three specialised agents that iterate in a feedback loop:

```
Iteration 1..N (max depends on mode):

  PlannerAgent (llama-3.3-70b)
    Input:  goal, constraints, team, adaptive context,
            completed tasks (preserved — not regenerated),
            previous risk challenges + critic issues (iteration > 0)
    Output: tasks[], reasoning, confidence

  ↓ parallel

  RiskAgent (llama-3.1-8b)           CriticAgent (llama-3.1-8b)
    Output: risk_score 0–1              Output: score 0–10
            risk_factors[]                      verdict: accept | revise
            challenges[]                        issues[] {type, task, description}
                                                strengths[]

  Accept if: risk_score ≤ threshold AND verdict == "accept"
  Otherwise: feed challenges + issues back into next PlannerAgent call
```

The full per-iteration record (reasoning, challenges, issues, scores, verdict) is stored as `debate_log` in the plan version snapshot and shown in the **Analytics → Planning Debate** section.

---

## Planning Modes

Select the mode in the **Edit & Regenerate** modal or via `?mode=` query param:

| Mode | Max Iterations | Risk Threshold | When to use |
|---|---|---|---|
| `fast` | 1 | 0.70 | Quick draft, no revision loop |
| `accurate` | 3 | 0.70 | Default — balances quality and speed |
| `debate` | 3 | 0.50 | Highest quality; stricter acceptance, harder to satisfy |

---

## Compliance Rules

Every task event logged through the API is checked against 5 rules. Errors block the action; warnings are stored as flags visible in the **Compliance** tab.

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

1. **Complete in-progress tasks** — actual hours vary by bot personality (overrunners, underrunners), generating realistic drift data
2. **Start 1–3 newly unblocked tasks** — dependency-gated; only tasks whose predecessors are done become available
3. **Randomly block ~10% of tasks** — simulates real-world delays
4. **Recompute drift metrics** and update the live severity meter

After 3–4 days the drift alert fires and you can trigger adaptive replanning directly from the panel. The simulation writes to the real database and can be reset at any time.

---

## Adaptive Learning

The system learns your estimation patterns incrementally:

- **Trigger:** every time a task is marked `completed` with `actual_hours` logged
- **What it computes:** `actual_hours / estimated_hours` ratio per task category
- **Storage:** exponential moving average in `AdaptiveWeight` records per user:
  ```
  new_weight = 0.7 × old_weight + 0.3 × observed_ratio
  ```
- **Activation:** weights apply to new plan estimates after **3+ observations** for a category
- **Where it shows:**
  - **Dashboard** — Estimation Insights card (appears once enough data exists)
  - **Analytics tab → AI Learnings** — full breakdown with sample count and confidence

When regenerating a plan, these weights are automatically applied to `estimated_hours` for each task category before saving.

---

## Project History

Completed plans are removed from the active plan list and archived to the **History** page (`/history`).

### Completing a plan

Click **Mark Complete** on any active plan detail page. This:
1. Sets `plan.status = "completed"`
2. Triggers a final adaptive weight update from all completed tasks
3. Redirects to `/history`

### History page

Each archived project shows a summary card with:

| Metric | Description |
|---|---|
| Completion rate | `completed_tasks / total_tasks` |
| Duration | Days from project creation to completion |
| Estimated vs actual hours | Total est. hours and total logged actual hours |
| Hours variance | `(actual − estimated) / estimated × 100%` |
| Versions | Number of times the plan was regenerated |
| Drift events | Total drift triggers recorded during execution |

Clicking a card navigates back to the archived plan detail for full inspection.

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

Tests cover: planning service, DAG builder, CPM, compliance checker, drift detector, adaptive weights, and schema validators.

---

## Troubleshooting

**`backend` exits immediately on startup**
- Check that `DATABASE_URL` matches your `.env` values.
- Ensure `postgres` is healthy: `docker compose ps`.

**Plan stays in `generating` status**
- The Celery worker may not be running: `docker compose logs celery_worker`.
- Verify `GROQ_API_KEY` is set and valid (Groq has a free tier with rate limits — generation may take 20–40 seconds under the 70b model).

**`DEPENDENCY_GATE` error when updating a task**
- All predecessor tasks must be in `completed` status before you can start or complete the current task.

**Drift not updating**
- Drift is computed by Celery Beat on a schedule: `docker compose logs celery_beat`.
- Trigger manually via `POST /api/v1/drift/:plan_id/compute`.

**Estimation insights not appearing on dashboard**
- Insights require at least 3 completed tasks with `actual_hours` logged (per category).
- Log a task event with `new_status: completed` and an `actual_hours` value to accumulate data.

**Port conflicts**
- If ports 3000, 8000, 5432, or 6379 are in use, update the `ports` mappings in `docker-compose.yml`.
