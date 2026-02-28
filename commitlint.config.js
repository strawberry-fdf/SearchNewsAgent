/**
 * Commitlint 配置 — 强制使用 Conventional Commits 规范
 *
 * 提交格式:  <type>(<scope>): <subject>
 *
 * 允许的 type:
 *   feat     — 新功能
 *   fix      — 修复 Bug
 *   docs     — 仅文档变更
 *   style    — 代码格式（不影响逻辑）
 *   refactor — 重构（不增功能也不修 Bug）
 *   perf     — 性能优化
 *   test     — 添加/修改测试
 *   build    — 构建系统或外部依赖变更
 *   ci       — CI/CD 配置变更
 *   chore    — 杂项（不修改 src/test）
 *   revert   — 回退提交
 *
 * 可选 scope 示例: frontend, backend, electron, pipeline, api, llm, ingestion
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // type 必须是以下之一
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
    // subject 不能为空
    "subject-empty": [2, "never"],
    // type 不能为空
    "type-empty": [2, "never"],
    // subject 最大长度 100 字
    "subject-max-length": [2, "always", 100],
  },
};
