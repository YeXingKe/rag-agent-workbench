import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ThemeSync from './components/common/ThemeSync'
import Dashboard from './pages/Dashboard'
import UploadIngest from './pages/UploadIngest'
import KnowledgeManagement from './pages/KnowledgeManagement'
import ChunkManagement from './pages/ChunkManagement'
import RetrievalDebug from './pages/RetrievalDebug'
import AgentConversation from './pages/AgentConversation'

function App() {
  return (
    <BrowserRouter>
      <ThemeSync />
      <div className="h-full w-full">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<UploadIngest />} />
          <Route path="/documents" element={<KnowledgeManagement />} />
          <Route path="/chunks" element={<ChunkManagement />} />
          <Route path="/retrieval" element={<RetrievalDebug />} />
          <Route path="/agent" element={<AgentConversation />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
