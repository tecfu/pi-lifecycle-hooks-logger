# Spec: Lifecycle Hooks Logger

## Requirements

### R1: Hook Capture

The extension MUST capture all 19 lifecycle hooks from the Prompt → Completion lifecycle.

**Hooks captured:**
- `input`, `before_agent_start`, `agent_start`
- `message_start`, `message_update`, `message_end`
- `turn_start`, `turn_end`
- `context`
- `before_provider_headers`, `before_provider_request`, `after_provider_response`
- `tool_execution_start`, `tool_call`, `tool_execution_update`, `tool_result`, `tool_execution_end`
- `agent_end`, `agent_settled`

**Hooks NOT captured:** (session management, model changes, user_bash)
- `session_before_switch`, `session_shutdown`, `resources_discover`
- `session_before_fork`, `session_before_compact`, `session_compact`
- `session_before_tree`, `session_tree`, `session_info_changed`
- `model_select`, `thinking_level_select`, `user_bash`, `project_trust`

### R2: Output Path Configuration

The extension MUST allow users to configure the log file path via:

1. **CLI flag** (highest priority): `--hooks-log-output <path>`
2. **Environment variable**: `PI_LIFECYCLE_HOOKS_LOG=<path>`
3. **Default** (fallback): `/tmp/pi-lifecycle-hooks.jsonl`

### R3: JSONL Output

Each log line MUST be a valid JSON object containing:

- `ts`: ISO 8601 timestamp string
- `createdAt`: Epoch milliseconds number
- `session-id`: Current session identifier string
- `hook`: The hook name string
- `prompt-id`: Sequential counter per session
- `prompt`: First 100 characters of user prompt (when available)
- `model`: `provider/model-id` format (when available)
- `context`: Human-readable context description (when available)
- `...`: Hook-specific fields appended per hook type

### R4: Hook-Specific Fields

Each hook type MUST produce a consistent set of additional fields:

| Hook | Additional Fields |
|------|-------------------|
| `before_agent_start` | `promptLength`, `hasImages`, `context: "prompt submitted, before agent loop"` |
| `message_start/update/end` | `message-role`, `message-type`, `message-id`, `message-preview` |
| `turn_start` | `turn-index` |
| `turn_end` | `turn-index`, `message-id`, `tool-results-count` |
| `tool_execution_start/call` | `tool-call-id`, `tool-name`, `args-keys` |
| `tool_execution_update` | `tool-call-id`, `tool-name`, `partial-result-preview` |
| `tool_result` | `tool-call-id`, `tool-name`, `is-error`, `content-count` |
| `tool_execution_end` | `tool-call-id`, `tool-name`, `is-error` |
| `context` | `messages-count` |
| `before_provider_request` | `payload-keys` |
| `after_provider_response` | `status`, `headers-keys` |

### R5: Session Lifecycle

On `session_start` event, the extension MUST:

- Truncate the log file to zero bytes
- Reset the prompt counter to 0
- Clear the current prompt text cache
- Show a notification for new/resume/fork session transitions

### R6: Prompt Truncation

User prompt text MUST be truncated to 100 characters with a `…` suffix when exceeding the limit. This applies to all prompt references in log entries.

### R7: Directory Creation

The extension MUST create parent directories of the output path if they do not exist before writing.

### R8: Testability

All pure helper functions MUST be extractable into a module without Pi dependencies, enabling unit testing without the Pi runtime.

## Success Criteria

- All 19 lifecycle hooks produce valid JSONL entries
- Log file path can be configured via CLI flag or environment variable
- A script can parse the log file line-by-line and reconstruct the agent session
- No external dependencies beyond Pi agent itself