import MainLayout from '../components/layout/MainLayout'
import Card from '../components/common/Card'
import { Layers } from 'lucide-react'

export default function ChunkManagement() {
    return (
        <MainLayout>
            <h1 className="text-3xl font-bold text-slate-50 mb-8">Chunk 管理</h1>
            <Card>
                <div className="flex flex-col items-center justify-center h-96 text-slate-500">
                    <Layers size={64} className="mb-4 opacity-30" />
                    <p className="text-lg">暂无 Chunk</p>
                    <p className="text-sm mt-2">上传文档后自动生成</p>
                </div>
            </Card>
        </MainLayout>
    )
}
