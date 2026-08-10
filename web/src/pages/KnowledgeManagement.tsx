import MainLayout from '../components/layout/MainLayout'
import Card from '../components/common/Card'
import { FileText } from 'lucide-react'

export default function KnowledgeManagement() {
    return (
        <MainLayout>
            <h1 className="text-3xl font-bold text-slate-50 mb-8">文档管理</h1>
            <Card>
                <div className="flex flex-col items-center justify-center h-96 text-slate-500">
                    <FileText size={64} className="mb-4 opacity-30" />
                    <p className="text-lg">暂无文档</p>
                    <p className="text-sm mt-2">上传文档开始使用</p>
                </div>
            </Card>
        </MainLayout>
    )
}
