import redis
from app.config import settings

redis_client = redis.from_url(
    settings.REDIS_URL,
    decode_responses=True
)


def get_redis():
    """Redis dependency for FastAPI"""
    return redis_client
