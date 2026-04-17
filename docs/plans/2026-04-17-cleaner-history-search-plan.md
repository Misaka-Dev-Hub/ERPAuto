# Cleaner History Full-Level Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full-level search (batch + order + material) to the CleanerOperationHistoryModal, using a new backend search API that returns pre-joined three-level nested data, with keyword highlighting in the frontend.

**Architecture:** New `searchHistoryRecords` IPC channel goes through the existing DAO pattern. The DAO method performs a UNION-based SQL query across all three tables to find matching BatchIds, then fetches the full nested data for those batches. The frontend switches between browse mode (paginated) and search mode (full results) based on whether a search query is active.

**Tech Stack:** TypeScript, React, SQL (MySQL/PostgreSQL/SQL Server via dialect abstraction), Electron IPC

---

### Task 1: Add search types to main process

**Files:**
- Modify: `src/main/types/cleaner-history.types.ts` (append at end)
- Modify: `src/shared/ipc-channels.ts` (add new channel)

**Step 1: Add search types to cleaner-history.types.ts**

Append after the existing `GetCleanerBatchesOptions` interface:

```typescript
/** Search options for full-level history search */
export interface SearchCleanerHistoryOptions {
  query: string
  usernames?: string[]
  limit?: number
}

/** A single batch's full nested data for search results */
export interface CleanerSearchBatchResult {
  batch: CleanerBatchStats
  executions: CleanerExecutionRecord[]
  orders: Array<{
    order: CleanerOrderRecord
    materials: CleanerMaterialRecord[]
  }>
}

/** Search response */
export interface CleanerHistorySearchResult {
  batches: CleanerSearchBatchResult[]
  totalMatches: number
}
```

**Step 2: Add IPC channel to ipc-channels.ts**

In the `// Cleaner operation history` section, after `CLEANER_HISTORY_DELETE_BATCH`, add:

```typescript
CLEANER_HISTORY_SEARCH: 'cleanerHistory:search',
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project src/main/tsconfig.json 2>&1 | head -20`
Expected: No new errors related to these types

**Step 4: Commit**

```bash
git add src/main/types/cleaner-history.types.ts src/shared/ipc-channels.ts
git commit -m "feat(cleaner-history): add search types and IPC channel"
```

---

### Task 2: Add search DAO method

**Files:**
- Modify: `src/main/services/database/cleaner-operation-history-dao.ts`

**Step 1: Add imports for new types**

At the top of the file, add to the existing import from `../../types/cleaner-history.types`:

```typescript
import type {
  // ... existing imports ...
  SearchCleanerHistoryOptions,
  CleanerSearchBatchResult,
  CleanerHistorySearchResult
} from '../../types/cleaner-history.types'
```

**Step 2: Add the searchBatches method to the DAO class**

Add this method after the `getBatches` method (around line 707). The strategy:

1. First, find matching BatchIds via a UNION query across all three tables using LIKE.
2. Then fetch full nested data (batch stats, executions, orders, materials) for those batch IDs.

```typescript
// ==================== QUERY: SEARCH ====================

/**
 * Full-level search across batches, orders, and materials
 * Uses UNION to find matching BatchIds, then fetches full nested data
 */
async searchBatches(
  userId: number | undefined,
  options: SearchCleanerHistoryOptions
): Promise<CleanerHistorySearchResult> {
  try {
    const dbService = await this.getDatabaseService()
    const execTable = this.getExecutionTableName()
    const orderTable = this.getOrderTableName()
    const materialTable = this.getMaterialTableName()
    const dialect = this.getDialect()

    const likeValue = `%${options.query}%`
    const limit = options.limit ?? 20

    // Step 1: Find distinct BatchIds matching the query across all tables
    const batchIdSql = `
      SELECT DISTINCT BatchId FROM (
        SELECT e.BatchId FROM ${execTable} e
          WHERE e.BatchId LIKE ${dialect.param(0)}
             OR e.Username LIKE ${dialect.param(0)}
             OR e.Status LIKE ${dialect.param(0)}
        UNION ALL
        SELECT o.BatchId FROM ${orderTable} o
          WHERE o.OrderNumber LIKE ${dialect.param(0)}
             OR o.ProductionId LIKE ${dialect.param(0)}
        UNION ALL
        SELECT m.BatchId FROM ${materialTable} m
          WHERE m.MaterialCode LIKE ${dialect.param(0)}
             OR m.MaterialName LIKE ${dialect.param(0)}
      ) AS matched
      ${userId !== undefined ? `WHERE BatchId IN (SELECT BatchId FROM ${execTable} WHERE UserId = ${dialect.param(1)})` : ''}
      ${options.usernames && options.usernames.length > 0 ? `WHERE BatchId IN (SELECT BatchId FROM ${execTable} WHERE Username IN (${dialect.params(options.usernames.length)}))` : ''}
    `

    const batchIdParams: (string | number)[] = [likeValue]
    if (userId !== undefined) {
      batchIdParams.push(userId)
    }
    if (options.usernames && options.usernames.length > 0) {
      batchIdParams.push(...options.usernames)
    }

    const batchIdResult = await trackDuration(
      async () => await dbService.query(batchIdSql, batchIdParams),
      {
        operationName: 'CleanerOperationHistoryDAO.searchBatches.batchIds',
        context: { operationType: 'SELECT', query: options.query }
      }
    )

    const matchedBatchIds = batchIdResult.result.rows.map((r) => r.BatchId as string)

    if (matchedBatchIds.length === 0) {
      return { batches: [], totalMatches: 0 }
    }

    // Apply limit
    const limitedBatchIds = matchedBatchIds.slice(0, limit)

    // Step 2: For each batch, fetch full nested data in parallel
    const batches: CleanerSearchBatchResult[] = []

    for (const batchId of limitedBatchIds) {
      // Fetch batch stats
      const batchStatsArr = await this.getBatches(userId, { limit: 1 })
      const batchStats = batchStatsArr.find((b) => b.batchId === batchId)
      if (!batchStats) continue

      // Fetch executions + orders
      const details = await this.getBatchDetails(batchId)

      // Fetch materials for all orders
      const ordersWithMaterials = await Promise.all(
        details.orders.map(async (order) => {
          const materials = await this.getMaterialDetails(
            batchId,
            order.attemptNumber,
            order.orderNumber
          )
          return { order, materials }
        })
      )

      batches.push({
        batch: batchStats,
        executions: details.executions,
        orders: ordersWithMaterials
      })
    }

    return {
      batches,
      totalMatches: matchedBatchIds.length
    }
  } catch (error) {
    log.error('Search batches error', {
      operationType: 'SELECT',
      requestId: getRequestId(),
      query: options.query,
      error: error instanceof Error ? error.message : String(error)
    })
    return { batches: [], totalMatches: 0 }
  }
}
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project src/main/tsconfig.json 2>&1 | head -20`
Expected: No errors related to the DAO

**Step 4: Commit**

```bash
git add src/main/services/database/cleaner-operation-history-dao.ts
git commit -m "feat(cleaner-history): add searchBatches DAO method"
```

---

### Task 3: Add IPC handler for search

**Files:**
- Modify: `src/main/ipc/cleaner-history-handler.ts`

**Step 1: Add new IPC handler**

In `registerCleanerHistoryHandlers()`, after the `CLEANER_HISTORY_DELETE_BATCH` handler (before the closing log statement at the end), add:

```typescript
/**
 * Search across all history levels (batches, orders, materials)
 * Admin users search all records, regular users search only their own
 */
ipcMain.handle(
  IPC_CHANNELS.CLEANER_HISTORY_SEARCH,
  async (
    _event,
    options: SearchCleanerHistoryOptions
  ): Promise<IpcResult<CleanerHistorySearchResult>> => {
    return withErrorHandling(async () => {
      const currentUser = SessionManager.getInstance().getUserInfo()

      if (!currentUser) {
        throw new Error('用户未登录')
      }

      if (!options.query || options.query.trim().length === 0) {
        return { batches: [], totalMatches: 0 }
      }

      const userId = currentUser.userType === 'Admin' ? undefined : currentUser.id

      log.info('Searching cleaner history', {
        userId: currentUser.id,
        userType: currentUser.userType,
        query: options.query
      })

      return await dao.searchBatches(userId, {
        ...options,
        query: options.query.trim()
      })
    }, 'cleanerHistory:search')
  }
)
```

**Step 2: Update imports in cleaner-history-handler.ts**

Add to the existing import from `../../types/cleaner-history.types`:

```typescript
import type {
  // ... existing imports ...
  SearchCleanerHistoryOptions,
  CleanerHistorySearchResult
} from '../types/cleaner-history.types'
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project src/main/tsconfig.json 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/main/ipc/cleaner-history-handler.ts
git commit -m "feat(cleaner-history): add search IPC handler"
```

---

### Task 4: Expose search API in preload

**Files:**
- Modify: `src/preload/api/cleaner.ts`

**Step 1: Add search method to cleanerApi**

After the `deleteHistoryBatch` method, add:

```typescript
searchHistoryRecords: (
  options: SearchCleanerHistoryOptions
): Promise<IpcResult<CleanerHistorySearchResult>> =>
  invokeIpc(IPC_CHANNELS.CLEANER_HISTORY_SEARCH, options),
```

**Step 2: Add imports**

Add to the existing import from `../../main/types/cleaner-history.types`:

```typescript
import type {
  // ... existing imports ...
  SearchCleanerHistoryOptions,
  CleanerHistorySearchResult
} from '../../main/types/cleaner-history.types'
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project src/preload/tsconfig.json 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/preload/api/cleaner.ts
git commit -m "feat(cleaner-history): expose search API in preload"
```

---

### Task 5: Add renderer-side types and highlight utility

**Files:**
- Modify: `src/renderer/src/hooks/cleaner/types.ts` (add search result types)
- Create: `src/renderer/src/components/cleaner-history-highlight.tsx`

**Step 1: Add search result types to renderer types**

Append to `src/renderer/src/hooks/cleaner/types.ts`:

```typescript
// Search result types (mirrors main process types)

export interface CleanerHistorySearchOrderResult {
  order: CleanerHistoryOrderRecord
  materials: CleanerHistoryMaterialRecord[]
}

export interface CleanerHistorySearchBatchResult {
  batch: CleanerHistoryBatchStats
  executions: CleanerHistoryExecutionRecord[]
  orders: CleanerHistorySearchOrderResult[]
}

export interface CleanerHistorySearchResult {
  batches: CleanerHistorySearchBatchResult[]
  totalMatches: number
}
```

**Step 2: Create highlight utility**

Create `src/renderer/src/components/cleaner-history-highlight.tsx`:

```tsx
import React from 'react'

/**
 * Highlight matching text with a <mark> tag
 * Case-insensitive matching of the query within text
 */
export function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !text) return text

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()

  const index = lowerText.indexOf(lowerQuery)
  if (index === -1) return text

  const before = text.substring(0, index)
  const match = text.substring(index, index + query.length)
  const after = text.substring(index + query.length)

  return (
    <>
      {before}
      <mark className="bg-yellow-200 text-inherit rounded px-0.5">{match}</mark>
      {highlightText(after, query)}
    </>
  )
}
```

**Step 3: Commit**

```bash
git add src/renderer/src/hooks/cleaner/types.ts src/renderer/src/components/cleaner-history-highlight.tsx
git commit -m "feat(cleaner-history): add renderer search types and highlight utility"
```

---

### Task 6: Integrate search into CleanerOperationHistoryModal

**Files:**
- Modify: `src/renderer/src/components/CleanerOperationHistoryModal.tsx`

This is the largest task. The changes are:

1. Add search state variables
2. Add search bar UI to the toolbar
3. Modify BatchItem to accept pre-loaded data in search mode
4. Switch footer between pagination and search result summary

**Step 1: Add new imports**

Add to the lucide-react import:

```typescript
import { Search, X } from 'lucide-react'
```

Add the highlight utility and new types:

```typescript
import { highlightText } from './cleaner-history-highlight'
import type { CleanerHistorySearchResult } from '../hooks/cleaner/types'
```

**Step 2: Add search state in the main modal component**

After the existing state declarations (around line 651), add:

```typescript
const [searchQuery, setSearchQuery] = useState('')
const [searchInput, setSearchInput] = useState('')
const [searchResult, setSearchResult] = useState<CleanerHistorySearchResult | null>(null)
const [isSearching, setIsSearching] = useState(false)
```

**Step 3: Add the search execution function**

Add after `clearUserFilters`:

```typescript
const executeSearch = useCallback(async () => {
  const trimmed = searchInput.trim()
  if (!trimmed) {
    setSearchQuery('')
    setSearchResult(null)
    return
  }

  setIsSearching(true)
  setSearchQuery(trimmed)
  try {
    const options =
      isAdmin && selectedUsers.length > 0
        ? { query: trimmed, usernames: selectedUsers }
        : { query: trimmed }

    const result = await window.electron.cleaner.searchHistoryRecords(options)
    if (result.success && result.data) {
      setSearchResult(result.data)
    } else {
      setSearchResult({ batches: [], totalMatches: 0 })
    }
  } catch {
    setSearchResult({ batches: [], totalMatches: 0 })
  } finally {
    setIsSearching(false)
  }
}, [searchInput, isAdmin, selectedUsers])

const clearSearch = () => {
  setSearchInput('')
  setSearchQuery('')
  setSearchResult(null)
}
```

**Step 4: Add search bar UI**

In the toolbar section, before the user filter `<div className="mb-3">` block, add the search input:

```tsx
{/* Search bar */}
<div className="flex items-center gap-2 mb-3">
  <div className="relative flex-1">
    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
    <input
      type="text"
      value={searchInput}
      onChange={(e) => setSearchInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void executeSearch()
      }}
      placeholder="搜索批次ID、订单号、物料编码/名称..."
      className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      disabled={loading}
    />
    {searchInput && (
      <button
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        onClick={clearSearch}
      >
        <X size={16} />
      </button>
    )}
  </div>
  <button
    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
    onClick={() => void executeSearch()}
    disabled={isSearching || !searchInput.trim()}
  >
    {isSearching ? '搜索中...' : '搜索'}
  </button>
</div>
```

**Step 5: Modify the batch list section to support search mode**

Replace the batch list section (the `<div className="flex-1 overflow-y-auto">` block) with conditional rendering:

```tsx
{/* Batch list */}
<div className="flex-1 overflow-y-auto">
  {searchQuery ? (
    // Search mode
    isSearching ? (
      <div className="flex items-center justify-center h-32 text-gray-500">搜索中...</div>
    ) : searchResult && searchResult.batches.length > 0 ? (
      <div className="flex flex-col gap-3">
        {searchResult.batches.map((result) => (
          <BatchItem
            key={result.batch.batchId}
            batch={result.batch}
            isAdmin={isAdmin}
            onDelete={handleDeleteBatch}
            onRequestDelete={requestDeleteConfirmation}
            searchQuery={searchQuery}
            preloadedExecutions={result.executions}
            preloadedOrders={result.orders}
          />
        ))}
      </div>
    ) : (
      <div className="flex items-center justify-center h-32 text-gray-500">
        未找到匹配「{searchQuery}」的记录
      </div>
    )
  ) : (
    // Browse mode (existing logic)
    <>
      {loading && batches.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-gray-500">加载中...</div>
      ) : batches.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-gray-500">暂无操作记录</div>
      ) : (
        <div className="flex flex-col gap-3">
          {batches.map((batch) => (
            <BatchItem
              key={batch.batchId}
              batch={batch}
              isAdmin={isAdmin}
              onDelete={handleDeleteBatch}
              onRequestDelete={requestDeleteConfirmation}
            />
          ))}
        </div>
      )}
    </>
  )}
</div>
```

**Step 6: Modify footer for search mode**

Replace the footer section to conditionally show pagination or search summary:

```tsx
{/* Footer */}
<div className="pt-4 border-t border-gray-200 flex justify-center">
  {searchQuery && searchResult ? (
    <div className="flex items-center gap-4">
      <span className="text-sm text-gray-600">
        找到 {searchResult.totalMatches} 个匹配批次
        {searchResult.totalMatches > (searchResult.batches.length) &&
          `（显示前 ${searchResult.batches.length} 个）`}
      </span>
      <button
        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 underline"
        onClick={clearSearch}
      >
        清除搜索
      </button>
    </div>
  ) : (
    <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
      {/* ... existing pagination buttons ... */}
    </div>
  )}
</div>
```

**Step 7: Update BatchItem props and search mode rendering**

Update `BatchItemProps` interface to support optional preloaded data:

```typescript
interface BatchItemProps {
  batch: CleanerHistoryBatchStats
  isAdmin: boolean
  onDelete: (batchId: string) => void
  onRequestDelete: (batchId: string) => Promise<boolean>
  searchQuery?: string
  preloadedExecutions?: ExecutionRecord[]
  preloadedOrders?: Array<{
    order: CleanerHistoryOrderRecord
    materials: CleanerHistoryMaterialRecord[]
  }>
}
```

In the BatchItem component, when `searchQuery` is set and preloaded data is available:
- Start expanded (`isExpanded` initial state: `!!searchQuery`)
- Use preloaded executions/orders directly instead of fetching
- Pass `searchQuery` to text rendering for highlighting

**Step 8: Verify typecheck**

Run: `npm run typecheck`

**Step 9: Commit**

```bash
git add src/renderer/src/components/CleanerOperationHistoryModal.tsx
git commit -m "feat(cleaner-history): integrate search UI into history modal"
```

---

### Task 7: Final verification

**Step 1: Run full typecheck**

Run: `npm run typecheck`

**Step 2: Run linter**

Run: `npm run lint`

**Step 3: Build the project**

Run: `npm run build`

**Step 4: Manual test checklist**

- [ ] Open the Cleaner Operation History Modal
- [ ] Verify search bar appears at top of toolbar
- [ ] Type a keyword and press Enter — results should load
- [ ] Matching batches auto-expand with orders and materials
- [ ] Highlighted text appears with yellow background
- [ ] Clear button (X) resets to browse mode
- [ ] Pagination hidden during search, shown after clearing
- [ ] Admin: user filter combined with search works
- [ ] Regular user: only their own records searched
- [ ] Empty search query does nothing
- [ ] Non-matching query shows "未找到匹配" message
