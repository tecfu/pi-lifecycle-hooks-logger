/**
 * Pure helper functions for the lifecycle hooks logger.
 * Extracted from the extension for testability.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Maximum number of characters to include in a prompt preview. */
export const MAX_PROMPT_PREVIEW = 100;

export interface HookLogEntry {
	ts: string; // ISO timestamp
	createdAt: number; // epoch ms
	"session-id": string;
	hook: string;
	"prompt-id"?: number; // sequential per session, only on prompt-related hooks
	prompt?: string; // first 100 chars of the current prompt
	model?: string; // provider/id of the active model
	context?: string; // hook context description
	[key: string]: unknown; // hook-specific fields
}

/** Truncate a prompt to MAX_PROMPT_PREVIEW characters with ellipsis. */
export function truncatePrompt(prompt: string): string {
	return prompt.length > MAX_PROMPT_PREVIEW
		? `${prompt.slice(0, MAX_PROMPT_PREVIEW)}…`
		: prompt;
}

/** Extract model info from the extension context. */
export function modelInfo(ctx: ExtensionContext): string | undefined {
	return ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
}

/** Build a base log entry with common fields. */
export function buildBaseEntry(
	sessionId: string,
	hook: string,
	promptId: number,
	promptText?: string,
	model?: string,
	context?: string,
): HookLogEntry {
	return {
		ts: new Date().toISOString(),
		createdAt: Date.now(),
		"session-id": sessionId,
		hook,
		"prompt-id": promptId,
		prompt: promptText ? truncatePrompt(promptText) : undefined,
		model,
		context,
	};
}

/** Build a before_agent_start entry with prompt metadata. */
export function buildBeforeAgentStartEntry(
	sessionId: string,
	promptId: number,
	prompt: string,
	promptLength: number,
	hasImages: boolean,
	model?: string,
): HookLogEntry {
	return {
		...buildBaseEntry(sessionId, "before_agent_start", promptId, prompt, model, "prompt submitted, before agent loop"),
		promptLength,
		hasImages,
	};
}

/** Build a message lifecycle entry. */
export function buildMessageEntry(
	sessionId: string,
	hook: "message_start" | "message_update" | "message_end",
	promptId: number,
	promptText?: string,
	model?: string,
	message?: { role?: string; customType?: string; id?: string; content?: string },
): HookLogEntry {
	const entry = buildBaseEntry(sessionId, hook, promptId, promptText, model);

	if (message) {
		entry["message-role"] = message.role;
		entry["message-type"] = message.customType;
		entry["message-id"] = message.id;
		if (message.content && typeof message.content === "string") {
			entry["message-preview"] = truncatePrompt(message.content);
		}
	}

	return entry;
}

/** Build a turn lifecycle entry. */
export function buildTurnEntry(
	sessionId: string,
	hook: "turn_start" | "turn_end",
	turnIndex: number,
	promptId: number,
	promptText?: string,
	model?: string,
	message?: { role?: string; customType?: string; id?: string; content?: string },
	toolResults?: { role?: string }[],
): HookLogEntry {
	const entry = buildBaseEntry(sessionId, hook, promptId, promptText, model);
	entry["turn-index"] = turnIndex;

	if (hook === "turn_end") {
		if (message) {
			entry["message-id"] = message.id;
		}
		entry["tool-results-count"] = toolResults?.length ?? 0;
	}

	return entry;
}

/** Build a tool execution entry. */
export function buildToolEntry(
	sessionId: string,
	hook: "tool_execution_start" | "tool_call" | "tool_execution_end",
	toolCallId: string,
	toolName: string,
	isError?: boolean,
	promptId: number = 0,
	promptText?: string,
	model?: string,
	args?: Record<string, unknown> | undefined,
	input?: Record<string, unknown> | undefined,
): HookLogEntry {
	const entry = buildBaseEntry(sessionId, hook, promptId, promptText, model);
	entry["tool-call-id"] = toolCallId;
	entry["tool-name"] = toolName;

	if (isError !== undefined) {
		entry["is-error"] = isError;
	}

	if (hook === "tool_call" || hook === "tool_execution_start") {
		entry["args-keys"] = Object.keys(args ?? input ?? {});
	}

	return entry;
}

/** Build a tool execution update entry. */
export function buildToolUpdateEntry(
	sessionId: string,
	toolCallId: string,
	toolName: string,
	partialResult: string | object,
	promptId: number = 0,
	promptText?: string,
	model?: string,
): HookLogEntry {
	const entry = buildBaseEntry(sessionId, "tool_execution_update", promptId, promptText, model);
	entry["tool-call-id"] = toolCallId;
	entry["tool-name"] = toolName;
	entry["partial-result-preview"] =
		typeof partialResult === "string"
			? truncatePrompt(partialResult)
			: truncatePrompt(JSON.stringify(partialResult));

	return entry;
}

/** Build a tool result entry. */
export function buildToolResultEntry(
	sessionId: string,
	toolCallId: string,
	toolName: string,
	isError: boolean,
	content?: { type?: string }[],
	promptId: number = 0,
	promptText?: string,
	model?: string,
): HookLogEntry {
	const entry = buildBaseEntry(sessionId, "tool_result", promptId, promptText, model);
	entry["tool-call-id"] = toolCallId;
	entry["tool-name"] = toolName;
	entry["is-error"] = isError;
	entry["content-count"] = content?.length ?? 0;

	return entry;
}

/** Build a context entry. */
export function buildContextEntry(
	sessionId: string,
	messages?: { role?: string }[],
	promptId: number = 0,
	promptText?: string,
	model?: string,
): HookLogEntry {
	const entry = buildBaseEntry(sessionId, "context", promptId, promptText, model);
	entry["messages-count"] = messages?.length ?? 0;

	return entry;
}

/** Build a provider request entry. */
export function buildBeforeProviderRequestEntry(
	sessionId: string,
	payload?: Record<string, unknown>,
	promptId: number = 0,
	promptText?: string,
	model?: string,
): HookLogEntry {
	const entry = buildBaseEntry(sessionId, "before_provider_request", promptId, promptText, model);
	entry["payload-keys"] = payload ? Object.keys(payload) : [];

	return entry;
}

/** Build an agent lifecycle entry (agent_start, agent_end, agent_settled). */
export function buildAgentEntry(
	sessionId: string,
	hook: "agent_start" | "agent_end" | "agent_settled",
	promptId: number = 0,
	promptText?: string,
	model?: string,
): HookLogEntry {
	return buildBaseEntry(sessionId, hook, promptId, promptText, model);
}

/** Build a before_provider_headers entry (no extra fields in current Pi version). */
export function buildBeforeProviderHeadersEntry(
	sessionId: string,
	promptId: number = 0,
	promptText?: string,
	model?: string,
): HookLogEntry {
	return buildBaseEntry(sessionId, "before_provider_headers", promptId, promptText, model);
}

/** Build an after provider response entry. */
export function buildAfterProviderResponseEntry(
	sessionId: string,
	status: number,
	headers: Record<string, unknown>,
	promptId: number = 0,
	promptText?: string,
	model?: string,
): HookLogEntry {
	const entry = buildBaseEntry(sessionId, "after_provider_response", promptId, promptText, model);
	entry.status = status;
	entry["headers-keys"] = Object.keys(headers);

	return entry;
}