from langchain.chat_models import ChatOpenAI
from langchain.embeddings import OpenAIEmbeddings
from app.config import settings


def get_dashscope_llm():
    """Get DashScope LLM instance"""
    # TODO: Implement DashScope integration
    # from langchain_community.llms import Tongyi
    # return Tongyi(dashscope_api_key=settings.DASHSCOPE_API_KEY)
    pass


def get_embeddings():
    """Get embeddings model"""
    # TODO: Implement embeddings model
    pass
