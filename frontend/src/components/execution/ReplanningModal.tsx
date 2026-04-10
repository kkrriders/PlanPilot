import type { ReplanPreview } from '../../types/execution'
import { Plus, Trash2, Edit2, X } from 'lucide-react'

interface Props {
  preview: ReplanPreview
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export default function ReplanningModal({ preview, onConfirm, onCancel, loading }: Props) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Replan Preview</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 space-y-4 flex-1">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-400">New Risk Score</p>
              <p className="text-2xl font-bold text-white">{(preview.new_risk_score * 100).toFixed(0)}%</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-400">New Confidence</p>
              <p className="text-2xl font-bold text-green-400">{(preview.new_confidence * 100).toFixed(0)}%</p>
            </div>
          </div>

          {/* Reasoning */}
          {preview.reasoning && (
            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3 text-sm text-blue-200">
              <p className="font-medium mb-1">AI Reasoning</p>
              <p>{preview.reasoning}</p>
            </div>
          )}

          {/* Added tasks */}
          {preview.added.length > 0 && (
            <Section title={`Added (${preview.added.length})`} color="text-green-400">
              {preview.added.map((t, i) => (
                <Item key={i} icon={<Plus size={14} className="text-green-400" />}>
                  <span className="font-medium">{t.name}</span>
                  <span className="text-gray-400 ml-2">{t.estimated_hours}h · {t.category}</span>
                </Item>
              ))}
            </Section>
          )}

          {/* Removed tasks */}
          {preview.removed.length > 0 && (
            <Section title={`Removed (${preview.removed.length})`} color="text-red-400">
              {preview.removed.map((t, i) => (
                <Item key={i} icon={<Trash2 size={14} className="text-red-400" />}>
                  <span className="font-medium line-through text-gray-400">{t.name}</span>
                </Item>
              ))}
            </Section>
          )}

          {/* Modified tasks */}
          {preview.modified.length > 0 && (
            <Section title={`Modified (${preview.modified.length})`} color="text-yellow-400">
              {preview.modified.map((t, i) => (
                <Item key={i} icon={<Edit2 size={14} className="text-yellow-400" />}>
                  <span className="font-medium">{t.name}</span>
                  <span className="text-gray-400 ml-2">→ {t.new_estimated_hours}h</span>
                </Item>
              ))}
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Applying...' : 'Apply Replan'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className={`text-sm font-semibold mb-2 ${color}`}>{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Item({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded text-sm text-white">
      {icon}
      {children}
    </div>
  )
}
