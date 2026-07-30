# RAG Agent Workbench

一个基于 Python Flask 后端和 React + Ant Design 前端的项目框架。

## 项目结构

```
RAG-Agent-Workbench/
├── server/           # Python Flask 后端
│   ├── app/
│   │   ├── api/      # API 路由
│   │   ├── models/   # 数据模型
│   │   ├── services/ # 业务逻辑
│   │   └── utils/    # 工具函数
│   ├── main.py
│   └── requirements.txt
├── web/              # React 前端
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/
│   └── package.json
└── README.md
```

## 快速开始

### 方式一：使用启动脚本（推荐）

**Windows:**
```bash
start.bat
```

**Linux/Mac:**
```bash
chmod +x start.sh
./start.sh
```

### 方式二：使用 npm 命令

```bash
# 安装根目录依赖
npm install

# 同时启动后端和前端
npm run dev

# 或者分别启动
npm run dev:server  # 启动后端
npm run dev:web     # 启动前端

# 安装所有依赖（首次运行）
npm run install:all
```

### 方式三：手动启动

**后端服务:**
```bash
cd server
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python main.py
```

**前端应用:**
```bash
cd web
npm install
cp .env.example .env
npm run dev
```

访问地址：
- 后端服务：http://localhost:5000
- 前端应用：http://localhost:3000

## 技术栈

### 后端
- Python 3.x
- Flask 3.0
- Flask-CORS
- Werkzeug

### 前端
- React 18
- TypeScript
- Ant Design 5
- React Router 6
- Vite

## 开发指南

详细的开发文档请参考：
- [后端文档](./server/README.md)
- [前端文档](./web/README.md)

## License

MIT