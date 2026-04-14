# ERPAuto 文档索引

本文档目录包含 ERPAuto 项目的所有技术文档、用户指南和开发资料。

## 📚 文档分类

### 👥 用户文档 (user/)

面向最终用户的使用指南和配置说明：

| 文档                                                    | 说明             |
| ------------------------------------------------------- | ---------------- |
| [USER_GUIDE.md](user/USER_GUIDE.md)                     | 用户使用指南     |
| [MIGRATION_GUIDE.md](user/MIGRATION_GUIDE.md)           | 迁移指南         |
| [CONFIG_FILE_LOCATION.md](user/CONFIG_FILE_LOCATION.md) | 配置文件位置说明 |

### 🎯 功能特性 (features/)

功能特性说明和业务流程：

| 文档                                                                                        | 说明               |
| ------------------------------------------------------------------------------------------- | ------------------ |
| [user-override-match-feature.md](features/user-override-match-feature.md)                   | 用户覆盖匹配功能   |
| [settings-partial-save.md](features/settings-partial-save.md)                               | 设置部分保存功能   |
| [settings-save-button-flow.md](features/settings-save-button-flow.md)                       | 设置保存按钮流程   |
| [extractor-start-button-flow.md](features/extractor-start-button-flow.md)                   | 提取器启动流程     |
| [validation-handler-refactor-overview.md](features/validation-handler-refactor-overview.md) | 验证处理器重构概览 |
| [use-cleaner-refactor-overview.md](features/use-cleaner-refactor-overview.md)               | Cleaner 重构概览   |

### 🐛 调试指南 (debugging/)

调试指南和快速参考：

| 文档                                                                 | 说明                 |
| -------------------------------------------------------------------- | -------------------- |
| [erp-login-debug-guide.md](debugging/erp-login-debug-guide.md)       | ERP 登录调试指南     |
| [erp-login-debug-quickref.md](debugging/erp-login-debug-quickref.md) | ERP 登录调试快速参考 |

### 🧪 测试文档 (testing/)

测试基础设施、报告、计划：

| 文档                                                                               | 说明               |
| ---------------------------------------------------------------------------------- | ------------------ |
| [TEST_FACTORY_USAGE.md](testing/TEST_FACTORY_USAGE.md)                             | 测试工厂使用指南   |
| [MOCK_LIBRARY_USAGE.md](testing/MOCK_LIBRARY_USAGE.md)                             | Mock 库使用指南    |
| [TEST_FIX_SUMMARY.md](testing/TEST_FIX_SUMMARY.md)                                 | 测试修复总结       |
| [TEST_REVIEW_REPORT.md](testing/TEST_REVIEW_REPORT.md)                             | 测试评审报告       |
| [TEST_QUALITY_REVIEW_REPORT.md](testing/TEST_QUALITY_REVIEW_REPORT.md)             | 测试质量评审报告   |
| [TEST_COVERAGE_IMPROVEMENT_PLAN.md](testing/TEST_COVERAGE_IMPROVEMENT_PLAN.md)     | 测试覆盖率改进计划 |
| [test-improvement-plan.md](testing/test-improvement-plan.md)                       | 测试改进计划       |
| [P2_TEST_FIX_PLAN.md](testing/P2_TEST_FIX_PLAN.md)                                 | P2 测试修复计划    |
| [P2_REFACTOR_SUMMARY.md](testing/P2_REFACTOR_SUMMARY.md)                           | P2 重构总结        |
| [REMAINING_TEST_FAILURES_ANALYSIS.md](testing/REMAINING_TEST_FAILURES_ANALYSIS.md) | 剩余测试失败分析   |
| [SKIPPED_TESTS_EXPLANATION.md](testing/SKIPPED_TESTS_EXPLANATION.md)               | 跳过测试说明       |

### 📦 模块文档

各功能模块的详细文档：

| 目录                   | 说明                        |
| ---------------------- | --------------------------- |
| [cleaner/](cleaner/)   | Cleaner 模块文档            |
| [database/](database/) | 数据库相关文档              |
| [browser/](browser/)   | Playwright 浏览器自动化文档 |

### 👨‍💻 开发者文档 (developer/)

面向开发者的技术文档：

| 子目录                                   | 说明           |
| ---------------------------------------- | -------------- |
| [architecture/](developer/architecture/) | 架构文档       |
| [guides/](developer/guides/)             | 开发指南       |
| [modules/](developer/modules/)           | 模块文档       |
| [README.md](developer/README.md)         | 开发者文档索引 |

**开发指南包括：**

| 文档                                                                    | 说明         |
| ----------------------------------------------------------------------- | ------------ |
| [LOGGING_GUIDE.md](developer/guides/LOGGING_GUIDE.md)                   | 日志使用指南 |
| [LOGGING_IMPLEMENTATION.md](developer/guides/LOGGING_IMPLEMENTATION.md) | 日志实现文档 |

### 📋 计划文档 (plans/)

设计计划和方案：

| 文档                                                   | 说明                 |
| ------------------------------------------------------ | -------------------- |
| [IMPLEMENTATION_PLAN.md](plans/IMPLEMENTATION_PLAN.md) | 实施计划             |
| 更多计划文件...                                        | 按日期命名的计划文档 |

### 📝 发布说明 (releases/)

版本发布说明：

| 文档                            | 说明             |
| ------------------------------- | ---------------- |
| [README.md](releases/README.md) | 发布说明索引     |
| [1.12.0.md](releases/1.12.0.md) | v1.12.0 发布说明 |
| [1.11.1.md](releases/1.11.1.md) | v1.11.1 发布说明 |
| ...                             | 更多历史版本     |

### 🏗️ 内部文档 (internal/)

内部计划、分析、模板：

| 文档                                                                                      | 说明                 |
| ----------------------------------------------------------------------------------------- | -------------------- |
| [optimization-execution-plan.md](internal/optimization-execution-plan.md)                 | 优化执行计划         |
| [Configuration-Architecture-Analysis.md](internal/Configuration-Architecture-Analysis.md) | 配置架构分析         |
| [cleaner-execution-report-template.md](internal/cleaner-execution-report-template.md)     | Cleaner 执行报告模板 |

## 📖 核心文档

以下文档位于根目录，作为项目级参考：

| 文档                                                                         | 说明               |
| ---------------------------------------------------------------------------- | ------------------ |
| [build-and-release-guide.md](build-and-release-guide.md)                     | 构建和发布指南     |
| [portable-auto-update-architecture.md](portable-auto-update-architecture.md) | 便携版自动更新架构 |

## 🔍 快速查找

**按主题查找：**

- 如何使用？ → [user/](user/)
- 如何调试？ → [debugging/](debugging/)
- 如何开发？ → [developer/](developer/)
- 如何测试？ → [testing/](testing/)
- 功能特性？ → [features/](features/)
- 发布历史？ → [releases/](releases/)

---

_最后更新：2026-04-14_
