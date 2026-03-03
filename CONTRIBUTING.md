# 贡献指南

感谢你对 AgentNews 的关注！本文档将帮助你快速、规范地参与到项目开发中。

---

## 目录

- [开发环境搭建](#开发环境搭建)
- [项目架构速览](#项目架构速览)
- [开发工作流](#开发工作流)
- [提交规范](#提交规范)
- [测试要求](#测试要求)
- [代码规范](#代码规范)
- [Pull Request 流程](#pull-request-流程)
- [版本发布](#版本发布)
- [常见问题](#常见问题)

---

## 开发环境搭建

### 前置工具

| 工具 | 版本 | 说明 |
|------|------|------|
| Python | ≥ 3.10 | 后端运行时 |
| Node.js | ≥ 18 | 前端 + 脚本 |
| pnpm | ≥ 8 | 包管理器（推荐 `npm i -g pnpm`） |
| Git | ≥ 2.30 | 版本控制 |

### 一键搭建

```bash
# 1. Fork 并克隆仓库
git clone https://github.com/<your-username>/SearchNewsAgent.git
cd SearchNewsAgent

# 2. 安装 Node 依赖（根 + 前端 + Husky 钩子）
pnpm install

# 3. 创建 Python 虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 4. 安装后端依赖
pip install -r backend/requirements.txt

# 5. 安装测试依赖
pip install pytest pytest-asyncio

# 6. 配置环境变量
cp build/default.env .env
# 编辑 .env，填入你的 LLM API Key
```

### 验证环境

```bash
# 运行全部质量检查（TypeScript 类型检查 + 前端 223 测试 + 后端 283 测试）
pnpm check
```

如果三项检查全部通过（✅），说明环境搭建完成。

### 启动开发

```bash
# 完整开发环境（后端 + 前端 + Electron）
pnpm dev

# 仅前后端（不启动 Electron）
pnpm dev -- --no-electron

# 仅前端 / 仅后端
pnpm dev -- --frontend
pnpm dev -- --backend
```

- 后端：http://localhost:8000（FastAPI + Swagger 文档 /docs）
- 前端：http://localhost:3000（Next.js 开发服务器）

---

## 项目架构速览

```
SearchNewsAgent/
├── backend/          # Python FastAPI 后端
│   ├── api/          #   REST API 路由（30+ 端点）
│   ├── ingestion/    #   数据采集层（RSS + 爬虫 + 去重）
│   ├── llm/          #   LLM 分析引擎（多模型支持）
│   ├── rules/        #   四步精选规则引擎
│   ├── notification/ #   飞书推送
│   ├── storage/      #   SQLite 异步存储
│   ├── models/       #   Pydantic 数据模型
│   ├── pipeline.py   #   五步 Pipeline 编排器
│   └── tests/        #   后端测试
├── frontend/         # Next.js 前端
│   └── src/
│       ├── components/   # React 组件
│       ├── lib/api.ts    # API 客户端
│       └── __tests__/    # 前端测试
├── electron/         # Electron 桌面主进程
├── scripts/          # Node.js 工程化脚本
└── docs/             # 详细文档
```

> 完整架构详解请阅读 [docs/system-architecture.md](docs/system-architecture.md)

### 数据流

```
信源配置 → 定时/手动触发 Pipeline
  → Step 1: 获取已启用信源
  → Step 2: 抓取文章 + URL 去重
  → Step 3: LLM 分析（分类/评分/摘要）
  → Step 4: 规则引擎四步精选
  → Step 5: 飞书推送入选文章
  → 前端展示
```

---

## 开发工作流

### 分支策略

```
main            ← 稳定分支，受保护
  └── feat/xxx  ← 功能分支，从 main 拉出
  └── fix/xxx   ← 修复分支
  └── docs/xxx  ← 文档变更
```

**基本流程**：

1. 从 `main` 创建功能分支：`git checkout -b feat/my-feature`
2. 开发 + 编写测试
3. `pnpm commit` 交互式提交（确保符合规范）
4. 推送分支：`git push origin feat/my-feature`
5. 创建 Pull Request → Code Review → 合并

### Git Hooks（自动）

项目通过 Husky 自动执行以下 Git 钩子，**无需手动操作**：

| 钩子 | 触发时机 | 执行内容 |
|------|----------|----------|
| `pre-commit` | `git commit` 前 | TypeScript 类型检查 + Vitest 前端测试 + Pytest 后端测试 |
| `commit-msg` | 提交信息写入后 | commitlint 校验提交信息格式 |

如果任一检查失败，提交将被阻止。请修复后重试。

---

## 提交规范

本项目强制使用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 规范。

### 提交格式

```
<type>(<scope>): <subject>

[可选 body]

[可选 footer]
```

### 推荐方式：交互式提交

```bash
pnpm commit
```

该命令会引导你：
1. 选择提交类型（feat / fix / docs ...）
2. 输入可选 scope（模块范围）
3. 输入提交说明
4. 确认并提交

### 手动提交

如果你习惯手动 `git commit`，请确保格式正确：

```bash
# ✅ 正确
git commit -m "feat(frontend): 添加文章搜索功能"
git commit -m "fix(pipeline): 修复 RSS 抓取超时问题"
git commit -m "docs: 更新 README 快速开始章节"

# ❌ 错误（会被 commitlint 拦截）
git commit -m "更新了一些代码"
git commit -m "fix bug"
```

### Type 速查表

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(frontend): 添加暗色主题切换` |
| `fix` | 修复 Bug | `fix(api): 修复分页参数越界` |
| `docs` | 文档变更 | `docs: 更新贡献指南` |
| `style` | 代码格式（不影响逻辑） | `style: 统一缩进为 2 空格` |
| `refactor` | 重构（不增功能不修 Bug） | `refactor(storage): 优化查询构建器` |
| `perf` | 性能优化 | `perf(ingestion): 并发抓取信源` |
| `test` | 测试相关 | `test(rules): 补充边界用例` |
| `build` | 构建系统变更 | `build: 升级 electron-builder` |
| `ci` | CI/CD 配置 | `ci: 添加 GitHub Actions 工作流` |
| `chore` | 杂项维护 | `chore: 更新依赖版本` |
| `revert` | 回退提交 | `revert: 回退 feat(xxx)` |

### 可选 Scope

常用 scope 值供参考（不强制）：

`frontend` · `backend` · `electron` · `api` · `pipeline` · `llm` · `ingestion` · `rules` · `storage` · `feishu` · `scripts` · `docs`

---

## 测试要求

### 运行测试

```bash
# 全部测试
pnpm check

# 仅前端测试 (Vitest)
pnpm check -- --frontend

# 仅后端测试 (Pytest)
pnpm check -- --backend

# 仅 TypeScript 类型检查
pnpm check -- --typecheck
```

### 测试覆盖要求

- **新增功能**：必须附带对应的测试用例
- **Bug 修复**：建议附带复现该 Bug 的测试用例
- **重构**：确保现有测试全部通过

### 前端测试规范

- 测试文件放置在 `frontend/src/__tests__/` 目录
- 文件名格式：`ComponentName.test.tsx` 或 `module.test.ts`
- 使用 Vitest + @testing-library/react + jest-dom
- 测试应覆盖：渲染、交互、边界情况、错误处理

```typescript
// 示例：组件测试
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MyComponent } from '../components/MyComponent'

describe('MyComponent', () => {
  it('应正确渲染标题', () => {
    render(<MyComponent title="测试" />)
    expect(screen.getByText('测试')).toBeInTheDocument()
  })
})
```

### 后端测试规范

- 测试文件放置在 `backend/tests/` 目录
- 文件名格式：`test_module_name.py`
- 使用 Pytest + pytest-asyncio
- 测试应覆盖：正常路径、异常路径、边界条件

```python
# 示例：异步测试
import pytest
from backend.ingestion.dedup import url_hash

class TestDedup:
    def test_url_hash_consistency(self):
        """相同 URL 应产生相同哈希"""
        assert url_hash("https://example.com") == url_hash("https://example.com")

    def test_url_hash_uniqueness(self):
        """不同 URL 应产生不同哈希"""
        assert url_hash("https://a.com") != url_hash("https://b.com")
```

---

## 代码规范

### 通用规则

- **注释语言**：所有代码注释统一使用**中文**
- **缩进**：2 空格（TypeScript / JavaScript / CSS） · 4 空格（Python）
- **行宽**：建议不超过 100 字符

### Python（后端）

- 类型注解：所有函数参数和返回值**必须**添加类型注解
- 异步优先：数据库操作、HTTP 请求使用 `async/await`
- Pydantic：所有 API 请求和响应使用 Pydantic 模型
- 命名：`snake_case`（函数/变量）、`PascalCase`（类）、`UPPER_CASE`（常量）

```python
async def get_article_by_hash(url_hash: str) -> dict | None:
    """根据 URL 哈希获取文章。"""
    ...
```

### TypeScript（前端）

- 严格模式：`tsconfig.json` 启用 `strict`
- 函数组件：使用 `function` 声明式 + `interface` 定义 Props
- 避免 `any`：优先使用泛型或 `unknown`
- API 调用：统一通过 `lib/api.ts` 中的 `fetchJSON<T>()` 函数

```typescript
interface ArticleCardProps {
  article: Article
  onStar: (hash: string) => void
}

function ArticleCard({ article, onStar }: ArticleCardProps) {
  // ...
}
```

### CSS / Tailwind

- 使用 Tailwind 工具类优先，避免自定义 CSS
- 主题色使用 CSS 变量（`var(--color-*)` ），不要硬编码颜色值
- 亮色/暗色样式通过 `globals.css` 中的 CSS 变量统一控制

---

## Pull Request 流程

### 创建 PR 前的检查清单

- [ ] 代码从最新 `main` 分支拉出
- [ ] `pnpm check` 全部通过（TypeScript + 前端测试 + 后端测试）
- [ ] 新功能已附带测试用例
- [ ] 提交信息符合 Conventional Commits 规范
- [ ] 代码注释使用中文

### PR 标题格式

与提交信息格式一致：

```
feat(frontend): 添加文章搜索高亮功能
fix(pipeline): 修复并发抓取时的死锁问题
```

### PR 描述模板

```markdown
## 变更说明

简要描述本次变更的内容和动机。

## 变更类型

- [ ] 新功能 (feat)
- [ ] Bug 修复 (fix)
- [ ] 重构 (refactor)
- [ ] 文档更新 (docs)
- [ ] 测试相关 (test)
- [ ] 其他

## 测试情况

- [ ] 新增 / 修改了测试用例
- [ ] `pnpm check` 全部通过
- [ ] 已在本地验证功能正常

## 截图（如果涉及 UI 变更）

<!-- 粘贴截图 -->
```

### Review 流程

1. PR 创建后自动触发 pre-commit 检查
2. 至少需要 1 位 Reviewer 批准
3. 所有 CI 检查通过后方可合并
4. 合并策略：Squash and merge（保持主分支线性历史）

---

## 版本发布

本项目遵循 [语义化版本 (SemVer)](https://semver.org/lang/zh-CN/) 规范：

| 版本号 | 触发条件 | 示例 |
|--------|----------|------|
| MAJOR (x.0.0) | 不兼容的 API 变更 | 数据库 Schema 重大变更 |
| MINOR (0.x.0) | 向后兼容的新功能 | 新增信源类型支持 |
| PATCH (0.0.x) | 向后兼容的 Bug 修复 | 修复 RSS 解析异常 |

发布由维护者执行：

```bash
pnpm release         # 交互选择 patch/minor/major，并输入 commit message
```

该命令会自动：
1. 递增版本号（`package.json` + `frontend/package.json`）
2. 根据 commit history 生成 `CHANGELOG.md`
3. 创建 Git commit + tag
4. 推送到远程仓库

---

## 常见问题

### Q: pre-commit 钩子太慢怎么办？

pre-commit 会运行完整的 TypeScript 检查和前后端测试，首次可能需要 10-20 秒。如果想临时跳过（不推荐）：

```bash
git commit --no-verify -m "feat: xxx"
```

### Q: Python 虚拟环境找不到？

pre-commit 钩子会自动检测 `venv/` 或 `backend/venv/` 目录。请确保虚拟环境在这两个路径之一。

### Q: 前端 TypeScript 类型报错？

```bash
# 查看具体报错
cd frontend && npx tsc --noEmit
```

### Q: 后端测试某个模块失败？

```bash
# 单独运行某个测试文件
cd backend && python -m pytest tests/test_xxx.py -v
```

### Q: 如何只修改文档？

文档变更不需要跑测试（但 commitlint 仍然生效）。你可以：

```bash
git commit --no-verify -m "docs: 更新 API 文档"
```

---

## 联系方式

- **GitHub Issues**：[提交问题或建议](https://github.com/strawberry-fdf/SearchNewsAgent/issues)
- **GitHub Discussions**：日常讨论与交流

感谢你的贡献！ 🎉
