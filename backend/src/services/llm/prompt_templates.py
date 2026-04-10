DECOMPOSITION_SYSTEM = """You are an expert project manager and software architect.
Your job is to break down a goal into concrete, actionable tasks.
Always respond with valid JSON matching the exact schema requested.
Be specific, realistic, and thorough."""

DECOMPOSITION_USER = """Break down the following project goal into a detailed task list.

GOAL: {goal}

CONSTRAINTS:
- Deadline: {deadline_days} days
- Team size: {team_size} people
- Budget: ${budget_usd}
- Tech stack: {tech_stack}
- Notes: {notes}

TEAM MEMBERS & SKILLS:
{team_context}

ADAPTIVE CONTEXT (learned from past projects):
{adaptive_context}

Return a JSON object with this exact structure:
{{
  "tasks": [
    {{
      "name": "Task name (short, action-oriented)",
      "description": "What needs to be done and why",
      "category": "design|dev|test|deploy|review|research|planning",
      "estimated_hours": 8.0,
      "priority": 2,
      "dependencies": ["name of predecessor task", ...],
      "assigned_to": "Exact team member name or null if no team defined"
    }}
  ]
}}

Rules:
- Tasks should be 2-16 hours each (not too big, not too small)
- Priority: 1=critical, 2=high, 3=medium, 4=low, 5=optional
- Dependencies reference other task names exactly
- No circular dependencies
- Include all necessary tasks from kickoff to deployment/completion
- Generate 8-20 tasks depending on project complexity
- If team members are listed, assign each task to the member whose skills best match the work
- Use EXACT team member names in "assigned_to" — do not invent names
- Distribute tasks across team members to balance workload"""

RISK_SYSTEM = """You are a risk assessment expert for software projects.
Analyze the project plan and provide risk and confidence scores.
Always respond with valid JSON."""

RISK_USER = """Assess the risk and confidence for this project plan.

GOAL: {goal}
CONSTRAINTS: {constraints}
CRITICAL PATH LENGTH: {critical_path_hours} hours
TOTAL TASKS: {total_tasks}
CRITICAL PATH TASKS: {critical_path_count}

Return JSON:
{{
  "risk_score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "risk_factors": ["list of key risks"],
  "recommendations": ["list of recommendations"]
}}

risk_score: 0=no risk, 1=extremely risky
confidence: 0=no confidence in estimates, 1=highly confident"""

REPLAN_SYSTEM = """You are an expert project manager performing dynamic replanning.
You are given a project that has deviated from its original plan.
Generate a revised task list for the REMAINING work only.
Completed tasks are frozen and cannot be changed.
Always respond with valid JSON."""

REPLAN_USER = """Replan the remaining work for this project.

ORIGINAL GOAL: {goal}
CONSTRAINTS: {constraints}

DRIFT SUMMARY:
- Schedule drift: {schedule_drift_pct:.1f}%
- Effort drift: {effort_drift_pct:.1f}%
- Severity: {severity}

COMPLETED TASKS (FROZEN - do not include these):
{completed_tasks}

REMAINING TASKS (current state - these need replanning):
{remaining_tasks}

DRIFT EVENTS:
{drift_events}

Generate a revised task list for ONLY the remaining work.
Adjust estimates based on the observed drift. You may:
- Split large tasks that are causing delays
- Merge small tasks to reduce overhead
- Add new tasks if gaps are discovered
- Remove tasks that are no longer relevant
- Reorder tasks for better efficiency

Return JSON with same structure as original decomposition:
{{
  "tasks": [
    {{
      "name": "Task name",
      "description": "Description",
      "category": "category",
      "estimated_hours": 8.0,
      "priority": 2,
      "dependencies": ["predecessor task names"],
      "assigned_to": null
    }}
  ],
  "reasoning": "Brief explanation of key changes made"
}}"""
