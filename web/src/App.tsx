import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import KnowledgeManagement from './pages/KnowledgeManagement'
import ChunkManagement from './pages/ChunkManagement'
import AgentConversation from './pages/AgentConversation'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/documents" element={<KnowledgeManagement />} />
        <Route path="/chunks" element={<ChunkManagement />} />
        <Route path="/agent" element={<AgentConversation />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App