import { Menu, Bell, User } from 'lucide-react'

interface HeaderProps {
    onMenuClick?: () => void
}

export default function Header({ onMenuClick }: HeaderProps) {
    return (
        <div className="fixed top-0 left-0 right-0 h-16 bg-gradient-to-r from-slate-800 to-slate-800 border-b border-slate-700/50 backdrop-blur-sm z-50">
            <div className="flex items-center justify-between h-full px-6">
                <button
                    onClick={onMenuClick}
                    className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
                >
                    <Menu size={24} className="text-slate-300" />
                </button>

                <div className="flex items-center gap-6">
                    <button className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors relative">
                        <Bell size={20} className="text-slate-300" />
                        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                    </button>

                    <button className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors">
                        <User size={20} className="text-slate-300" />
                    </button>
                </div>
            </div>
        </div>
    )
}
