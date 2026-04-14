# ERPAuto 文档指南

本文档是 ERPAuto 项目文档的**分类指南和编写规范**，用于：

- 指导文档的分类和归档
- 规范新文档的命名和格式
- 帮助开发者快速定位应创建的文档类型

---

## 📚 文档分类体系

### 一、按受众分类

| 分类           | 目录         | 受众       | 内容示例                     |
| -------------- | ------------ | ---------- | ---------------------------- |
| **用户文档**   | `user/`      | 最终用户   | 使用指南、配置说明、迁移指南 |
| **开发者文档** | `developer/` | 开发人员   | 架构设计、开发指南、模块说明 |
| **内部文档**   | `internal/`  | 项目维护者 | 分析报告、优化计划、模板     |

### 二、按内容类型分类

| 分类         | 目录                                | 内容特点                         |
| ------------ | ----------------------------------- | -------------------------------- |
| **功能特性** | `features/`                         | 功能说明、业务流程、重构概览     |
| **调试指南** | `debugging/`                        | 调试指南、快速参考、故障排查     |
| **测试文档** | `testing/`                          | 测试计划、测试报告、测试基础设施 |
| **模块文档** | `cleaner/`, `browser/`, `database/` | 特定模块的详细文档               |
| **计划文档** | `plans/`                            | 设计方案、实施计划               |
| **发布说明** | `releases/`                         | 版本发布记录                     |

---

## 📝 文档命名规范

### 文件名格式

```
<主题>-<子主题>-<类型>.md
```

**规则：**

- 使用**小写字母**和**连字符** (`-`)
- 不使用空格、下划线或大写字母
- 保持简短但有描述性

**示例：**

```
✅ user-override-match-feature.md
✅ settings-partial-save.md
✅ cleaner-validation-flow.md
✅ test-improvement-plan.md

❌ UserOverrideMatchFeature.md    # 驼峰命名
❌ user_override_match.md         # 下划线
❌ user override match.md         # 空格
```

### 类型后缀约定

| 后缀           | 用途       | 示例                                      |
| -------------- | ---------- | ----------------------------------------- |
| `-guide.md`    | 指南类文档 | `erp-login-debug-guide.md`                |
| `-quickref.md` | 快速参考   | `erp-login-debug-quickref.md`             |
| `-flow.md`     | 流程说明   | `settings-save-button-flow.md`            |
| `-feature.md`  | 功能特性   | `user-override-match-feature.md`          |
| `-plan.md`     | 计划方案   | `test-improvement-plan.md`                |
| `-report.md`   | 报告总结   | `TEST_REVIEW_REPORT.md`                   |
| `-template.md` | 模板文件   | `cleaner-execution-report-template.md`    |
| `-overview.md` | 概览说明   | `validation-handler-refactor-overview.md` |

### Plans 路径专用命名规范

`plans/` 目录使用**日期前缀**命名法，便于按时间排序和管理：

```
<YYYY-MM-DD>-<描述>-<类型>.md
```

**类型标识：**

| 类型后缀     | 用途     | 内容重点                               |
| ------------ | -------- | -------------------------------------- |
| `-plan.md`   | 实施计划 | 任务分解、时间线、资源分配、风险评估   |
| `-design.md` | 设计方案 | 技术架构、接口设计、数据模型、决策理由 |

**示例：**

```
✅ 2026-04-13-cleaner-db-persistence-plan.md
✅ 2026-04-13-cleaner-db-persistence-design.md
✅ 2026-04-05-postgresql-integration-plan.md
✅ 2026-04-05-postgresql-integration-design.md

❌ cleaner-db-plan.md              # 缺少日期
❌ 2026-4-13-cleaner-db-plan.md    # 日期格式不正确（应为 2026-04-13）
❌ 2026-04-13-plan-cleaner-db.md   # 类型应在最后
```

**相关文件对：**
同一个项目通常会有配对的计划和设计文档：

- `2026-04-13-cleaner-db-persistence-plan.md` - 实施计划
- `2026-04-13-cleaner-db-persistence-design.md` - 设计方案

使用相同的日期和描述，便于关联查找。

---

## 🗂️ 分类决策流程

创建新文档时，按以下流程确定分类：

```
1. 文档的读者是谁？
   ├─ 最终用户 → user/
   ├─ 开发者 → developer/
   └─ 项目维护者 → internal/ 或其他专业目录

2. 文档的内容类型是什么？
   ├─ 功能说明 → features/
   ├─ 调试帮助 → debugging/
   ├─ 测试相关 → testing/
   ├─ 模块特定 → cleaner/, browser/, database/
   ├─ 设计计划 → plans/
   └─ 发布记录 → releases/

3. 是否需要快速参考？
   └─ 是 → 使用 -quickref.md 后缀，放入 debugging/
```

### 分类示例

| 文档主题          | 正确分类                                              | 理由         |
| ----------------- | ----------------------------------------------------- | ------------ |
| 如何配置 ERP 连接 | `user/config-erp-guide.md`                            | 用户操作指南 |
| 日志系统设计      | `developer/architecture/logging-design.md`            | 架构设计     |
| 登录失败排查      | `debugging/erp-login-quickref.md`                     | 调试快速参考 |
| 测试覆盖率分析    | `testing/coverage-analysis-report.md`                 | 测试报告     |
| 物料清理模块说明  | `cleaner/module-overview.md`                          | 模块文档     |
| 新功能实施计划    | `plans/2026-04-14-new-feature-implementation-plan.md` | 实施计划     |
| 数据库设计文档    | `plans/2026-04-14-database-schema-design.md`          | 设计方案     |

---

## 📋 文档模板

### 指南类文档模板

```markdown
# <功能> 指南

## 概述

简要说明文档目的和适用范围。

## 前置条件

列出使用该功能的前提条件。

## 操作步骤

1. 步骤一
2. 步骤二
3. 步骤三

## 常见问题

- Q: 问题描述
- A: 解决方案

## 相关文档

- [相关文档 1](link)
- [相关文档 2](link)
```

### 功能特性文档模板

```markdown
# <功能名称> 特性说明

## 背景

为什么需要这个功能。

## 功能描述

功能的具体行为和预期结果。

## 用户流程

用户使用该功能的完整流程。

## 技术实现

关键实现细节（可选）。

## 影响范围

对其他模块的影响。
```

### 计划文档模板

```markdown
# <项目名称> 实施计划

## 目标

项目要达成的目标。

## 范围

包含和不包含的内容。

## 任务分解

- [ ] 任务 1
- [ ] 任务 2
- [ ] 任务 3

## 时间线

预计开始和结束时间。

## 风险

可能的风险和应对措施。
```

---

## 🔧 文档维护

### 文档更新

- **功能变更时**：同步更新相关文档
- **发现错误时**：立即修正并提交
- **版本发布时**：更新 `releases/` 中的发布说明

### 文档审查

新文档创建后，应检查：

- [ ] 分类是否正确
- [ ] 命名是否符合规范
- [ ] 是否使用了模板
- [ ] 链接是否有效
- [ ] 是否添加到相关索引

### 废弃文档

过时的文档应：

1. 在文件顶部添加 `> ⚠️ 已废弃` 标记
2. 说明废弃原因和替代文档
3. 在下一个版本发布时移至 `archive/` 目录

---

## 📖 根目录文档

`docs/` 根目录仅保留**跨category的项目级文档**：

| 文档                                   | 用途              |
| -------------------------------------- | ----------------- |
| `README.md`                            | 本文档 - 分类指南 |
| `build-and-release-guide.md`           | 构建和发布流程    |
| `portable-auto-update-architecture.md` | 便携版更新架构    |

**原则**：如果文档不属于特定分类，且对项目整体重要，可放在根目录。

---

## 🔍 找不到合适的分类？

如果现有分类无法容纳你的文档：

1. 检查是否可以归入 `internal/`（内部文档）
2. 考虑是否应该创建新的子目录
3. 在提交 PR 时说明分类理由

---

_最后更新：2026-04-14_
