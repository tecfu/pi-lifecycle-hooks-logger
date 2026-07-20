# pi-lifecycle-hooks-logger

Logs Pi coding agent lifecycle hooks to a JSONL file so orchestration tooling, dashboards, and debugging scripts can observe agent state.

## Install

```sh
pi install npm:pi-lifecycle-hooks-logger
```

For local development from this checkout:

```sh
bun install
```

Pi discovers the extension through `package.json`:

```json
{
  "pi": {
    "extensions": ["./index.ts"]
  }
}
```

## Usage

### Configuring the log file path

The extension accepts a CLI flag and environment variable to set where the JSONL log is written.

```sh
# Via CLI flag (highest priority)
pi --hooks-log-output /var/log/pi-hooks.jsonl

# Via environment variable
PI_LIFECYCLE_HOOKS_LOG=/var/log/pi-hooks.jsonl pi

# Default (when neither flag nor env var is set)
/tmp/pi-lifecycle-hooks.jsonl
```

**Priority order:** CLI flag → environment variable → default.

### Reading the log

Each line is valid JSONL. Standard Unix tools work out of the box:

```sh
# Tail in real time
tail -f /tmp/pi-lifecycle-hooks.jsonl

# Pretty-print a specific hook type
jq 'select(.hook == "tool_call")' /tmp/pi-lifecycle-hooks.jsonl

# Count tool calls by name
jq -r '.hook == "tool_call" ? .["tool-name"] : empty' /tmp/pi-lifecycle-hooks.jsonl \
  | sort | uniq -c | sort -rn

# Track model usage across sessions
jq -r 'select(.model) | .model' /tmp/pi-lifecycle-hooks.jsonl | sort | uniq -c
```

### Log format

Every line is a JSON object. Base fields:

| Field | Type | Always present |
|-------|------|----------------|
| `ts` | string (ISO 8601) | yes |
| `createdAt` | number (epoch ms) | yes |
| `session-id` | string | yes |
| `hook` | string | yes |
| `prompt-id` | number | yes |
| `prompt` | string (≤100 chars) | sometimes |
| `model` | string | sometimes |
| `context` | string | sometimes |

Hook-specific fields are appended based on the hook type (see [Hook fields table](#hook-fields-table) below).

### Hook fields table

| Hook | Additional fields |
|------|-------------------|
| `input` | _(none — tracks prompt text internally)_ |
| `before_agent_start` | `promptLength`, `hasImages`, `context` |
| `agent_start` | _(none)_ |
| `message_start` | `message-role`, `message-type`, `message-id`, `message-preview` |
| `message_update` | `message-role`, `message-type`, `message-id`, `message-preview` |
| `message_end` | `message-role`, `message-type`, `message-id`, `message-preview` |
| `turn_start` | `turn-index` |
| `context` | `messages-count` |
| `before_provider_headers` | _(none)_ |
| `before_provider_request` | `payload-keys` |
| `after_provider_response` | `status`, `headers-keys` |
| `tool_execution_start` | `tool-call-id`, `tool-name`, `args-keys` |
| `tool_call` | `tool-call-id`, `tool-name`, `args-keys` |
| `tool_execution_update` | `tool-call-id`, `tool-name`, `partial-result-preview` |
| `tool_result` | `tool-call-id`, `tool-name`, `is-error`, `content-count` |
| `tool_execution_end` | `tool-call-id`, `tool-name`, `is-error` |
| `turn_end` | `turn-index`, `message-id`, `tool-results-count` |
| `agent_end` | _(none)_ |
| `agent_settled` | _(none)_ |

### Example log line

```json
{
  "ts": "2025-07-19T12:00:00.000Z",
  "createdAt": 1752916800000,
  "session-id": "sess-abc123",
  "hook": "tool_call",
  "prompt-id": 3,
  "prompt": "Summarize the changelog for the last release",
  "model": "anthropic/claude-3.5-sonnet",
  "context": "tool_call",
  "tool-call-id": "tc-789",
  "tool-name": "read_file",
  "args-keys": ["path"]
}
```

## Session lifecycle

On each `session_start` event, the extension:

1. Truncates the log file to zero bytes
2. Resets the prompt counter to 0
3. Clears the cached prompt text
4. Shows a notification for new/resume/fork session transitions

This ensures the log file always contains only data from the current session.

## Lifecycle hooks reference

This extension logs every hook from the **Prompt → Completion** lifecycle. The table below is the authoritative list of all hooks defined by the Pi coding agent.

**Source**: `packages/coding-agent/src/core/extensions/types.ts` and `packages/coding-agent/docs/extensions.md`.

### Prompt → Completion lifecycle (captured)

The extension captures all 19 hooks from this flow:

| # | Hook | Category | Description |
|---|------|----------|-------------|
| 1 | `input` | Input | Fired when user input is received, **before** skill/template expansion. Can intercept, transform, or handle the input. |
| 2 | `before_agent_start` | Agent | Fired after user submits prompt but before the agent loop. Can inject messages and/or modify the system prompt. |
| 3 | `agent_start` | Agent | Fired when the agent loop begins. |
| 4 | `message_start` / `message_update` / `message_end` | Message | Message lifecycle — fires for every user, assistant, and toolResult message. `message_update` fires during assistant streaming. |
| 5 | `turn_start` | Turn | Fired at the start of each turn (one LLM response + tool calls). |
| 6 | `context` | Agent | Fired before each LLM call. Can modify messages non-destructively. |
| 7 | `before_provider_headers` | Provider | Fired after outgoing HTTP headers are assembled, before the provider call. |
| 8 | `before_provider_request` | Provider | Fired after the provider payload is built, right before the request is sent. Can replace the payload. |
| 9 | `after_provider_response` | Provider | Fired after an HTTP response is received, before its stream body is consumed. |
| 10 | — | — | **LLM calls tools** → turns loop back to steps 5–9. |
| 11 | `tool_execution_start` | Tool | Fired before a tool starts executing (in source order during preflight). |
| 12 | `tool_call` | Tool | Fired after `tool_execution_start`, before execution. **Can block** via `{ block: true }`. |
| 13 | `tool_execution_update` | Tool | Fired during tool execution with partial/streaming output. |
| 14 | `tool_result` | Tool | Fired after tool execution finishes, before `tool_execution_end`. **Can modify result.** |
| 15 | `tool_execution_end` | Tool | Fired when a tool finishes executing (in completion order). |
| 16 | `turn_end` | Turn | Fired at the end of each turn. |
| 17 | `agent_end` | Agent | Fired when the agent loop ends. Pi may still auto-retry/compact/retry. |
| 18 | `agent_settled` | Agent | Fired when the agent run has fully settled — no more retry, compaction, or queued continuation. |

### Session lifecycle hooks (not captured)

The extension intentionally does **not** log these hooks, as they are outside a single prompt flow:

| Hook | Trigger |
|------|---------|
| `session_before_switch` | `/new` or `/resume` — can cancel the switch |
| `session_shutdown` | Before session runtime is torn down (exit, reload, switch) |
| `session_start` | After a new/resumed/forked session starts (used internally to clear the log) |
| `resources_discover` | After `session_start` — extensions contribute skill/prompt/theme paths |
| `session_before_fork` | `/fork` or `/clone` — can cancel the fork |
| `session_before_compact` | Before compaction — can cancel or customize |
| `session_compact` | After compaction |
| `session_before_tree` | `/tree` navigation — can customize |
| `session_tree` | After tree navigation |
| `session_info_changed` | `/name` — session display name changed |
| `model_select` | Model changed via `/model`, `Ctrl+P`, or session restore |
| `thinking_level_select` | Thinking level changed |
| `user_bash` | User executes `!` or `!!` bash commands |
| `project_trust` | Project trust check at startup |

### Key details

- **Parallel tool execution**: In parallel mode, sibling tools are preflighted sequentially then executed concurrently. `tool_call` runs in preflight order; `tool_result` and `tool_execution_end` run in completion order.
- **`message_end`**: Handlers can return `{ message }` to replace the finalized message.
- **`context`**: Fires once per LLM call, just before the provider request.
- **`tool_call`**: Runs after `tool_execution_start`. Mutations to `event.input` affect the actual execution, and later handlers see earlier mutations.
- **`ctx.signal`**: Available during active turn events (`tool_call`, `tool_result`, `message_update`, `turn_end`); `undefined` in idle contexts.
- **`tool_result`**: Handlers chain like middleware — each sees the latest result after previous changes.
- **`before_provider_request`**: Handlers run in extension load order; returning `undefined` keeps the payload, any other value replaces it.
- **`before_provider_headers`**: Handlers mutate `event.headers` in place; set a key to `null` to delete it.

## Validate

```sh
bun test              # Run unit tests (68 tests)
bun run check-types   # TypeScript type check
bun run build         # Build bundle
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Pi Agent                        │
│                                                   │
│  lifecycle hooks                                 │
│  ────────────────                                │
│  input → before_agent_start → agent_start        │
│  → message_start/update/end → turn_start/end    │
│  → context → before_provider_request/response   │
│  → tool_* → agent_end/agent_settled             │
│                                                   │
│  │                                               │
│  ▼                                               │
│  ┌────────────────────────────────────────────┐  │
│  │  pi-lifecycle-hooks-logger (this ext)     │  │
│  │                                           │  │
│  │  registerFlag("hooks-log-output")         │  │
│  │  resolveOutputPath() ──► path             │  │
│  │  pi.on("hook_name", handler) × 19 hooks   │  │
│  │                                           │  │
│  │  ┌────────────────────────────────────┐   │  │
│  │  │  Pure helpers (testable, no Pi)    │   │  │
│  │  │  buildBaseEntry()                  │   │  │
│  │  │  buildMessageEntry()               │   │  │
│  │  │  buildTurnEntry()                  │   │  │
│  │  │  buildToolEntry()                  │   │  │
│  │  │  buildToolUpdateEntry()            │   │  │
│  │  │  buildToolResultEntry()            │   │  │
│  │  │  buildContextEntry()               │   │  │
│  │  │  buildProviderRequestEntry()       │   │  │
│  │  │  buildProviderResponseEntry()      │   │  │
│  │  └────────────────────────────────────┘   │  │
│  │                                           │  │
│  │  ┌────────────────────────────────────┐   │  │
│  │  │  JSONL writer                       │   │  │
│  │  │  ensureDir(outputPath)             │   │  │
│  │  │  JSON.stringify(entry)             │   │  │
│  │  │  appendFileSync(path, line)        │   │  │
│  │  └────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
└──────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────┐
│  JSONL log file                            │
│  ──────────────────────────────────────    │
│  {"ts":"...","hook":"input",...}           │
│  {"ts":"...","hook":"before_agent_start",..│
│  {"ts":"...","hook":"message_start",...}   │
│  ...                                       │
│  (cleared on session_start)                │
└────────────────────────────────────────────┘
```

### Module structure

```
src/
├── lifecycle-hooks-log-helpers.ts   # Pure functions (testable in isolation)
└── lifecycle-hooks-log.ts           # Extension entrypoint (wires to Pi)
index.ts                             # Re-exports default; discovered by Pi
```

**`lifecycle-hooks-log-helpers.ts`** — No Pi dependencies. Each factory function takes primitives and returns a `HookLogEntry` record. All 49 unit tests cover this module.

**`lifecycle-hooks-log.ts`** — Imports helpers, registers the CLI flag, resolves the output path, and wires up 19 Pi lifecycle listeners. Handles session lifecycle (clear log, reset counters).

**`index.ts`** — Single re-export so Pi discovers the extension via the `pi.extensions` field in `package.json`.

### Design principles

- **Pure helpers**: Logic that builds log entries is separated from Pi's `ExtensionAPI`. This makes it testable without mocking the entire Pi runtime.
- **Append-only writes**: Each entry is appended atomically. A single failed write does not corrupt the file.
- **No buffering**: Entries are written immediately as hooks fire. No in-memory queue means minimal memory footprint.
- **Zero config**: Works out of the box with `/tmp/pi-lifecycle-hooks.jsonl` as the default output path.
- **Session isolation**: The log is cleared on each `session_start` so it never grows unbounded and never bleeds across sessions.