YAML
---
applyTo: 
  - "**/*.ts"
  - "**/*.tsx"
---

# Front-End (React/TS) Coding Standards & AI Behavior Rules

## 1. 核心技术栈与语言规范
- **严格类型**: 绝对禁止使用 `any`。遇到复杂类型时使用 `unknown` 并进行类型保护（Type Guards）。为所有的 Props、State 定义明确的 `interface` 或 `type`。
- **命名约定**:
  - 组件文件和组件名使用 `PascalCase`（如 `UserProfile.tsx`）。
  - Hooks 必须以 `use` 开头并使用 `camelCase`（如 `useAuth.ts`）。

## 2. 组件架构与状态
- **服务端优先 (Next.js)**: 默认编写 Server Components，仅在需要浏览器 API 或 `useState`/`useEffect` 时才在文件顶部添加 "use client"。
- **状态管理**: 优先使用局部状态。跨组件共享状态使用 Zustand 或 Context，避免超过三层的 Props Drilling。
- **副作用清理**: 所有的 `useEffect` 必须有明确的依赖数组，并在需要时返回清理函数（Cleanup Function）。

## 3. 样式与 UI
- **Tailwind CSS**: 优先使用 Tailwind 工具类。避免直接编写内联 `style`。
- **响应式**: 遵循移动端优先（Mobile-First）原则编写媒体查询断点（如 `sm:`, `md:`, `lg:`）。

## 4. AI 行为指令
- 请直接给出完整的组件代码，不要省略必要的 Imports。
- 优先提供基于组合（Composition）的纯函数组件方案。
