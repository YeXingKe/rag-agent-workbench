# Server

Python Flask 后端服务

## 项目结构

```
server/
├── app/
│   ├── api/          # API 路由
│   ├── models/       # 数据模型
│   ├── services/     # 业务逻辑
│   ├── utils/        # 工具函数
│   ├── __init__.py   # 应用工厂
│   └── config.py     # 配置文件
├── main.py           # 应用入口
└── requirements.txt  # 依赖包
```

## 安装依赖

```bash
cd server
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## 配置环境变量

```bash
cp .env.example .env
```

## 运行服务

```bash
python main.py
```

服务将在 http://localhost:5000 启动

## API 端点

- `GET /api/health` - 健康检查
