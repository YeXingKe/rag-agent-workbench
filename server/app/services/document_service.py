from typing import List, Optional
from sqlalchemy.orm import Session
from app.models import Document
from app.database import get_db


class DocumentService:
    """Document service for managing documents"""

    @staticmethod
    def create_document(db: Session, title: str, content: str = None, **kwargs) -> Document:
        """Create a new document"""
        document = Document(
            title=title,
            content=content,
            **kwargs
        )
        db.add(document)
        db.commit()
        db.refresh(document)
        return document

    @staticmethod
    def get_document(db: Session, document_id: int) -> Optional[Document]:
        """Get document by ID"""
        return db.query(Document).filter(Document.id == document_id).first()

    @staticmethod
    def list_documents(db: Session, skip: int = 0, limit: int = 100) -> List[Document]:
        """List documents"""
        return db.query(Document).offset(skip).limit(limit).all()

    @staticmethod
    def delete_document(db: Session, document_id: int) -> bool:
        """Delete document"""
        document = db.query(Document).filter(Document.id == document_id).first()
        if document:
            db.delete(document)
            db.commit()
            return True
        return False
