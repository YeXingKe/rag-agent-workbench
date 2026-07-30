import { Card, Typography } from 'antd'

const { Title, Paragraph } = Typography

const HomePage = () => {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <Card>
        <Title level={2}>欢迎使用 RAG Agent Workbench</Title>
        <Paragraph>
          这是一个基于 Python 后端和 React 前端的项目框架。
        </Paragraph>
      </Card>
    </div>
  )
}

export default HomePage
