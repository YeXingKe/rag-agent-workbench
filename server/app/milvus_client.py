from pymilvus import connections, Collection, utility
from app.config import settings


def connect_milvus():
    """Connect to Milvus"""
    connections.connect(
        alias="default",
        host=settings.MILVUS_HOST,
        port=settings.MILVUS_PORT
    )


def disconnect_milvus():
    """Disconnect from Milvus"""
    connections.disconnect(alias="default")


def get_or_create_collection(collection_name: str, schema=None):
    """Get existing collection or create new one"""
    if utility.has_collection(collection_name):
        return Collection(collection_name)
    elif schema:
        return Collection(collection_name, schema=schema)
    else:
        raise ValueError(f"Collection {collection_name} does not exist and no schema provided")
