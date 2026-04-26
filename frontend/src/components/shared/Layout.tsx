'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { LayoutDashboard, FolderKanban, LogOut, Zap, Settings, Menu, X, Archive } from 'lucide-react'
import clsx from 'clsx'
import ToastContainer from './ToastContainer'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/plans',     label: 'Plans',     icon: FolderKanban    },
  { href: '/history',   label: 'History',   icon: Archive         },
  { href: '/settings',  label: 'Settings',  icon: Settings        },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const handleLogout = () => { logout(); router.push('/login') }

  return (
    <div className="flex h-screen bg-gray-950">
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed md:relative inset-y-0 left-0 z-50 w-56 flex flex-col',
          'bg-gray-900 border-r border-gray-800 transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="p-4 border-b border-gray-800 flex items-center gap-2">
          <Zap className="text-blue-400 flex-shrink-0" size={20} />
          <span className="font-bold text-lg text-white">PlanPilot</span>
          <button
            className="ml-auto text-gray-400 hover:text-white md:hidden"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                pathname.startsWith(href)
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="m-3 flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          <LogOut size={16} />
          Logout
        </button>
      </aside>

      {/* Content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <Menu size={20} />
          </button>
          <Zap className="text-blue-400" size={18} />
          <span className="font-bold text-white">PlanPilot</span>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>

      <ToastContainer />
    </div>
  )
}
