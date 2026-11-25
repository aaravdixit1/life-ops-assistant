"""
RAG Indexer & Semantic Search Service
Generates 768-dimensional embeddings using Gemini gemini-embedding-001 (matching pgvector vector(768))
with local Ollama fallback. Supports text, Markdown, PDF, and DOCX uploads.
"""
import asyncio
import hashlib
import io
import json
import logging
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import List, Dict, Any, Optional

import httpx
from google import genai
from google.genai import types

from ..config import settings
from ..db import get_conn
from .profile_service import get_effective_gemini_api_key

logger = logging.getLogger(__name__)

EMBEDDING_DIM = 768
EMBEDDING_MODEL = "gemini-embedding-001"
ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".docx", ".md", ".txt"}


def extract_text_from_upload(filename: str, raw_bytes: bytes) -> str:
    """
    Extract plain text from uploaded .pdf, .docx, .md, or .txt bytes.
    Raises ValueError with an actionable message if unsupported or empty.
    """
    if not raw_bytes:
        raise ValueError("Uploaded file is empty.")

    ext = Path(filename or "document.txt").suffix.lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type '{ext or 'unknown'}'. Upload a .pdf, .docx, .md, or .txt file."
        )

    extracted = ""
    if ext == ".pdf":
        try:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(raw_bytes))
            pages: List[str] = []
            for page in reader.pages:
                txt = (page.extract_text() or "").strip()
                if txt:
                    pages.append(txt)
            extracted = "\n\n".join(pages)
        except Exception as e:
            raise ValueError(f"Could not read PDF file: {e}") from e
        if not extracted.strip():
            raise ValueError(
                "No selectable text found in PDF (it may be a scanned image PDF). Try exporting a text PDF, .docx, or .md file."
            )
    elif ext == ".docx":
        try:
            with zipfile.ZipFile(io.BytesIO(raw_bytes)) as zf:
                if "word/document.xml" not in zf.namelist():
                    raise ValueError("Invalid .docx archive (missing word/document.xml).")
                xml_bytes = zf.read("word/document.xml")
            root = ET.fromstring(xml_bytes)
            paragraphs: List[str] = []
            for p_elem in root.iter():
                if p_elem.tag.endswith("}p") or p_elem.tag == "p":
                    parts = [
                        t_elem.text
                        for t_elem in p_elem.iter()
                        if (t_elem.tag.endswith("}t") or t_elem.tag == "t") and t_elem.text
                    ]
                    line = "".join(parts).strip()
                    if line:
                        paragraphs.append(line)
            extracted = "\n".join(paragraphs)
        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f"Could not read .docx file: {e}") from e
    else:
        try:
            extracted = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            extracted = raw_bytes.decode("latin-1", errors="ignore")

    cleaned = "\n".join(line.rstrip() for line in extracted.splitlines()).strip()
    if not cleaned:
        raise ValueError("Uploaded document contains no readable text.")
    return cleaned


async def embed_text(text: str) -> List[float]:
    """Generate 768-dimensional embedding vector using BYO/env Gemini key, Ollama, or deterministic fallback."""
    if not text.strip():
        return [0.0] * EMBEDDING_DIM

    api_key, _ = await get_effective_gemini_api_key()
    if api_key:
        try:
            def _call_embed() -> Optional[List[float]]:
                client = genai.Client(api_key=api_key)
                result = client.models.embed_content(
                    model=EMBEDDING_MODEL,
                    contents=text,
                    config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIM),
                )
                if result.embeddings and len(result.embeddings) > 0:
                    values = result.embeddings[0].values
                    if len(values) == EMBEDDING_DIM:
                        return list(values)
                return None

            emb = await asyncio.to_thread(_call_embed)
            if emb:
                return emb
        except Exception as e:
            logger.warning(f"Gemini embed_content failed ({e}), checking local embedding fallback...")

    # Fallback to local Ollama if available
    try:
        async with httpx.AsyncClient(timeout=5.0) as http_client:
            resp = await http_client.post(
                f"{settings.local_model_base_url.replace('/v1', '')}/api/embeddings",
                json={"model": "nomic-embed-text", "prompt": text},
            )
            if resp.status_code == 200:
                data = resp.json()
                emb = data.get("embedding", [])
                if len(emb) == EMBEDDING_DIM:
                    return emb
                elif len(emb) > EMBEDDING_DIM:
                    return emb[:EMBEDDING_DIM]
                elif len(emb) < EMBEDDING_DIM:
                    return emb + [0.0] * (EMBEDDING_DIM - len(emb))
    except Exception:
        pass

    # Deterministic dummy vector for offline test runs
    logger.warning("No embedding provider available; using normalized placeholder embedding.")
    h = hashlib.sha256(text.encode()).digest()
    vals = [(b / 255.0 - 0.5) for b in h]
    tiled = (vals * (EMBEDDING_DIM // len(vals) + 1))[:EMBEDDING_DIM]
    norm = sum(x * x for x in tiled) ** 0.5 or 1.0
    return [x / norm for x in tiled]


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """Split text into overlapping character chunks."""
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += chunk_size - overlap
    return chunks


async def index_document(
    source_path: str,
    source_type: str,
    content: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> int:
    """Chunk and index document text into pgvector document_embeddings table."""
    metadata = metadata or {}
    chunks = chunk_text(content)
    if not chunks:
        return 0

    async with get_conn() as conn:
        # Clear existing embeddings for this specific source path
        await conn.execute("DELETE FROM document_embeddings WHERE source_path = $1", source_path)

        for idx, chunk in enumerate(chunks):
            embedding = await embed_text(chunk)
            # Format vector as string for PostgreSQL pgvector: '[0.1, 0.2, ...]'
            vec_str = "[" + ",".join(f"{x:.6f}" for x in embedding) + "]"
            import json
            await conn.execute("""
                INSERT INTO document_embeddings (
                    source_type, source_path, chunk_index, content, embedding, metadata
                ) VALUES ($1, $2, $3, $4, $5::vector, $6)
            """, source_type, source_path, idx, chunk, vec_str, json.dumps(metadata))

    logger.info(f"Indexed {len(chunks)} chunks for {source_type}:{source_path}")
    return len(chunks)


async def index_local_file(filepath: str, source_type: str = "local_file") -> int:
    """Read a local file from disk and index into pgvector."""
    path = Path(filepath).resolve()
    if not path.exists() or not path.is_file():
        logger.error(f"Cannot index file: {filepath} does not exist")
        return 0

    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
        return await index_document(
            source_path=str(path),
            source_type=source_type,
            content=content,
            metadata={"filename": path.name, "extension": path.suffix}
        )
    except Exception as e:
        logger.error(f"Failed to read and index {filepath}: {e}")
        return 0


async def semantic_search(
    query: str,
    limit: int = 5,
    min_similarity: float = 0.2,
    source_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Execute cosine similarity vector search over document_embeddings."""
    query_vec = await embed_text(query)
    vec_str = "[" + ",".join(f"{x:.6f}" for x in query_vec) + "]"

    query_sql = """
        SELECT id, source_type, source_path, chunk_index, content, metadata,
               1 - (embedding <=> $1::vector) AS similarity
        FROM document_embeddings
        WHERE 1 - (embedding <=> $1::vector) >= $2
    """
    params: List[Any] = [vec_str, min_similarity]
    idx = 3

    if source_type:
        query_sql += f" AND source_type = ${idx}"
        params.append(source_type)
        idx += 1

    query_sql += f" ORDER BY embedding <=> $1::vector ASC LIMIT ${idx}"
    params.append(limit)

    async with get_conn() as conn:
        rows = await conn.fetch(query_sql, *params)
        results = [dict(r) for r in rows]
        for item in results:
            if item.get("id") is not None:
                item["id"] = str(item["id"])
            if isinstance(item.get("metadata"), str):
                try:
                    item["metadata"] = json.loads(item["metadata"])
                except Exception:
                    pass

        if not results and query.strip():
            # Fallback keyword match when semantic embeddings are offline or below threshold
            tokens = [t for t in query.strip().split() if len(t) >= 2][:4]
            if tokens:
                where_parts = [f"content ILIKE ${i + 1}" for i in range(len(tokens))]
                kw_params: List[Any] = [f"%{t}%" for t in tokens]
                kw_sql = f"""
                    SELECT id, source_type, source_path, chunk_index, content, metadata,
                           0.55::double precision AS similarity
                    FROM document_embeddings
                    WHERE ({' OR '.join(where_parts)})
                """
                if source_type:
                    kw_params.append(source_type)
                    kw_sql += f" AND source_type = ${len(kw_params)}"
                kw_params.append(limit)
                kw_sql += f" ORDER BY chunk_index ASC LIMIT ${len(kw_params)}"
                kw_rows = await conn.fetch(kw_sql, *kw_params)
                for r in kw_rows:
                    item = dict(r)
                    if item.get("id") is not None:
                        item["id"] = str(item["id"])
                    if isinstance(item.get("metadata"), str):
                        try:
                            item["metadata"] = json.loads(item["metadata"])
                        except Exception:
                            pass
                    results.append(item)

        return results


async def list_indexed_documents(source_type: Optional[str] = None) -> List[Dict[str, Any]]:
    """List distinct indexed documents grouped by source_type and source_path."""
    sql = """
        SELECT
            source_type,
            source_path,
            COUNT(*)::int AS chunk_count,
            MAX(created_at) AS updated_at,
            MIN(CASE WHEN chunk_index = 0 THEN content ELSE NULL END) AS first_chunk,
            (ARRAY_AGG(metadata ORDER BY chunk_index ASC))[1] AS metadata
        FROM document_embeddings
    """
    params: List[Any] = []
    if source_type:
        sql += " WHERE source_type = $1"
        params.append(source_type)
    sql += " GROUP BY source_type, source_path ORDER BY MAX(created_at) DESC"

    async with get_conn() as conn:
        rows = await conn.fetch(sql, *params)

    docs: List[Dict[str, Any]] = []
    for r in rows:
        meta = r["metadata"]
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}
        meta = meta if isinstance(meta, dict) else {}
        source_path = r["source_path"]
        filename = (meta.get("filename") or Path(source_path.split(":")[-1]).name or source_path).strip()
        preview_raw = (r["first_chunk"] or "").strip()
        preview = preview_raw[:180] + ("..." if len(preview_raw) > 180 else "")
        docs.append({
            "source_type": r["source_type"],
            "source_path": source_path,
            "filename": filename,
            "chunk_count": int(r["chunk_count"] or 0),
            "preview": preview,
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        })
    return docs


async def delete_indexed_document(
    source_path: str,
    source_type: Optional[str] = None,
) -> int:
    """Delete all indexed chunks for a specific source_path (optionally scoped by source_type)."""
    async with get_conn() as conn:
        if source_type:
            res = await conn.execute(
                "DELETE FROM document_embeddings WHERE source_path = $1 AND source_type = $2",
                source_path,
                source_type,
            )
        else:
            res = await conn.execute(
                "DELETE FROM document_embeddings WHERE source_path = $1",
                source_path,
            )
    try:
        return int(res.split()[-1])
    except Exception:
        return 0
