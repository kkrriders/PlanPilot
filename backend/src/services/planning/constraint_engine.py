from dataclasses import dataclass


@dataclass
class ConstraintResult:
    is_feasible: bool
    violations: list[str]
    warnings: list[str]


def validate_constraints(
    constraints: dict,
    tasks: list[dict],
    critical_path_hours: float,
) -> ConstraintResult:
    violations: list[str] = []
    warnings: list[str] = []

    deadline_days = constraints.get("deadline_days")
    team_size = constraints.get("team_size") or 1
    budget_usd = constraints.get("budget_usd")

    total_hours = sum(t.get("estimated_hours", 0) for t in tasks)
    avg_hourly_rate = 75  # USD/hour default

    # Deadline check: critical path must fit within deadline
    if deadline_days:
        available_hours = deadline_days * 8 * team_size
        critical_path_days = critical_path_hours / 8

        if critical_path_days > deadline_days:
            violations.append(
                f"Critical path ({critical_path_days:.1f} days) exceeds deadline ({deadline_days} days). "
                f"Need to parallelize or reduce scope."
            )
        elif critical_path_days > deadline_days * 0.8:
            warnings.append(
                f"Critical path ({critical_path_days:.1f} days) uses {critical_path_days/deadline_days*100:.0f}% "
                f"of the deadline — very little buffer."
            )

        if total_hours > available_hours:
            warnings.append(
                f"Total estimated work ({total_hours:.0f}h) exceeds team capacity "
                f"({available_hours:.0f}h = {deadline_days}d × 8h × {team_size} people)."
            )

    # Budget check
    if budget_usd:
        estimated_cost = total_hours * avg_hourly_rate
        if estimated_cost > budget_usd:
            violations.append(
                f"Estimated cost (${estimated_cost:,.0f} at ${avg_hourly_rate}/hr) exceeds budget (${budget_usd:,.0f})."
            )
        elif estimated_cost > budget_usd * 0.85:
            warnings.append(
                f"Estimated cost (${estimated_cost:,.0f}) is within 15% of budget — limited contingency."
            )

    # Team parallelism check
    if team_size == 1 and len(tasks) > 15:
        warnings.append(
            f"Solo project with {len(tasks)} tasks — consider whether any tasks can be simplified or dropped."
        )

    return ConstraintResult(
        is_feasible=len(violations) == 0,
        violations=violations,
        warnings=warnings,
    )
