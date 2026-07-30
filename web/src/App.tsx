import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from 'antd'
import AppLayout from './components/Layout/AppLayout'
import HomePage from './pages/Home'
import GeneratorPage from './pages/Generator'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/generator" element={<GeneratorPage />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  )
}

export default App
