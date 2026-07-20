/**
 * Lifecycle Hooks Log Extension
 *
 * Logs every lifecycle hook found in the Prompt → Completion Lifecycle
 * section to a JSONL file. Each line is a JSON object with timestamp,
 * session-id, hook name, prompt context, model, and hook-specific data.
 *
 * Usage:
 *   --hooks-log-output <path>   Custom log file path (default: /tmp/pi-lifecycle-hooks.jsonl)
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	buildAfterProviderResponseEntry,
	buildAgentEntry,
	buildBeforeAgentStartEntry,
	buildBeforeProviderHeadersEntry,
	buildBeforeProviderRequestEntry,
	buildContextEntry,
	buildMessageEntry,
	buildToolEntry,
	buildToolResultEntry,
	buildToolUpdateEntry,
	buildTurnEntry,
} from "./lifecycle-hooks-log-helpers.ts";

const DEFAULT_OUTPUT = "/tmp/pi-lifecycle-hooks.jsonl";
const ENV_VAR = "PI_LIFECYCLE_HOOKS_LOG";

function resolveOutputPath(pi: ExtensionAPI): string {
	// 1. CLI flag (--hooks-log-output)
	const flagVal = pi.getFlag("hooks-log-output");
	if (typeof flagVal === "string" && flagVal.length > 0) return flagVal;

	// 2. Environment variable
	const envVal = process.env[ENV_VAR];
	if (typeof envVal === "string" && envVal.length > 0) return envVal;

	// 3. Default
	return DEFAULT_OUTPUT;
}

function ensureDir(path: string): void {
	const dir = path.substring(0, path.lastIndexOf("/"));
	if (dir && !existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

function writeLog(outputPath: string, entry: Record<string, unknown>): void {
	ensureDir(outputPath);
	const line = `${JSON.stringify(entry)}\n`;
	appendFileSync(outputPath, line);
}

export default function (pi: ExtensionAPI & ExtensionContext) {
	pi.registerFlag("hooks-log-output", {
		description:
			"Path to write lifecycle hooks JSONL log (default: /tmp/pi-lifecycle-hooks.jsonl). Also configurable via PI_LIFECYCLE_HOOKS_LOG env var.",
		type: "string",
	});

	const effectiveOutput = resolveOutputPath(pi);

	// Overwrite with empty file on load so each process starts clean.
	ensureDir(effectiveOutput);
	writeFileSync(effectiveOutput, "");

	// Tracks the current user prompt text so we can attach it to subsequent
	// lifecycle events within the same turn.
	let currentPromptText: string | undefined;
	// Tracks prompt counter per session.
	let promptId = 0;

	// Clear the file on session start so we don't bleed across session switches.
	pi.on("session_start", async (event) => {
		ensureDir(effectiveOutput);
		writeFileSync(effectiveOutput, "");
		promptId = 0;
		currentPromptText = undefined;

		if (event.reason === "new" || event.reason === "resume" || event.reason === "fork") {
			const prev = event.previousSessionFile ? ` from ${event.previousSessionFile}` : "";
			pi.ui.notify(`Lifecycle hooks log started (session start${prev})`, "info");
		}
	});

	// input: no entry — only captures prompt text for subsequent hooks.
	pi.on("input", async (event) => {
		promptId++;
		currentPromptText = event.text;
	});

	// before_agent_start: custom entry with prompt metadata.
	pi.on("before_agent_start", async (event) => {
		writeLog(effectiveOutput, buildBeforeAgentStartEntry(
			pi.sessionManager.getSessionId() ?? "unknown",
			promptId,
			event.prompt,
			event.prompt.length,
			!!event.images?.length,
			pi.model ? `${pi.model.provider}/${pi.model.id}` : undefined,
		));
	});

	// agent_start: base entry, no extra fields.
	pi.on("agent_start", async () => {
		writeLog(effectiveOutput, buildAgentEntry(
			pi.sessionManager.getSessionId() ?? "unknown",
			"agent_start",
			promptId,
			currentPromptText,
			pi.model ? `${pi.model.provider}/${pi.model.id}` : undefined,
		));
	});

	// agent_end: base entry, no extra fields.
	pi.on("agent_end", async () => {
		writeLog(effectiveOutput, buildAgentEntry(
			pi.sessionManager.getSessionId() ?? "unknown",
			"agent_end",
			promptId,
			currentPromptText,
			pi.model ? `${pi.model.provider}/${pi.model.id}` : undefined,
		));
	});

	// agent_settled: base entry, no extra fields.
	// ponytail: TS can't narrow string into overloaded `pi.on()` signature.
	// @ts-expect-error - hook is valid.
	pi.on("agent_settled", async () => {
		writeLog(effectiveOutput, buildAgentEntry(
			pi.sessionManager.getSessionId() ?? "unknown",
			"agent_settled",
			promptId,
			currentPromptText,
			pi.model ? `${pi.model.provider}/${pi.model.id}` : undefined,
		));
	});

	// before_provider_headers: base entry, no extra fields.
	// ponytail: TS can't narrow string into overloaded `pi.on()` signature.
	// @ts-expect-error - hook is valid.
	pi.on("before_provider_headers", async () => {
		writeLog(effectiveOutput, buildBeforeProviderHeadersEntry(
			pi.sessionManager.getSessionId() ?? "unknown",
			promptId,
			currentPromptText,
			pi.model ? `${pi.model.provider}/${pi.model.id}` : undefined,
		));
	});

	// Generic handlers for the remaining hooks.
	// (input, before_agent_start, agent_start, agent_end, agent_settled,
	//  before_provider_headers handled above)
	const GENERIC_HOOKS: Array<
		| "message_start"
		| "message_update"
		| "message_end"
		| "turn_start"
		| "turn_end"
		| "context"
		| "before_provider_request"
		| "after_provider_response"
		| "tool_execution_start"
		| "tool_call"
		| "tool_execution_update"
		| "tool_result"
		| "tool_execution_end"
	> = [
		"message_start",
		"message_update",
		"message_end",
		"turn_start",
		"turn_end",
		"context",
		"before_provider_request",
		"after_provider_response",
		"tool_execution_start",
		"tool_call",
		"tool_execution_update",
		"tool_result",
		"tool_execution_end",
	];

	for (const hook of GENERIC_HOOKS) {
		// ponytail: TS can't narrow loop variable into overloaded `pi.on()` signatures.
		const handler = async (event: { [key: string]: unknown }) => {
			const entry: Record<string, unknown> = {
				ts: new Date().toISOString(),
				createdAt: Date.now(),
				"session-id": pi.sessionManager.getSessionId() ?? "unknown",
				hook,
				"prompt-id": promptId,
				prompt: currentPromptText,
				model: pi.model ? `${pi.model.provider}/${pi.model.id}` : undefined,
				context: hook,
			};

			switch (hook) {
				case "message_start":
				case "message_update":
				case "message_end": {
					const msg = event.message as
						| { role?: string; customType?: string; id?: string; content?: string }
						| undefined;
					entry["message-role"] = msg?.role;
					entry["message-type"] = msg?.customType;
					entry["message-id"] = msg?.id;
					if (msg?.content && typeof msg.content === "string") {
						entry["message-preview"] = msg.content.slice(0, 100) + (msg.content.length > 100 ? "…" : "");
					}
					break;
				}
				case "turn_start": {
					const turnEntry = buildTurnEntry(
						pi.sessionManager.getSessionId() ?? "unknown",
						"turn_start",
						(event.turnIndex as number) ?? 0,
						promptId,
						currentPromptText,
						pi.model ? `${pi.model.provider}/${pi.model.id}` : undefined,
					);
					Object.assign(entry, turnEntry);
					break;
				}
				case "turn_end": {
					const msg = event.message as
						| { role?: string; customType?: string; id?: string; content?: string }
						| undefined;
					const turnEntry = buildTurnEntry(
						pi.sessionManager.getSessionId() ?? "unknown",
						"turn_end",
						(event.turnIndex as number) ?? 0,
						promptId,
						currentPromptText,
						pi.model ? `${pi.model.provider}/${pi.model.id}` : undefined,
						msg,
						event.toolResults as { role?: string }[] | undefined,
					);
					Object.assign(entry, turnEntry);
					break;
				}
				case "context": {
					const ctxEntry = buildContextEntry(
						pi.sessionManager.getSessionId() ?? "unknown",
						event.messages as { role?: string }[] | undefined,
						promptId,
						currentPromptText,
						pi.model ? `${pi.model.provider}/${pi.model.id}` : undefined,
					);
					Object.assign(entry, ctxEntry);
					break;
				}
				case "before_provider_request": {
					const reqEntry = buildBeforeProviderRequestEntry(
						pi.sessionManager.getSessionId() ?? "unknown",
						event.payload as Record<string, unknown> | undefined,
						promptId,
						currentPromptText,
						pi.model ? `${pi.model.provider}/${pi.model.id}` : undefined,
					);
					Object.assign(entry, reqEntry);
					break;
				}
				case "after_provider_response": {
					const respEntry = buildAfterProviderResponseEntry(
						pi.sessionManager.getSessionId() ?? "unknown",
						event.status as number,
						event.headers as Record<string, unknown> ?? {},
						promptId,
						currentPromptText,
						pi.model ? `${pi.model.provider}/${pi.model.id}` : undefined,
					);
					Object.assign(entry, respEntry);
					break;
				}
				case "tool_execution_start":
				case "tool_call": {
					const toolEntry = buildToolEntry(
						pi.sessionManager.getSessionId() ?? "unknown",
						hook as "tool_execution_start" | "tool_call" | "tool_execution_end",
						event.toolCallId as string,
						event.toolName as string,
						undefined,
						promptId,
						currentPromptText,
						pi.model ? `${pi.model.provider}/${pi.model.id}` : undefined,
						event.args as Record<string, unknown> | undefined,
						event.input as Record<string, unknown> | undefined,
					);
					Object.assign(entry, toolEntry);
					break;
				}
				case "tool_execution_update": {
					const partialResult = typeof event.partialResult === "string"
						? event.partialResult
						: JSON.stringify(event.partialResult);
					const updateEntry = buildToolUpdateEntry(
						pi.sessionManager.getSessionId() ?? "unknown",
						event.toolCallId as string,
						event.toolName as string,
						partialResult,
						promptId,
						currentPromptText,
						pi.model ? `${pi.model.provider}/${pi.model.id}` : undefined,
					);
					Object.assign(entry, updateEntry);
					break;
				}
				case "tool_result": {
					const resultEntry = buildToolResultEntry(
						pi.sessionManager.getSessionId() ?? "unknown",
						event.toolCallId as string,
						event.toolName as string,
						event.isError as boolean,
						event.content as { type?: string }[] | undefined,
						promptId,
						currentPromptText,
						pi.model ? `${pi.model.provider}/${pi.model.id}` : undefined,
					);
					Object.assign(entry, resultEntry);
					break;
				}
				case "tool_execution_end": {
					const endEntry = buildToolEntry(
						pi.sessionManager.getSessionId() ?? "unknown",
						"tool_execution_end",
						event.toolCallId as string,
						event.toolName as string,
						event.isError as boolean,
						promptId,
						currentPromptText,
						pi.model ? `${pi.model.provider}/${pi.model.id}` : undefined,
					);
					Object.assign(entry, endEntry);
					break;
				}
			}

			writeLog(effectiveOutput, entry);
		};
		// ponytail: `pi.on` is overloaded on string literal types; a union can't match any single overload.
		// @ts-expect-error - hook is a known valid event name from the loop.
		pi.on(hook, handler);
	}
}