"""本地文件存储工具模块。"""  # 模块说明：负责上传文件的本地落盘

from __future__ import annotations  # 启用延迟类型注解（更现代的 typing 写法）

import re  # 正则：清洗文件名中的非法字符
import uuid  # 生成唯一 ID，避免文件名冲突
from pathlib import Path  # 跨平台路径处理

from fastapi import HTTPException, UploadFile, status  # FastAPI 上传对象与 HTTP 异常

from app.config import get_settings  # 读取配置（上传目录、大小限制等）

CHUNK_SIZE = 1024 * 1024  # 分块读写大小：1MB


def ensure_upload_dir() -> Path:  # 定义函数：确保上传目录存在，并返回该路径
    """确保本地上传目录存在。

    当前阶段文件先落本地，后续如果切到 OSS、S3 或 MinIO，
    只需要替换这一层的实现，不影响 service 和 API 层。
    """

    upload_dir = Path(get_settings().upload_dir)  # 从配置读取上传目录，转成 Path
    upload_dir.mkdir(parents=True, exist_ok=True)  # 创建目录（含父目录）；已存在则忽略
    return upload_dir  # 返回可用的上传目录路径


def sanitize_filename(filename: str) -> str:  # 定义函数：把原始文件名洗成安全名
    """生成安全文件名，避免路径穿越和特殊字符问题。"""

    base_name = Path(filename).name.strip()  # 只保留文件名（去掉目录），并去首尾空白
    if not base_name:  # 如果清洗后为空
        return 'unnamed.txt'  # 给一个默认文件名

    safe_name = re.sub(r'[^A-Za-z0-9._-]+', '_', base_name)  # 非法字符替换成下划线
    return safe_name or 'unnamed.txt'  # 若替换后仍空，则回退默认名


def build_storage_path(filename: str) -> Path:  # 定义函数：生成最终落盘的完整路径
    """为上传文件生成唯一存储路径。"""

    upload_dir = ensure_upload_dir()  # 确保目录存在并拿到目录路径
    safe_filename = sanitize_filename(filename)  # 先清洗原始文件名
    suffix = Path(safe_filename).suffix  # 取出扩展名（如 .pdf）
    stored_name = f'{uuid.uuid4().hex}{suffix}'  # 用 UUID + 扩展名组成唯一存储名
    return upload_dir / stored_name  # 拼接成完整保存路径并返回


async def save_upload_file(upload_file: UploadFile) -> tuple[Path, int]:  # 异步保存上传文件
    """把上传文件以分块方式保存到本地磁盘。

    Returns:
        (保存路径, 文件字节大小)
    """

    if not upload_file.filename:  # 没有文件名则视为非法请求
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='No filename provided')  # 返回 400

    settings = get_settings()  # 读取配置（含最大上传体积）
    target_path = build_storage_path(upload_file.filename)  # 生成唯一目标路径

    file_size = 0  # 累计已写入字节数
    with target_path.open('wb') as output_file:  # 以二进制写模式打开目标文件
        while True:  # 循环分块读取，直到读完
            chunk = await upload_file.read(CHUNK_SIZE)  # 异步读取最多 1MB 数据
            if not chunk:  # 读到空，说明文件结束
                break  # 退出循环

            file_size += len(chunk)  # 累加当前块大小
            if file_size > settings.max_upload_size_mb * 1024 * 1024:  # 超过上限则拒绝
                output_file.close()  # 先关闭文件句柄
                target_path.unlink(missing_ok=True)  # 删除已写入的半成品文件
                raise HTTPException(  # 抛出 413 请求体过大
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,  # HTTP 413
                    detail=f'File too large, max size is {settings.max_upload_size_mb} MB',  # 错误说明
                )
            output_file.write(chunk)  # 把当前块写入磁盘

    await upload_file.close()  # 关闭上传流，释放资源
    return target_path, file_size  # 返回保存路径和最终文件大小
