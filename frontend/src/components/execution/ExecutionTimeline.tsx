import { useMemo } from 'react'
import type { TimelineEntry } from '../../types/task'
import { format, differenceInHours } from 'date-fns'
import clsx from 'clsx'

interface Props {
  timeline: TimelineEntry[]
}

export default function ExecutionTimeline({ timeline }: Props) {
  const sorted = useMemo(
    () => [...timeline].sort((a, b) => {
      if (!a.planned_start) return 1
      if (!b.planned_start) return -1
      return new Date(a.planned_start).getTime() - new Date(b.planned_start).getTime()
    }),
    [timeline]
  )

  if (!sorted.length) return (
    <div className="text-center text-gray-500 py-12">No execution data yet</div>
  )

  const allDates = sorted.flatMap(t => [t.planned_start, t.planned_end, t.actual_start, t.actual_end].filter(Boolean) as string[])
  const minDate = new Date(Math.min(...allDates.map(d => new Date(d).getTime())))
  const maxDate = new Date(Math.max(...allDates.map(d => new Date(d).getTime())))
  const totalHours = differenceInHours(maxDate, minDate) || 1

  const toPercent = (date: string) =>
    (differenceInHours(new Date(date), minDate) / totalHours) * 100

  const widthPercent = (start: string, end: string) =>
    Math.max(0.5, (differenceInHours(new Date(end), new Date(start)) / totalHours) * 100)

  return (
    <div className="overflow-x-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-3 text-xs text-gray-400">
        <span className="w-44 shrink-0" />
        <div className="flex-1 flex justify-between">
          <span>{format(minDate, 'MMM d')}</span>
          <span>{format(maxDate, 'MMM d')}</span>
        </div>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {sorted.map((task) => (
          <div key={task.task_id} className="flex items-center gap-4">
            {/* Task name */}
            <div className="w-44 shrink-0">
              <p className={clsx(
                'text-xs truncate',
                task.is_on_critical_path ? 'text-yellow-400 font-medium' : 'text-gray-300'
              )}>
                {task.is_on_critical_path && '⚡ '}{task.name}
              </p>
              <p className="text-[10px] text-gray-500 capitalize">{task.status}</p>
            </div>

            {/* Bar area */}
            <div className="flex-1 relative h-8 bg-gray-800 rounded">
              {/* Planned bar */}
              {task.planned_start && task.planned_end && (
                <div
                  className={clsx(
                    'absolute top-0.5 h-3 rounded-sm opacity-60',
                    task.is_on_critical_path ? 'bg-yellow-500' : 'bg-blue-500'
                  )}
                  style={{
                    left: `${toPercent(task.planned_start)}%`,
                    width: `${widthPercent(task.planned_start, task.planned_end)}%`,
                  }}
                  title={`Planned: ${format(new Date(task.planned_start), 'MMM d HH:mm')} → ${format(new Date(task.planned_end), 'MMM d HH:mm')}`}
                />
              )}

              {/* Actual bar */}
              {task.actual_start && (
                <div
                  className={clsx(
                    'absolute bottom-0.5 h-3 rounded-sm',
                    task.status === 'completed' ? 'bg-green-500' :
                    task.is_delayed ? 'bg-red-500' : 'bg-blue-400'
                  )}
                  style={{
                    left: `${toPercent(task.actual_start)}%`,
                    width: task.actual_end
                      ? `${widthPercent(task.actual_start, task.actual_end)}%`
                      : `${toPercent(new Date().toISOString()) - toPercent(task.actual_start)}%`,
                  }}
                  title={`Actual: ${format(new Date(task.actual_start), 'MMM d HH:mm')}${task.actual_end ? ` → ${format(new Date(task.actual_end), 'MMM d HH:mm')}` : ' (in progress)'}`}
                />
              )}

              {/* Progress % overlay */}
              {task.pct_complete > 0 && (
                <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-gray-300">
                  {task.pct_complete}%
                </span>
              )}

              {/* Delay marker */}
              {task.is_delayed && (
                <span className="absolute -top-1 right-0 text-[10px] text-red-400 font-bold">!</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-4 h-2 bg-blue-500 opacity-60 rounded-sm" /> Planned</span>
        <span className="flex items-center gap-1"><span className="w-4 h-2 bg-green-500 rounded-sm" /> Actual (done)</span>
        <span className="flex items-center gap-1"><span className="w-4 h-2 bg-red-500 rounded-sm" /> Delayed</span>
        <span className="flex items-center gap-1"><span className="w-4 h-2 bg-yellow-500 opacity-60 rounded-sm" /> Critical Path</span>
      </div>
    </div>
  )
}
