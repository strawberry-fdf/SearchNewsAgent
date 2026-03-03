# 自动发布脚本（Push + Tag + Release）

- Version: 1.0.0
- Last Updated: 2026-03-04
- Code Paths:
  - `scripts/release.mjs`
  - `package.json`

## 功能目的
提供一条命令完成版本递增、提交、打 Tag、推送远端，触发 GitHub Actions 自动构建并发布 Release。

## 使用方式/入口

### 单命令发布（推荐）
- `pnpm ship`

说明：该命令会在一次执行中完成版本选择（交互）、`git add -A`、`git commit`、`git tag`、`git push`、`git push --tags`，随后由 CI 自动发布 GitHub Release。

可选：
- 指定版本级别（不走交互）: `pnpm ship -- patch|minor|major`
- 指定自定义提交信息: `pnpm ship -- patch -m "chore(release): vX.Y.Z"`

执行流程：
1. 自动更新版本号（根 `package.json` + `frontend/package.json`）
2. 自动更新 `CHANGELOG.md`
3. 自动执行 `git commit` + `git tag`
4. 自动执行 `git push` + `git push --tags`
5. 远端 tag 触发 `.github/workflows/release.yml` 自动发版

### 脚本参数（release.mjs）
- `--yes` / `-y`: 跳过交互确认
- `--push`: 强制执行推送
- `--allow-dirty`: 允许并包含当前未提交改动
- `--skip-push` / `--no-push`: 跳过推送
- `--dry-run`: 预览执行，不落盘
- `--build`: 发布后自动执行当前平台打包

示例：
- `node scripts/release.mjs patch --yes --push`
- `node scripts/release.mjs minor --yes --no-push`
- `node scripts/release.mjs patch --yes --push --dry-run`

## 关键约束与边界
- 工作区有未提交改动时（非 `--dry-run`）会中止发布。
- 使用 `--allow-dirty` 或 `--yes` 时，当前工作区改动会被自动纳入本次发布提交。
- 未显式传入 `patch/minor/major` 且使用 `--yes` 时，默认按 `patch` 递增。
- 真正的 GitHub Release 由 CI 在 tag 推送后执行，不在本地脚本直接调用 `gh release`。

## Changelog
- 2026-03-04 **Feat**: 新增无交互发布参数 `--yes --push`，支持一条命令完成 commit/tag/push。
- 2026-03-04 **Feat**: 新增 `--allow-dirty`，支持将当前修改一并发布。
- 2026-03-04 **Update**: 发布入口收敛为单命令 `pnpm ship`，减少分散命令。
- 2026-03-04 **Doc**: 新增自动发布脚本文档。
