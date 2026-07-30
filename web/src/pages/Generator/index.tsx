import { Card, Typography } from 'antd'

const { Title, Paragraph } = Typography

const GeneratorPage = () => {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <Card>
        <Title level={2}>生成器</Title>
        <Paragraph>
          功能页面
        </Paragraph>
      </Card>
    </div>
  )
}

export default GeneratorPage
