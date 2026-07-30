# Web Frontend

React + Ant Design 前端应用

## 项目结构

```
web/
├── src/
│   ├── components/   # 组件
│   ├── pages/        # 页面
│   ├── services/     # API 服务
│   ├── utils/        # 工具函数
│   ├── App.tsx       # 主应用组件
│   └── main.tsx      # 入口文件
├── public/           # 静态资源
└── package.json      # 依赖配置
```

## 安装依赖

```bash
cd web
npm install
```

## 配置环境变量

```bash
cp .env.example .env
```

## 运行开发服务器

```bash
npm run dev
```

应用将在 http://localhost:3000 启动

## 构建生产版本

```bash
npm run build
```

## 技术栈

- React 18
- TypeScript
- Ant Design 5
- React Router 6
- Axios
- Vite
