import MainLayout from '../components/layout/MainLayout'
import Card from '../components/common/Card'
import { MessageSquare } from 'lucide-react'

export default function AgentConversation() {
    return (
        <MainLayout>
            <h1 className="text-3xl font-bold text-slate-50 mb-8">Agent 对话</h1>
            <Card>
                <div className="flex flex-col items-center justify-center h-96 text-slate-500">
                    <MessageSquare size={64} className="mb-4 opacity-30" />
                    <p className="text-lg">暂无对话</p>
                    <p className="text-sm mt-2">开始与 Agent 对话</p>
                </div>
            </Card>
        </MainLayout>
    )
}
