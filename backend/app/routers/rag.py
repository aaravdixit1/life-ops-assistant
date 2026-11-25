from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from ..services import rag_indexer

router = APIRouter()


class IndexTextRequest(BaseModel):
    source_path: str
    content: str
    source_type: str = "local_file"
    metadata: Optional[Dict[str, Any]] = None


class IndexFileRequest(BaseModel):
    filepath: str
    source_type: str = "local_file"


class SearchRequest(BaseModel):
    query: str
    limit: int = 5
    min_similarity: float = 0.2
    source_type: Optional[str] = None


@router.post("/index-text")
async def index_text_endpoint(payload: IndexTextRequest) -> Dict[str, Any]:
    """Index arbitrary text content into pgvector with 768-dim embeddings."""
    chunks_count = await rag_indexer.index_document(
        source_path=payload.source_path,
        source_type=payload.source_type,
        content=payload.content,
        metadata=payload.metadata,
    )
    return {
        "status": "success",
        "chunks_indexed": chunks_count,
        "source_path": payload.source_path,
    }


@router.post("/index-file")
async def index_file_endpoint(payload: IndexFileRequest) -> Dict[str, Any]:
    """Read a local file from disk and index into pgvector."""
    chunks_count = await rag_indexer.index_local_file(
        filepath=payload.filepath,
        source_type=payload.source_type,
    )
    if chunks_count == 0:
        raise HTTPException(status_code=400, detail="Failed to index file or file is empty")
    return {
        "status": "success",
        "chunks_indexed": chunks_count,
        "filepath": payload.filepath,
    }


@router.post("/search")
async def search_endpoint(payload: SearchRequest) -> List[Dict[str, Any]]:
    """Execute semantic cosine similarity search over indexed documents."""
    results = await rag_indexer.semantic_search(
        query=payload.query,
        limit=payload.limit,
        min_similarity=payload.min_similarity,
        source_type=payload.source_type,
    )
    return results


@router.get("/documents")
async def list_documents_endpoint(
    source_type: Optional[str] = Query(None, description="Filter by source_type e.g. resume")
) -> Dict[str, Any]:
    """List indexed documents grouped by source_path with chunk counts."""
    docs = await rag_indexer.list_indexed_documents(source_type=source_type)
    return {"documents": docs}


@router.delete("/documents")
async def delete_document_endpoint(
    source_path: str = Query(..., description="Document source_path to delete"),
    source_type: Optional[str] = Query(None, description="Optional source_type guard"),
) -> Dict[str, Any]:
    """Remove an indexed document and its chunks from pgvector."""
    deleted = await rag_indexer.delete_indexed_document(
        source_path=source_path,
        source_type=source_type,
    )
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Indexed document not found")
    return {"status": "deleted", "source_path": source_path, "chunks_deleted": deleted}
