# Cleaner Video Recording Design

Date: 2026-04-17

## Summary

Add an optional video recording capability to the Cleaner execution flow. When enabled, the system records the ERP detail-page handling process for each order and stores videos under `logs/clearner-video-records/<batchId>/`. Videos are retained only for orders whose final persisted status is not `success`; videos for successful orders, including orders that failed initially but succeeded after retry, are deleted automatically.

This design is based on the current Cleaner architecture:

- The execution setting panel already exposes Cleaner-only settings in `CleanerExecutionBar`.
- `processConcurrency` is already persisted through `window.electron.config.updateCleaner(...)` into `config.yaml`.
- Cleaner history is already persisted per `batchId + attemptNumber + orderNumber` in `CleanerOrderHistory`.
- Each order detail is handled in a separate Playwright popup page, which matches the requirement of "one order, one video file" at the page level.

## Goals

- Add a new execution setting to control whether Cleaner records videos.
- Persist that setting using the same config path as `processConcurrency`.
- Save videos under `logs/clearner-video-records/<batchId>/`.
- Use order number as the logical file name.
- Keep all videos for orders whose final order history status is non-`success`.
- Delete videos for orders whose final order history status is `success`.
- Preserve multiple videos for the same order when retry attempts also fail, using an incrementing suffix.

## Non-Goals

- No video playback UI in the current PRD scope.
- No database schema change is required if file retention is derived from existing Cleaner history state.
- No cross-run deduplication is required because `batchId` already isolates one execution.

## Current Code Facts

## Execution Settings

- `CleanerPage.tsx` reads execution settings from `useCleaner()`.
- `CleanerExecutionBar.tsx` already renders:
  - `dryRun`
  - `headless`
  - `processConcurrency`
- `useCleaner.ts` persists `processConcurrency` through `window.electron.config.updateCleaner({ processConcurrency })`.
- `config:getCleaner` / `config:updateCleaner` are already exposed through IPC and stored in `config.yaml`.

## Cleaner Runtime

- `CleanerApplicationService.runCleaner(...)` creates a `batchId`, inserts execution history, runs Cleaner, then calls `saveAttemptToDatabase(...)`.
- `saveAttemptToDatabase(...)` writes per-order final state through `historyDao.updateOrderStatus(...)`.
- Order status currently resolves to:
  - `success` when `detail.errors.length === 0`
  - `failed` when `detail.errors.length > 0`
  - `erp_not_found` when `detail.notFound === true`
- Retry success is recorded via `RetrySuccess = 1`, but the order `Status` still becomes `success`.

## Retry Model

- Inner retry: failed orders are retried inside the same execution attempt by `CleanerService.retryFailedOrders(...)`.
- Outer retry: when the whole run crashes, `CleanerApplicationService` creates attempt 2 and writes a second set of `CleanerExecution` and `CleanerOrderHistory` records.
- Therefore the natural identity for one recorded video is:
  - `batchId`
  - `attemptNumber`
  - `orderNumber`
  - `retry sequence within the same attempt`, if multiple failed recordings must be kept

## Product Rules

## User-Facing Behavior

- Add a new toggle in `执行设置`: `录制处理视频`.
- Default value: `false`.
- Persist the value in Cleaner config, same as `processConcurrency`.
- When disabled, Cleaner behavior is unchanged.
- When enabled, the system records the per-order ERP detail-page process.

## Storage Rules

- Root path: `logs/clearner-video-records/<batchId>/`
- One execution batch corresponds to one directory.
- The logical base name is the order number.
- If the same order has multiple retained failed runs in the same batch, append a numeric suffix:
  - `SC20260101000123.webm`
  - `SC20260101000123__2.webm`
  - `SC20260101000123__3.webm`
- File extension should follow the actual Playwright video output format.

## Retention Rules

- If final persisted order status is `success`, delete all videos for that order in the current batch and current attempt chain.
- If an order fails once and then succeeds on retry, do not keep any video for that order.
- If an order fails and all retries fail, keep every recorded video for that order.
- If an order resolves to a non-success terminal status such as `failed` or `erp_not_found`, keep the video.
- If recording setup fails, Cleaner execution must continue; recording is diagnostic, not blocking.

## Recommended Technical Design

## Config Changes

Add a new Cleaner config field:

```typescript
cleaner: {
  queryBatchSize: number
  processConcurrency: number
  recordVideo: boolean
}
```

Required touch points:

- `src/main/types/config.schema.ts`
- `src/main/services/config/config-manager.ts` default config
- `src/preload/index.d.ts`
- `src/preload/api/materials.ts`
- renderer Cleaner config loader / updater

## Input Flow

Pass `recordVideo` from renderer to main:

```text
CleanerExecutionBar
  -> useCleaner
  -> runCleanerExecution(...)
  -> window.electron.cleaner.runCleaner(...)
  -> CleanerApplicationService.runCleaner(...)
  -> CleanerService.clean(...)
```

This allows the run to decide per batch whether recording is enabled.

## Recording Strategy

Recommended approach:

1. Enable Playwright context-level video recording only when `recordVideo === true`.
2. Record all popup detail pages created during Cleaner execution.
3. After each detail page closes, resolve the generated Playwright video file path.
4. Move or rename that file into `logs/<batchId>/` using the order-based naming convention.
5. Defer final retention cleanup until the order's final persisted result is known.

Reasoning:

- Current code creates one `BrowserContext` in `ErpAuthService.login()`.
- Each order detail is processed in a separate popup `Page`.
- Playwright video is page-based under a recorded context, so this aligns with the current "one detail page, one video" architecture.

Inference:
This should allow one raw video file per detail popup page without forcing a redesign to one context per order. The implementation still needs a small proof-of-concept to confirm popup-page video behavior in this ERP flow.

## Video File Registry

Add an in-memory registry for the current batch, for example:

```typescript
type CleanerVideoArtifact = {
  batchId: string
  attemptNumber: number
  orderNumber: string
  sequence: number
  tempPath: string
  finalPath: string
}
```

The registry should support:

- tracking all videos produced for one order
- deleting all videos for a finally successful order
- preserving all videos for a finally failed order
- handling both inner retry and outer retry attempts cleanly

## Retention Timing

Recommended retention point:

- perform final keep/delete cleanup after `saveAttemptToDatabase(...)` finishes for the attempt
- use the same final status logic as `historyDao.updateOrderStatus(...)`

Why this is safer:

- it matches the persisted truth used by history UI
- it avoids deleting a video too early before retry outcome is known
- it keeps product behavior aligned with your rule: final `success` means no video retained

## Edge Cases

## Retry Success

Case:

- first processing fails and produces video A
- retry succeeds and produces video B
- final order status is `success`

Expected behavior:

- delete A
- delete B

## Retry Failure

Case:

- first processing fails and produces video A
- retry 1 fails and produces video B
- retry 2 fails and produces video C
- final order status is `failed`

Expected behavior:

- keep A, B, C

## ERP Not Found

Case:

- order query returns no detail page / cannot enter ERP detail page

Expected behavior:

- if no page exists, there may be no video file to keep
- final order status remains non-success
- PRD should accept "no video generated" as valid when the detail page never opened

## Outer Retry

Case:

- attempt 1 crashes mid-run
- attempt 2 reruns orders

Expected behavior:

- videos must stay isolated by `attemptNumber`
- cleanup must never delete attempt 2 videos because of attempt 1 status, or vice versa

## UI Changes

- In `CleanerExecutionBar.tsx`, add a new toggle block below `后台模式 (Headless)` and above `并行处理数量`.
- Suggested label: `录制处理视频`
- Suggested help text: `为每个订单详情页生成视频，仅保留最终失败订单的视频`

## Implementation Breakdown

| Area | Change |
|------|--------|
| Renderer | Add `recordVideo` state, config loading, config persistence, execution payload field |
| Preload | Extend `CleanerConfig` IPC typing and `configApi` usage |
| Main config | Add `cleaner.recordVideo` schema and default value |
| Cleaner input types | Extend `CleanerInput` with `recordVideo?: boolean` |
| ERP auth / browser context | Conditionally enable Playwright video recording |
| Cleaner runtime | Capture per-detail-page video artifacts and map them to `orderNumber` |
| Application service | Run final video retention cleanup after order statuses are persisted |
| Logging | Add diagnostic logs for recording enabled, file move, delete, retention outcome |

## Open Questions

1. Should dry-run mode also support video recording?
   Current recommendation: yes, because dry-run is often used for diagnosis.
2. Should login page and top-level query popup videos be retained?
   Current recommendation: no, only order detail page videos participate in naming and retention.
3. Should we expose retained video paths in operation history UI later?
   Current recommendation: not in this scope, but keep naming stable to support a future enhancement.

## Acceptance Criteria

- The execution settings panel contains a persistent `录制处理视频` switch.
- `config.yaml` stores `cleaner.recordVideo`.
- When the switch is off, no video files are generated.
- When the switch is on, videos are generated under `logs/clearner-video-records/<batchId>/`.
- Final successful orders leave no retained video files.
- Orders that remain failed retain all their recorded videos.
- Multiple retained videos for the same order are distinguishable by suffix.
- Recording failures do not interrupt Cleaner execution.
