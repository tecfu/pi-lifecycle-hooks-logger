# Design: Lifecycle Hooks Logger Extension

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Pi Agent                        │
│                                                  │
│  lifecycle hooks                                │
│  ────────────────                              │
│  input → before_agent_start → agent_start       │
│  → message_start/update/end → turn_start/end   │
│  → context → before_provider_request/response   │
│  → tool_* → agent_end/agent_settled             │
│                                                  │
│  │                                              │
│  ▼                                              │
│  ┌──────────────────────────────────────────┐  │
│  │  pi-lifecycle-hooks-logger (this ext)   │  │
│  │                                          │  │
│  │  registerFlag("hooks-log-output")        │  │
│  │  resolveOutputPath() ──► path            │  │
│  │  pi.on("hook_name", handler) × 19 hooks  │  │
│  │                                          │  │
│  │  Hook-specific entry builders:           │  │
│  │  buildBaseEntry(), buildMessageEntry(),  │  │
│  │  buildTurnEntry(), buildToolEntry(),     │  │
│  │  buildToolUpdateEntry(), buildToolResult(),│
│  │  buildContextEntry(), buildProviderRequest/Response()│
│  │                                          │  │
│  │  ┌──────────────────────────────────┐   │  │
│  │  │  JSONL writer                    │   │  │
│  │  │  ┌────────────────────────────┐  │   │  │
│  │  │  │  ensureDir(outputPath)     │  │   │  │
│  │  │  │  JSON.stringify(entry)     │  │   │  │
│  │  │  │  appendFileSync(path, line)│  │   │  │
│  │  │  └────────────────────────────┘  │   │  │
│  │  └──────────────────────────────────┘   │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
└─────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│  JSONL log file (e.g. /tmp/pi-lifecycle  │
│  -hooks.jsonl)                           │
│  ───────────────────────────────────────  │
│  {"ts":"...","hook":"input",...}          │
│  {"ts":"...","hook":"before_agent_start",...}│
│  {"ts":"...","hook":"message_start",...}  │
│  ...                                      │
│  (cleared on session_start)               │
└──────────────────────────────────────────┘
```

## Module Structure

```
src/
├── lifecycle-hooks-log-helpers.ts   # Pure functions (testable)
└── lifecycle-hooks-log.ts           # Extension entrypoint
index.ts                             # Re-exports default from src
```

### Pure helpers (`lifecycle-hooks-log-helpers.ts`)

No Pi dependencies. Each factory function takes primitive values and returns a `HookLogEntry`. This makes them trivially testable in isolation.

### Extension entrypoint (`lifecycle-hooks-log.ts`)

Imports helpers, registers the CLI flag, resolves the output path, and wires up 19 Pi lifecycle listeners. Also handles `session_start` to clear the log file.

### Entry point (`index.ts`)

Single re-export so Pi discovers the extension via `package.json`'s `pi.extensions` field.

## Output Format

Every line is a JSON object with these fields:

| Field | Type | Always Present |
|-------|------|----------------|
| `ts` | string (ISO 8601) | yes |
| `createdAt` | number (epoch ms) | yes |
| `session-id` | string | yes |
| `hook` | string | yes |
| `prompt-id` | number | yes |
| `prompt` | string (≤100 chars) | sometimes |
| `model` | string | sometimes |
| `context` | string | sometimes |

Hook-specific fields are appended based on the hook name. No hook produces an invalid JSON line.

## Path Resolution

Three sources, checked in order (first match wins):

1. CLI flag: `--hooks-log-output <path>`
2. Environment variable: `PI_LIFECYCLE_HOOKS_LOG`
3. Default: `/tmp/pi-lifecycle-hooks.jsonl`

## Session Lifecycle

On `session_start`, the log file is truncated to zero bytes and the prompt counter resets. This ensures the file contains only data from the current session.

## Error Handling

File I/O errors are allowed to propagate (they surface as extension warnings). The log is append-only — a single failed write does not corrupt existing entries.