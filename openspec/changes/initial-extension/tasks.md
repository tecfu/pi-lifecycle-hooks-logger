# Tasks: Lifecycle Hooks Logger Extension

## 1. Extract pure helpers into testable module

- [x] 1.1 Create `src/lifecycle-hooks-log-helpers.ts` with all pure functions
- [x] 1.2 Move `truncatePrompt`, `modelInfo`, `buildBaseEntry`, and all hook-specific builders
- [x] 1.3 Export `HookLogEntry` interface and `MAX_PROMPT_PREVIEW` constant
- [x] 1.4 Export `buildAgentEntry` and `buildBeforeProviderHeadersEntry`
- [x] 1.4 Update main extension file to import helpers

## 2. Write tests for pure helpers

- [x] 2.1 `truncatePrompt` — short/long/unicode edge cases
- [x] 2.2 `modelInfo` — present/null/undefined model
- [x] 2.3 `buildBaseEntry` — common fields, optional omission, truncation
- [x] 2.4 `buildBeforeAgentStartEntry` — prompt metadata, images flag
- [x] 2.5 `buildMessageEntry` — role/type/id/content, all 3 hook types
- [x] 2.6 `buildTurnEntry` — turn index, message id, tool results count
- [x] 2.7 `buildToolEntry` — tool id/name, args keys, error state
- [x] 2.8 `buildToolUpdateEntry` — string/object partial results
- [x] 2.9 `buildToolResultEntry` — error flag, content count
- [x] 2.10 `buildContextEntry` — messages count
- [x] 2.11 `buildBeforeProviderRequestEntry` — payload keys
- [x] 2.12 `buildAfterProviderResponseEntry` — status, headers keys
- [x] 2.13 `MAX_PROMPT_PREVIEW` constant value
- [x] 2.14 `buildAgentEntry` — agent_start, agent_end, agent_settled
- [x] 2.15 `buildBeforeProviderHeadersEntry` — no extra fields

## 3. Tests for each of the 19 hooks

- [x] 3.1 `input` — no entry produced (tracks prompt text only)
- [x] 3.2 `before_agent_start` — prompt metadata, images flag
- [x] 3.3 `agent_start` — base entry, no extra fields
- [x] 3.4 `message_start/update/end` — message role, type, id, content preview
- [x] 3.5 `turn_start` — turn index
- [x] 3.6 `turn_end` — turn index, message id, tool results count
- [x] 3.7 `context` — messages count
- [x] 3.8 `before_provider_headers` — base entry, no extra fields
- [x] 3.9 `before_provider_request` — payload keys
- [x] 3.10 `after_provider_response` — status, headers keys
- [x] 3.11 `tool_execution_start` — tool id/name, args keys
- [x] 3.12 `tool_call` — tool id/name, args keys
- [x] 3.13 `tool_execution_update` — partial result preview
- [x] 3.14 `tool_result` — error flag, content count
- [x] 3.15 `tool_execution_end` — error flag
- [x] 3.16 `agent_end` — base entry, no extra fields
- [x] 3.17 `agent_settled` — base entry, no extra fields
- [x] 3.18 Each hook produces correct `.hook` field value
- [x] 3.19 No hook produces unexpected extra fields

## 4. Implement extension entrypoint

## 5. Implement extension entrypoint

- [x] 3.1 Register `hooks-log-output` CLI flag with description
- [x] 3.2 Implement `resolveOutputPath` (flag → env var → default)
- [x] 3.3 Initialize log file on load (truncate)
- [x] 3.4 Wire up `session_start` listener (clear file, reset counters)
- [x] 3.5 Wire up `input` listener (increment prompt counter, store text)
- [x] 3.6 Wire up `before_agent_start` listener with prompt metadata
- [x] 3.7 Wire up generic handler for remaining 17 lifecycle hooks
- [x] 3.8 Handle hook-specific fields via switch statement

## 6. Build and validate

- [x] 4.1 Update `rolldown.config.ts` to target `src/lifecycle-hooks-log.ts`
- [x] 4.2 Update `package.json` files field (remove vim docs)
- [x] 4.3 Run `bun test` — all helpers tested
- [x] 4.4 Run `bun run check-types` — no TypeScript errors
- [x] 4.5 Run `bun run build` — bundle succeeds

## 7. Documentation

- [x] 5.1 Write comprehensive README with installation, usage, architecture
- [x] 5.2 Add OpenSpec change artifacts (proposal, design, spec, tasks)
- [x] 5.3 Update AGENTS.md to remove vim-mode references