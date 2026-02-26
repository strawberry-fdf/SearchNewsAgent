YAML
---
applyTo: 
  - "**/*.cpp"
  - "**/*.c"
  - "**/*.h"
  - "**/*.hpp"
---

# Modern C++ Coding Standards & AI Behavior Rules

## 1. 标准与版本
- **默认标准**: 严格使用现代 C++（C++17/C++20）。禁止使用 C 风格的遗留特性。
- **禁止项**: 
  - 禁止使用宏（`#define`）定义常量或函数，改用 `constexpr` 或 `inline`。
  - 禁止 C 风格强制类型转换（`(int)x`），必须使用 `static_cast`, `dynamic_cast` 等。

## 2. 内存管理与资源保护
- **RAII 原则**: 严格执行“资源获取即初始化”。将内存、文件句柄、锁绑定到对象的生命周期。
- **智能指针**: 
  - 绝对禁止手动 `new` 和 `delete`。
  - 默认使用 `std::unique_ptr` 和 `std::make_unique`。仅在明确需要共享所有权时才使用 `std::shared_ptr`。

## 3. 性能优化与修饰符
- **`const` 正确性**: 不对成员变量进行修改的成员函数必须声明为 `const`。
- **参数传递**: 复杂对象（如 `std::string`, `std::vector`）作为只读参数时，必须通过常量引用传递（`const T&`）。
- **移动语义**: 熟练利用 C++11 移动语义，使用 `std::move` 转移所有权。

## 4. AI 行为指令
- 在生成 C++ 代码时，必须注重内存安全和边界检查。
- 头文件必须包含 `#pragma once` 或标准的 Include Guards。
