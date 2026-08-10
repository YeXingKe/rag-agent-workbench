def check_python():
    import sys
    version = sys.version_info
    print(f"✅ Python {version.major}.{version.minor}.{version.micro}")
    if version.major < 3 or (version.major == 3 and version.minor < 10):
        print("⚠️  建议使用 Python 3.10+")

def check_postgres():
    try:
        import psycopg
        print("✅ PostgreSQL 客户端已安装")
    except ImportError:
        print("❌ 需要安装：pip install psycopg[binary]")

def check_redis():
    try:
        import redis
        print("✅ Redis 客户端已安装")
    except ImportError:
        print("❌ 需要安装：pip install redis")

def check_node():
    import subprocess
    try:
        result = subprocess.run(['node', '--version'], 
                               capture_output=True, text=True)
        print(f"✅ Node.js {result.stdout.strip()}")
    except FileNotFoundError:
        print("❌ 未安装 Node.js")

if __name__ == "__main__":
    print("🔍 检查开发环境...\n")
    check_python()
    check_postgres()
    check_redis()
    check_node()
    print("\n✨ 环境检查完成！")