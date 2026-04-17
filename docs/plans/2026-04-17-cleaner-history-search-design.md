# Cleaner Operation History - Full-Level Search Design

Date: 2026-04-17

## Summary

Add a full-level search feature to `CleanerOperationHistoryModal` that allows users to search across batches, orders, and materials by entering a single keyword. A new backend search API returns pre-joined three-level nested data, and the frontend renders it with keyword highlighting.

## Interaction Design

- **Search bar**: placed in the toolbar area, above the user filter chips, with a search icon and clear button.
- **Trigger**: press Enter or click the search button (no per-keystroke requests).
- **Search mode behavior**:
  - Hides pagination controls (results are cross-page).
  - Matching batches auto-expand with orders and materials displayed directly.
  - Non-matching levels are hidden.
  - Clearing the search box returns to normal browse mode.
- **Highlighting**: matched text wrapped in `<mark>` with yellow background.
- **Empty result**: shows "未找到匹配的记录" message.
- **Result cap**: backend limits to 20 batches; if truncated, shows a hint.

## Search Fields

| Level | Searchable fields |
|-------|-------------------|
| Batch | `batchId`, `username`, `status` |
| Order | `orderNumber`, `productionId` |
| Material | `materialCode`, `materialName` |

## Data Flow

```
renderer: window.electron.cleaner.searchHistoryRecords(query, options)
  → preload: expose searchHistoryRecords
    → main IPC handler: cleaner:searchHistoryRecords
      → service/DAO: searchCleanerHistory(searchQuery, options)
        → DB query (JOIN batches + orders + materials, LIKE filter)
```

### Input Types

```typescript
interface SearchCleanerHistoryOptions {
  query: string
  usernames?: string[]    // admin-only user scope
  limit?: number          // default 20
}
```

### Response Type

```typescript
interface CleanerHistorySearchResult {
  batches: Array<{
    batch: CleanerHistoryBatchStats
    executions: ExecutionRecord[]
    orders: Array<{
      order: CleanerHistoryOrderRecord
      materials: CleanerHistoryMaterialRecord[]
    }>
  }>
  totalMatches: number
}
```

## Frontend Changes

1. **Modal top-level**: add `searchMode` / `searchQuery` state; switch data source between search API and paginated API.
2. **Toolbar**: add search input with Search icon and clear button.
3. **BatchItem**: accept optional pre-loaded `orders` + `materials` props; skip lazy-loading in search mode.
4. **Highlight utility**: `highlightText(text: string, query: string)` wraps matches in `<mark>` tags.
5. **Footer**: hide pagination in search mode; show "找到 X 个批次" + "清除搜索" button.

## Backend Changes

| File | Change |
|------|--------|
| `src/main/types/cleaner-history.types.ts` | Add `SearchCleanerHistoryOptions`, `CleanerHistorySearchResult` types |
| DAO (cleaner history) | Add `searchCleanerHistory` method with SQL LIKE across joined tables |
| Service (cleaner) | Add `searchHistoryRecords` method |
| IPC handler | Register `cleaner:searchHistoryRecords` channel |
| Preload | Expose `searchHistoryRecords` method |
| `src/renderer/src/hooks/cleaner/types.ts` | Sync search result types |

## Affected Files

- `src/main/types/cleaner-history.types.ts` — new types
- `src/main/services/database/cleaner-history-dao.ts` (or similar) — new search method
- `src/main/services/cleaner-service.ts` (or similar) — new search method
- `src/main/ipc/cleaner-handler.ts` (or similar) — new IPC channel
- `src/preload/index.ts` (or cleaner-specific) — expose search API
- `src/renderer/src/hooks/cleaner/types.ts` — sync types
- `src/renderer/src/components/CleanerOperationHistoryModal.tsx` — search UI + state
- `src/renderer/src/components/cleaner-history-highlight.ts` — highlight utility (new file)
