import { Layout, Menu } from 'antd'
import { HomeOutlined, AppstoreOutlined } from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { ReactNode } from 'react'

const { Header, Content, Footer } = Layout

interface AppLayoutProps {
  children: ReactNode
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const navigate = useNavigate()
  const location = useLocation()

  const menuItems = [
    {
      key: '/',
      icon: <HomeOutlined />,
      label: '首页',
    },
    {
      key: '/generator',
      icon: <AppstoreOutlined />,
      label: '生成器',
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ color: 'white', fontSize: '20px', marginRight: '50px' }}>
          RAG Agent Workbench
        </div>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1, minWidth: 0 }}
        />
      </Header>
      <Content style={{ padding: '24px' }}>
        {children}
      </Content>
      <Footer style={{ textAlign: 'center' }}>
        RAG Agent Workbench ©{new Date().getFullYear()}
      </Footer>
    </Layout>
  )
}

export default AppLayout
