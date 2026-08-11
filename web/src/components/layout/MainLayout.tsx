import type { ReactNode } from 'react'
import Sidebar from '../common/Sidebar'
import { useUIStore } from '../../store/uiStore'

interface MainLayoutProps {
  children: ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen)

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <aside
        className={`h-full shrink-0 transition-[width] duration-300 ease-out ${
          sidebarOpen ? 'w-[248px]' : 'w-[76px]'
        }`}
      >
        <Sidebar />
      </aside>

      <main className="relative min-h-0 min-w-0 flex-1">
        <div className="absolute inset-0 overflow-y-auto overflow-x-hidden">
          <div className="box-border flex min-h-full w-full flex-col px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
