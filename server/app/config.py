from functools import lru_cache
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# server/ 目录（.env、storage 都在这下面）
BASE_DIR = Path(__file__).resolve().parent.parent
# .env 文件路径
ENV_FILE = BASE_DIR / ".env"

class Settings(BaseSettings):
    """
    全局配置类
    
    所有配置项都定义在这里
    Pydantic 会自动从环境变量读取
    """
    
    # 配置 Pydantic 如何读取环境变量
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),        # 从哪个文件读取
        env_file_encoding='utf-8',     # 文件编码
        case_sensitive=False,          # 不区分大小写
        extra='ignore',                # 忽略多余的环境变量
    )

    # 应用配置
    app_name: str = "RAG Agent Workbench"
    app_version: str = "0.1.0"
    app_env: str = "development"
    debug: bool = False
    api_prefix: str = "/api"

    # CORS跨域配置（允许前端访问）
    allow_origins: list[str] = Field(
        default_factory=lambda: ['http://localhost:5173']
    )

    # 文件存储配置
    storage_root: str = Field(default='storage',alias='STORAGE_ROOT')
    upload_dir_name: str = Field(default_factory=lambda: "uploads",alias='UPLOAD_DIR_NAME')
    max_upload_size_mb: int = Field(default_factory=lambda: 20,alias='MAX_UPLOAD_SIZE_MB')

    # AI模型配置
    model: str = Field(default='qwen-plus',alias='MODEL')
    embedding_model: str = Field(default='text-embedding-v1',alias='EMBEDDING_MODEL')
    dashscope_api_key: str = Field(alias='DASHSCOPE_API_KEY')
    
    # 向量数据库 Milvus配置
    milvus_uri: str | None = Field(default=None, alias='MILVUS_URI')
    milvus_host: str = Field(default='127.0.0.1', alias='MILVUS_HOST')
    milvus_port: int = Field(default=19530, alias='MILVUS_PORT')
    milvus_collection: str = Field(alias='MILVUS_COLLECTION')
    milvus_dimension: int = Field(default=1536, alias='MILVUS_DIMENSION')

    # 关系数据库
    postgres_dsn: str | None = Field(default=None, alias='POSTGRES_DSN')

    # Redis
    redis_url: str | None = Field(default=None, alias='REDIS_URL')

    # 动态生成的配置
    @property
    def resolved_milvus_uri(self) -> str:
        """
        统一的 Milvus 连接地址
        
        优先使用 MILVUS_URI，否则用 host + port 组合
        """
        if self.milvus_uri:
            return self.milvus_uri
        return f'http://{self.milvus_host}:{self.milvus_port}'
        
    @property
    def upload_dir(self) -> str:
        """上传目录的绝对路径"""
        return str(BASE_DIR / self.storage_root / self.upload_dir_name)

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    获取配置单例
    
    使用缓存确保全局只有一个配置对象
    避免重复读取 .env 文件
    
    Returns:
        Settings: 配置对象
    """
    return Settings()


settings = Settings()
