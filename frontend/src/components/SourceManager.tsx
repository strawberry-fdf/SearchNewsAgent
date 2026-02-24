"use client";

import { useEffect, useState } from "react";
import { Database, Plus, Trash2, Loader2, ExternalLink } from "lucide-react";
import {
  getSources,
  addSource,
  deleteSource,
  type Source,
} from "@/lib/api";

export default function SourceManager() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // New source form
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newType, setNewType] = useState("rss");
  const [newTags, setNewTags] = useState("");

  useEffect(() => {
    loadSources();
  }, []);

  async function loadSources() {
    setLoading(true);
    try {
      const res = await getSources();
      setSources(res.items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!newName || !newUrl) return;
    try {
      await addSource({
        name: newName,
        url: newUrl,
        source_type: newType,
        tags: newTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setNewName("");
      setNewUrl("");
      setNewTags("");
      setShowAdd(false);
      await loadSources();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(url: string) {
    if (!confirm("确认删除此信源？")) return;
    try {
      await deleteSource(url);
      await loadSources();
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Database size={24} className="text-dark-accent" />
          <h1 className="text-2xl font-bold">信源管理</h1>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-accent text-black text-sm font-medium hover:bg-dark-accent/80 transition-colors"
        >
          <Plus size={14} />
          添加信源
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-dark-card border border-dark-border rounded-xl p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-dark-muted mb-1 block">名称</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="OpenAI Blog"
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent"
              />
            </div>
            <div>
              <label className="text-xs text-dark-muted mb-1 block">URL</label>
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://openai.com/blog/rss.xml"
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent"
              />
            </div>
            <div>
              <label className="text-xs text-dark-muted mb-1 block">类型</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent"
              >
                <option value="rss">RSS Feed</option>
                <option value="web">网页爬取</option>
                <option value="api">API</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-dark-muted mb-1 block">
                标签（逗号分隔）
              </label>
              <input
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="大佬blog, 官方"
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dark-accent"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 rounded-lg border border-dark-border text-sm text-dark-muted hover:text-dark-text transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleAdd}
              className="px-4 py-2 rounded-lg bg-dark-accent text-black text-sm font-medium hover:bg-dark-accent/80 transition-colors"
            >
              确认添加
            </button>
          </div>
        </div>
      )}

      {/* Sources list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-dark-muted" size={32} />
        </div>
      ) : sources.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-4">📡</div>
          <p className="text-dark-muted">暂无信源，点击上方按钮添加</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((source) => (
            <div
              key={source.url}
              className="bg-dark-card border border-dark-border rounded-xl p-4 flex items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-sm truncate">{source.name}</h3>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      source.enabled
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-gray-500/20 text-gray-400"
                    }`}
                  >
                    {source.enabled ? "启用" : "禁用"}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-dark-surface text-dark-muted">
                    {source.source_type.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-dark-muted truncate">{source.url}</p>
                {source.tags.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {source.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded-full bg-dark-surface text-dark-muted border border-dark-border"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg hover:bg-dark-surface text-dark-muted hover:text-dark-text transition-colors"
                >
                  <ExternalLink size={14} />
                </a>
                <button
                  onClick={() => handleDelete(source.url)}
                  className="p-2 rounded-lg hover:bg-red-500/10 text-dark-muted hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
