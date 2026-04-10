import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { LayoutDashboard, FolderKanban, LogOut, Zap } from 'lucide-react'
import clsx from 'clsx'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const nav = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/plans', label: 'Plans', icon: FolderKanban },
  ]

  return (
    <div className="flex h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800 flex items-center gap-2">
          <Zap className="text-blue-400" size={20} />
          <span className="font-bold text-lg text-white">PlanPilot</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                location.pathname.startsWith(to)
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>
        <button
          onClick={() => { logout(); navigate('/login') }}
          className="m-3 flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          <LogOut size={16} />
          Logout
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}
