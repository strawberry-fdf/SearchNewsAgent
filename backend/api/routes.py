"""
FastAPI 路由定义 —— 系统所有 REST API 端点。

端点分组:
- /api/articles/*         文章查询、收藏、标签、删除
- /api/stats              仪表盘统计数据
- /api/sources/*          信源 CRUD 管理
- /api/settings           全局设置读写
- /api/filter-presets/*   筛选规则预设管理
- /api/llm-configs/*      LLM 配置管理（多配置单激活）
- /api/tags/*             用户兴趣标签
- /api/rules/*            关键词过滤规则
- /api/admin/*            流水线触发与状态监控（含 SSE 实时日志流）
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import logging

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.storage import db
from backend.llm.provider_registry import discover_models, get_provider_spec, list_provider_specs

logger = logging.getLogger(__name__)

router = APIRouter()

# ── 流水线执行状态（进程内单例，跟踪当前运行状态和日志） ──
_pipeline_state: Dict[str, Any] = {
    "running": False,
    "logs": [],
    "stats": None,
    "queues": set(),
}


def _emit_log(msg: str):
    """向全局状态追加日志，并通知所有 SSE 监听队列。"""
    _pipeline_state["logs"].append(msg)
    for q in list(_pipeline_state["queues"]):
        try:
            q.put_nowait(msg)
        except Exception:
            pass


async def _run_pipeline_bg():
    """
    后台执行采集流水线。
    由 asyncio.create_task 启动，运行结杜后自动将运行记录持久化到 pipeline_runs 表。
    """
    run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc).isoformat()
    _pipeline_state["running"] = True
    _pipeline_state["logs"] = []
    _pipeline_state["stats"] = None
    run_status = "done"
    try:
        from backend.pipeline import run_ingestion_pipeline
        app_settings = await db.get_settings()
        # Use active preset prompts if available (multi-select), otherwise fall back to manual prompt
        active_presets = await db.get_active_filter_presets()
        use_custom_rules = False
        if active_presets:
            # Combine all active preset prompts
            preset_prompts = [p.get("prompt", "").strip() for p in active_presets if p.get("prompt", "").strip()]
            if preset_prompts:
                preset_names = [p.get("name", "") for p in active_presets]
                filter_prompt = f"当前激活的筛选规则预设（共 {len(preset_prompts)} 条，必须全部满足）:\n"
                for i, (name, prompt) in enumerate(zip(preset_names, preset_prompts), 1):
                    filter_prompt += f"\n【规则 {i}: {name}】\n{prompt}\n"
                use_custom_rules = True
            else:
                filter_prompt = app_settings.get("llm_filter_prompt", "")
        else:
            filter_prompt = app_settings.get("llm_filter_prompt", "")
        stats = await run_ingestion_pipeline(
            progress_cb=_emit_log,
            filter_prompt=filter_prompt,
            use_custom_rules=use_custom_rules,
        )
        _pipeline_state["stats"] = stats
        _emit_log("__DONE__")
    except Exception as exc:
        _emit_log(f"__ERROR__ {exc}")
        run_status = "error"
        logger.error("Pipeline background task error: %s", exc, exc_info=True)
    finally:
        _pipeline_state["running"] = False
        finished_at = datetime.now(timezone.utc).isoformat()
        # persist run (skip __DONE__ and __ERROR__ sentinel lines)
        saved_logs = [l for l in _pipeline_state["logs"] if not l.startswith("__")]
        await db.save_pipeline_run(
            run_id=run_id,
            started_at=started_at,
            finished_at=finished_at,
            logs=saved_logs,
            stats=_pipeline_state["stats"] or {},
            status=run_status,
        )


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def _serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """将 DB 文档转换为 JSON 安全的 dict（datetime → ISO 字符串）。"""
    for key in ("fetched_at", "analyzed_at", "published_at", "created_at", "last_fetched_at"):
        if key in doc and doc[key] is not None:
            if hasattr(doc[key], "isoformat"):
                doc[key] = doc[key].isoformat()
            else:
                doc[key] = str(doc[key])
    return doc


# ──────────────────────────────────────────────────────────────
# 文章查询与操作端点
# ──────────────────────────────────────────────────────────────

@router.get("/api/articles")
async def list_articles(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    tags: Optional[str] = Query(None, description="Comma-separated interest tags"),
    keyword: Optional[str] = Query(None),
    source_name: Optional[str] = Query(None, description="Filter by source name"),
    sort_by: str = Query("fetched_at", description="Sort field: fetched_at|published_at|importance|ai_relevance"),
    sort_order: str = Query("desc", description="Sort direction: asc|desc"),
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
):
    """文章列表查询，支持状态/分类/标签/关键词/信源过滤及多字段排序。"""
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else None

    if status == "selected":
        docs = await db.get_selected_articles(skip=skip, limit=limit, category=category,
                                              tags=tag_list, keyword=keyword,
                                              sort_by=sort_by, sort_order=sort_order,
                                              source_name=source_name)
        total = await db.count_selected_articles(category=category, tags=tag_list, keyword=keyword,
                                                  source_name=source_name)
    else:
        docs = await db.get_all_articles(skip=skip, limit=limit, status=status,
                                         keyword=keyword,
                                         sort_by=sort_by, sort_order=sort_order,
                                         source_name=source_name)
        total = await db.count_articles(status=status, keyword=keyword,
                                        source_name=source_name)

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [_serialize_doc(d) for d in docs],
    }


@router.get("/api/articles/selected")
async def list_selected_articles(
    category: Optional[str] = Query(None),
    tags: Optional[str] = Query(None, description="Comma-separated interest tags"),
    keyword: Optional[str] = Query(None),
    source_name: Optional[str] = Query(None, description="Filter by source name"),
    sort_by: str = Query("fetched_at", description="Sort field: fetched_at|published_at|importance|ai_relevance"),
    sort_order: str = Query("desc", description="Sort direction: asc|desc"),
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
):
    """精选文章专属端点，支持分类/标签/关键词/信源过滤及排序。"""
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else None
    docs = await db.get_selected_articles(skip=skip, limit=limit, category=category,
                                          tags=tag_list, keyword=keyword,
                                          sort_by=sort_by, sort_order=sort_order,
                                          source_name=source_name)
    total = await db.count_selected_articles(category=category, tags=tag_list, keyword=keyword,
                                              source_name=source_name)
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [_serialize_doc(d) for d in docs],
    }


@router.get("/api/articles/source-counts")
async def get_article_source_counts(
    status: Optional[str] = Query(None, description="Filter by status: selected|rejected|pending"),
    starred: Optional[bool] = Query(None, description="Filter by starred state: true|false"),
):
    """获取每个信源的文章数量，支持按状态和收藏状态过滤。用于侧边栏信源导航。"""
    counts = await db.get_source_article_counts(status=status, starred=starred)
    total = sum(c["count"] for c in counts)
    return {"total": total, "items": counts}


@router.post("/api/articles/{url_hash}/star")
async def toggle_article_star(url_hash: str):
    """切换文章收藏状态（星标）。"""
    new_state = await db.toggle_star(url_hash)
    return {"starred": new_state}


class UserTagsUpdate(BaseModel):
    tags: List[str] = Field(default_factory=list)


@router.put("/api/articles/{url_hash}/user-tags")
async def update_article_user_tags(url_hash: str, body: UserTagsUpdate):
    """更新文章的用户自定义标签。"""
    ok = await db.update_article_user_tags(url_hash, body.tags)
    if not ok:
        raise HTTPException(status_code=404, detail="Article not found")
    return {"status": "ok", "tags": body.tags}


@router.delete("/api/articles/batch")
async def delete_articles_batch(url_hashes: List[str] = None):
    """批量删除文章（DELETE 请求体传入 url_hash 列表）。"""
    if not url_hashes:
        raise HTTPException(status_code=400, detail="url_hashes required")
    count = await db.delete_articles_batch(url_hashes)
    return {"status": "ok", "deleted": count}


class BatchDeleteBody(BaseModel):
    url_hashes: List[str]


@router.post("/api/articles/batch-delete")
async def delete_articles_batch_post(body: BatchDeleteBody):
    """批量删除文章（POST 请求体传入 url_hash 列表）。"""
    count = await db.delete_articles_batch(body.url_hashes)
    return {"status": "ok", "deleted": count}


@router.delete("/api/articles/{url_hash}")
async def delete_article(url_hash: str):
    """删除单篇文章。"""
    deleted = await db.delete_article(url_hash)
    if not deleted:
        raise HTTPException(status_code=404, detail="Article not found")
    return {"status": "deleted"}


@router.get("/api/stats")
async def get_stats():
    """仪表盘统计数据：总文章数/精选/已过滤/待处理。"""
    total = await db.count_articles()
    selected = await db.count_articles(status="selected")
    rejected = await db.count_articles(status="rejected")
    pending = await db.count_articles(status="pending")
    return {
        "total": total,
        "selected": selected,
        "rejected": rejected,
        "pending": pending,
    }


# ──────────────────────────────────────────────────────────────
# 信源管理端点
# ──────────────────────────────────────────────────────────────

class SourceCreate(BaseModel):
    name: str
    url: str
    source_type: str = "rss"
    tags: List[str] = Field(default_factory=list)
    enabled: bool = True
    fetch_interval_minutes: int = 30
    category: str = ""
    fetch_since: Optional[str] = None  # ISO date string, e.g. "2024-10-01"


class SourceUpdate(BaseModel):
    enabled: Optional[bool] = None
    category: Optional[str] = None
    name: Optional[str] = None
    url: Optional[str] = None
    tags: Optional[List[str]] = None
    fetch_interval_minutes: Optional[int] = None
    fetch_since: Optional[str] = None  # ISO date string or empty string to clear
    pinned: Optional[bool] = None
    pin_order: Optional[int] = None


@router.get("/api/sources")
async def list_sources():
    """获取所有信源列表（含禁用的）。"""
    docs = await db.get_all_sources(enabled_only=False)
    return {"items": [_serialize_doc(d) for d in docs]}


@router.post("/api/sources")
async def create_source(source: SourceCreate):
    """添加新信源（RSS / Web / API）。"""
    doc = source.model_dump()
    result = await db.upsert_source(doc)
    return {"status": "ok", "id": result}


@router.patch("/api/sources/{source_id}")
async def update_source(source_id: str, body: SourceUpdate):
    """部分更新信源配置（启用/禁用、分类、采集起始日等）。"""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if body.enabled is not None:
        updates["enabled"] = body.enabled
    if body.pinned is not None:
        updates["pinned"] = body.pinned
    if body.pin_order is not None:
        updates["pin_order"] = body.pin_order
    # Allow clearing fetch_since with empty string
    if body.fetch_since is not None:
        updates["fetch_since"] = body.fetch_since if body.fetch_since.strip() else None
    ok = await db.update_source(source_id, updates)
    if not ok:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"status": "ok"}


@router.delete("/api/sources")
async def remove_source(url: str = Query(...)):
    """按 URL 删除信源（同时删除该信源下的所有文章）。"""
    deleted = await db.delete_source(url)
    if not deleted:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"status": "deleted"}


# ── 分类置顶管理 ──

class PinnedCategoriesBody(BaseModel):
    pinned_categories: List[str] = Field(default_factory=list, description="按顺序排列的置顶分类名称列表")


@router.get("/api/sources/pinned-categories")
async def get_pinned_categories():
    """获取置顶分类列表（有序）。"""
    s = await db.get_settings()
    return {"pinned_categories": s.get("pinned_categories", [])}


@router.put("/api/sources/pinned-categories")
async def update_pinned_categories(body: PinnedCategoriesBody):
    """更新置顶分类列表。"""
    await db.set_setting("pinned_categories", body.pinned_categories)
    return {"status": "ok", "pinned_categories": body.pinned_categories}


# ──────────────────────────────────────────────────────────────
# 全局设置端点
# ──────────────────────────────────────────────────────────────

class SettingsUpdate(BaseModel):
    llm_enabled: Optional[bool] = None
    llm_filter_prompt: Optional[str] = None


@router.get("/api/settings")
async def get_settings():
    """获取全局应用设置（LLM 开关、筛选提示等）。"""
    return await db.get_settings()


@router.put("/api/settings")
async def update_settings(body: SettingsUpdate):
    """更新全局设置。"""
    data = body.model_dump(exclude_none=True)
    for key, value in data.items():
        await db.set_setting(key, value)
    return await db.get_settings()


# ──────────────────────────────────────────────────────────────
# 筛选规则预设端点
# ──────────────────────────────────────────────────────────────

class PresetCreate(BaseModel):
    name: str
    prompt: str = ""


class PresetUpdate(BaseModel):
    name: Optional[str] = None
    prompt: Optional[str] = None


@router.get("/api/filter-presets")
async def list_filter_presets():
    """List all saved filter presets."""
    presets = await db.get_filter_presets()
    return {"items": presets}


@router.post("/api/filter-presets")
async def create_filter_preset(body: PresetCreate):
    """Create a new filter preset."""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    preset_id = await db.create_filter_preset(name, body.prompt)
    return {"status": "ok", "id": preset_id}


@router.patch("/api/filter-presets/{preset_id}")
async def update_filter_preset(preset_id: str, body: PresetUpdate):
    """Update a filter preset's name or prompt."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    ok = await db.update_filter_preset(preset_id, updates)
    if not ok:
        raise HTTPException(status_code=404, detail="Preset not found")
    return {"status": "ok"}


@router.post("/api/filter-presets/{preset_id}/activate")
async def activate_filter_preset(preset_id: str):
    """Set a preset as active (used by the pipeline). Legacy single-select."""
    await db.activate_filter_preset(preset_id)
    return {"status": "ok", "active_id": preset_id}


@router.post("/api/filter-presets/{preset_id}/toggle-active")
async def toggle_filter_preset_active(preset_id: str):
    """Toggle a preset's active state (supports multi-select)."""
    new_state = await db.toggle_filter_preset_active(preset_id)
    return {"status": "ok", "is_active": new_state}


@router.post("/api/filter-presets/deactivate")
async def deactivate_all_presets():
    """Deactivate all presets (use default / manual prompt)."""
    await db.activate_filter_preset(None)
    return {"status": "ok"}


@router.delete("/api/filter-presets/{preset_id}")
async def delete_filter_preset(preset_id: str):
    """Delete a filter preset."""
    deleted = await db.delete_filter_preset(preset_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Preset not found")
    return {"status": "deleted"}


# ──────────────────────────────────────────────────────────────
# LLM 配置管理端点 — 多配置单激活
# ──────────────────────────────────────────────────────────────

class LlmConfigCreate(BaseModel):
    name: str
    provider: str = "openai"
    model: str = ""
    api_key: str = ""
    base_url: str = ""


class LlmConfigUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class ProviderModelsRequest(BaseModel):
    api_key: str = ""
    base_url: str = ""


@router.get("/api/llm-configs")
async def list_llm_configs():
    """获取所有已保存的 LLM 配置。"""
    configs = await db.get_llm_configs()
    return {"items": configs}


@router.post("/api/llm-configs")
async def create_llm_config(body: LlmConfigCreate):
    """创建新的 LLM 配置。"""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    provider = body.provider.strip().lower() if body.provider else "openai"
    if not get_provider_spec(provider):
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")
    config_id = await db.create_llm_config(
        name=name,
        provider=provider,
        model=body.model.strip(),
        api_key=body.api_key.strip(), base_url=body.base_url.strip(),
    )
    return {"status": "ok", "id": config_id}


@router.patch("/api/llm-configs/{config_id}")
async def update_llm_config(config_id: str, body: LlmConfigUpdate):
    """更新 LLM 配置。"""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "provider" in updates:
        updates["provider"] = str(updates["provider"]).strip().lower()
        if updates["provider"] and not get_provider_spec(updates["provider"]):
            raise HTTPException(status_code=400, detail=f"Unsupported provider: {updates['provider']}")
    if updates:
        ok = await db.update_llm_config(config_id, updates)
        if not ok:
            raise HTTPException(status_code=404, detail="Config not found")
    return {"status": "ok"}


@router.get("/api/llm-providers")
async def list_llm_providers():
    """获取支持的 LLM 厂商列表（用于前端下拉展示）。"""
    return {"items": list_provider_specs()}


@router.post("/api/llm-providers/{provider}/models")
async def discover_provider_models(provider: str, body: ProviderModelsRequest):
    """根据厂商 + API Key(+可选 base_url) 发现可用模型列表。"""
    result = await discover_models(
        provider=provider,
        api_key=body.api_key,
        base_url=body.base_url,
    )
    if result.get("source") == "unknown":
        raise HTTPException(status_code=400, detail=result.get("error") or "Unsupported provider")
    return result


@router.post("/api/llm-configs/{config_id}/activate")
async def activate_llm_config(config_id: str):
    """激活指定的 LLM 配置（单选，停用其他）。"""
    await db.activate_llm_config(config_id)
    return {"status": "ok", "active_id": config_id}


@router.post("/api/llm-configs/deactivate")
async def deactivate_llm_configs():
    """停用所有 LLM 配置（使用环境变量默认值）。"""
    await db.deactivate_all_llm_configs()
    return {"status": "ok"}


@router.delete("/api/llm-configs/{config_id}")
async def delete_llm_config(config_id: str):
    """删除指定的 LLM 配置。"""
    ok = await db.delete_llm_config(config_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Config not found")
    return {"status": "ok"}


# ──────────────────────────────────────────────────────────────
# 用户兴趣标签端点（用于前端 Feed 过滤）
# ──────────────────────────────────────────────────────────────

class TagCreate(BaseModel):
    tag: str


@router.get("/api/tags")
async def list_interest_tags():
    """List all user-defined interest tags."""
    tags = await db.get_interest_tags()
    return {"items": tags}


@router.post("/api/tags")
async def create_interest_tag(body: TagCreate):
    """Add an interest tag."""
    tag = body.tag.strip()
    if not tag:
        raise HTTPException(status_code=400, detail="Tag cannot be empty")
    await db.add_interest_tag(tag)
    return {"status": "ok", "tag": tag}


@router.delete("/api/tags/{tag}")
async def remove_interest_tag(tag: str):
    """Remove an interest tag."""
    deleted = await db.delete_interest_tag(tag)
    if not deleted:
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"status": "deleted"}


# ──────────────────────────────────────────────────────────────
# 关键词过滤规则端点
# ──────────────────────────────────────────────────────────────

class RuleCreate(BaseModel):
    keyword: str
    field: str = "title"


@router.get("/api/rules")
async def list_keyword_rules():
    """List all keyword filter rules."""
    rules = await db.get_keyword_rules()
    return {"items": [_serialize_doc(r) for r in rules]}


@router.post("/api/rules")
async def create_keyword_rule(body: RuleCreate):
    """Add a keyword filter rule."""
    keyword = body.keyword.strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="Keyword cannot be empty")
    rule_id = await db.add_keyword_rule(keyword, body.field)
    return {"status": "ok", "id": rule_id}


@router.patch("/api/rules/{rule_id}/toggle")
async def toggle_rule(rule_id: str):
    """Toggle a keyword rule on/off."""
    enabled = await db.toggle_keyword_rule(rule_id)
    return {"enabled": enabled}


@router.delete("/api/rules/{rule_id}")
async def remove_keyword_rule(rule_id: str):
    """Delete a keyword rule."""
    deleted = await db.delete_keyword_rule(rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"status": "deleted"}


# ──────────────────────────────────────────────────────────────
# 流水线管理与监控端点（Admin）
# ──────────────────────────────────────────────────────────────

@router.post("/api/admin/run-pipeline")
async def run_pipeline():
    """启动采集流水线作为后台任务（非阻塞）。"""
    if _pipeline_state["running"]:
        return {"status": "already_running"}
    asyncio.create_task(_run_pipeline_bg())
    return {"status": "started"}


@router.get("/api/admin/pipeline-status")
async def pipeline_status():
    """查询当前流水线状态：运行标志 / 日志 / 统计。"""
    return {
        "running": _pipeline_state["running"],
        "logs": _pipeline_state["logs"],
        "stats": _pipeline_state["stats"],
    }


@router.get("/api/admin/pipeline-stream")
async def pipeline_stream():
    """
    SSE 实时日志流端点。
    前端通过 EventSource 监听，实时接收流水线执行日志。
    """
    q: asyncio.Queue = asyncio.Queue()
    _pipeline_state["queues"].add(q)

    async def event_gen():
        try:
            # Replay existing logs first
            for msg in list(_pipeline_state["logs"]):
                yield f"data: {msg}\n\n"
            # If not running, we're done
            if not _pipeline_state["running"]:
                yield "data: __DONE__\n\n"
                return
            # Stream new messages
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=30)
                    yield f"data: {msg}\n\n"
                    if msg.startswith("__DONE__") or msg.startswith("__ERROR__"):
                        break
                except asyncio.TimeoutError:
                    yield "data: __PING__\n\n"
                    if not _pipeline_state["running"]:
                        break
        finally:
            _pipeline_state["queues"].discard(q)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ──────────────────────────────────────────────────────────────
# 流水线执行历史记录
# ──────────────────────────────────────────────────────────────

@router.get("/api/admin/pipeline-runs")
async def list_pipeline_runs():
    """List all archived pipeline runs."""
    runs = await db.get_pipeline_runs(limit=100)
    return {"items": runs}


@router.delete("/api/admin/pipeline-runs/{run_id}")
async def delete_pipeline_run(run_id: str):
    """Delete a single pipeline run by id."""
    deleted = await db.delete_pipeline_run(run_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"status": "deleted"}


# ──────────────────────────────────────────────────────────────
# 文章缓存管理端点 (Cache Management)
# ──────────────────────────────────────────────────────────────

@router.get("/api/cache/stats")
async def get_cache_stats():
    """获取文章缓存统计信息：数据库文件大小、各信源缓存占用。"""
    stats = await db.get_cache_stats()
    return stats


class CacheClearBody(BaseModel):
    source_ids: Optional[List[str]] = Field(
        default=None,
        description="要清除的信源 ID 列表，为 null 或空时清除全部文章缓存",
    )


@router.post("/api/cache/clear")
async def clear_cache(body: CacheClearBody):
    """清除文章缓存数据（可按信源选择性清除或全部清除）。"""
    deleted = await db.clear_article_cache(body.source_ids)
    return {"status": "ok", "deleted": deleted}
