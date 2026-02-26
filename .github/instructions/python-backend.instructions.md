YAML
---
applyTo: "**/*.py"
---

# Python Back-End Coding Standards & AI Behavior Rules

## 1. 核心技术栈与规范
- **代码风格**: 严格遵循 PEP 8 规范。优先使用 `ruff` 或 `black` 的默认格式化规则。
- **类型提示 (Type Hints)**: 所有函数签名（参数和返回值）**必须**包含明确的类型注解。使用 `typing` 模块（或 Python 3.9+ 原生集合类型）。

## 2. 架构与 API 设计
- **框架约定**: (例如 FastAPI/Django) 保持路由层轻量，将核心业务逻辑抽离到独立的 `services/` 或 `use_cases/` 模块。
- **数据验证**: 使用 `pydantic` 进行严格的数据序列化和校验，绝不信任客户端的裸数据。
- **异常处理**: 禁止使用裸露的 `except:`，必须捕获具体的异常类。业务错误应抛出自定义的 Exception 类并在中间件/异常处理器中统一格式化。

## 3. 性能与安全
- **数据库交互**: 使用 ORM（如 SQLAlchemy）时注意 N+1 查询问题，必要时使用 `selectinload` 或 `joinedload` 提前加载关联数据。
- **日志**: 使用 `logging` 或 `loguru`，禁止在生产代码中提交 `print()`。敏感数据（密码、Token）必须在日志中脱敏。

## 4. AI 行为指令
- 生成代码时，请自动包含必要的 `import` 语句，并将第三方库导入与内置模块导入分块排列。
- 涉及复杂逻辑时，请使用 `pytest` 风格提供简短的单测示例。
