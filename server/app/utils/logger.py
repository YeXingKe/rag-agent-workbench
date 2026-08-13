"""项目统一日志配置模块。"""  # 模块说明：配置带颜色的终端日志输出

from __future__ import annotations  # 启用延迟类型注解

import logging  # Python 标准库日志模块
import sys  # 用于判断 stderr 是否为终端（TTY）


class ColorFormatter(logging.Formatter):  # 自定义日志格式化器，给级别名加颜色
    """为终端日志增加颜色和更醒目的级别展示。"""

    RESET = '\033[0m'  # ANSI 重置码：结束颜色/加粗
    BOLD = '\033[1m'  # ANSI 加粗码
    LEVEL_COLORS = {  # 不同日志级别对应的前景色
        logging.DEBUG: '\033[36m',  # 青色：DEBUG
        logging.INFO: '\033[32m',  # 绿色：INFO
        logging.WARNING: '\033[33m',  # 黄色：WARNING
        logging.ERROR: '\033[31m',  # 红色：ERROR
        logging.CRITICAL: '\033[35m',  # 紫色：CRITICAL
    }

    def format(self, record: logging.LogRecord) -> str:  # 重写格式化方法
        original_levelname = record.levelname  # 先保存原始级别名，避免污染后续输出
        if sys.stderr.isatty():  # 仅在真实终端里上色（重定向到文件时不上色）
            color = self.LEVEL_COLORS.get(record.levelno, '')  # 按级别编号取颜色码
            if color:  # 找到对应颜色才改写
                record.levelname = f'{self.BOLD}{color}{original_levelname}{self.RESET}'  # 加粗+着色后的级别名
        try:
            return super().format(record)  # 调用父类，按指定格式串生成最终日志文本
        finally:
            record.levelname = original_levelname  # 无论成功失败都还原，防止 Record 被复用时残留颜色码


def configure_logging() -> None:  # 配置全局根日志器
    """配置项目统一日志格式。

    这里保持实现尽量简单：
    - 只做一次全局配置；
    - 不在业务模块里重复配置 handler；
    - 日志格式优先突出时间、级别、模块名，方便本地排查问题。
    """

    root_logger = logging.getLogger()  # 获取根 logger（全局默认）
    if root_logger.handlers:  # 若已经有 handler，说明配置过了
        return  # 直接返回，避免重复添加导致日志打两遍

    handler = logging.StreamHandler()  # 创建输出到 stderr 的流处理器
    handler.setFormatter(ColorFormatter('%(asctime)s | %(levelname)s | %(name)s | %(message)s'))  # 设置带颜色的格式：时间 | 级别 | 模块名 | 内容

    root_logger.setLevel(logging.INFO)  # 根级别设为 INFO（DEBUG 默认不输出）
    root_logger.handlers.clear()  # 清空可能存在的旧 handler（双保险）
    root_logger.addHandler(handler)  # 挂上我们自定义的 handler
