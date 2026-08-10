import { useState } from 'react'
import { motion } from 'framer-motion'
import React from 'react'
import Sidebar from '../common/Sidebar'
import Header from '../common/Header'
import GradientBackground from '../common/GradientBackground'

interface MainLayoutProps {
    children: React.ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
    const [sidebarOpen, setSidebarOpen] = useState(true)

    return (
        <GradientBackground intensity="strong">
            <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

            <div className="flex pt-16">
                <motion.div
                    initial={false}
                    animate={{ width: sidebarOpen ? '280px' : '80px' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                    className="fixed left-0 top-16 bottom-0 z-40"
                >
                    <Sidebar isOpen={sidebarOpen} />
                </motion.div>

                <motion.main layout className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-280' : 'ml-80'}`}>
                    <div className="p-8 max-w-7xl mx-auto">{children}</div>
                </motion.main>
            </div>
        </GradientBackground>
    )
}
