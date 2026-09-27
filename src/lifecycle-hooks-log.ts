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

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	buildAfterProviderResponseEntry,
	buildAgentEntry,
	buildBaseEntry,
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
	const flagVal = pi.getFlag("hooks-log-output");
	if (typeof flagVal === "string" && flagVal.length > 0) return flagVal;

	const envVal = process.env[ENV_VAR];
	if (typeof envVal === "string" && envVal.length > 0) return envVal;

	return DEFAULT_OUTPUT;
}

function ensureDir(filePath: string): void {
	const dir = dirname(filePath);
	if (dir !== "." && !existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

let writeErrorReported = false;

function reportWriteError(outputPath: string, error: unknown): void {
	if (writeErrorReported) return;
	writeErrorReported = true;
	process.stderr.write(
		`[pi-lifecycle-hooks-logger] Failed to write ${outputPath}: ${String(error)}\n`,
	);
}

function prepareLog(outputPath: string): void {
	try {
		ensureDir(outputPath);
	} catch (error) {
		reportWriteError(outputPath, error);
	}
}

function writeLog(outputPath: string, entry: Record<string, unknown>): void {
	try {
		ensureDir(outputPath);
		appendFileSync(outputPath, `${JSON.stringify(entry)}\n`);
	} catch (error) {
		// Logging must never break the Pi lifecycle hook that triggered it.
		reportWriteError(outputPath, error);
	}
}

export default function (pi: ExtensionAPI & ExtensionContext) {
	pi.registerFlag("hooks-log-output", {
		description:
			"Path to write lifecycle hooks JSONL log (default: /tmp/pi-lifecycle-hooks.jsonl). Also configurable via PI_LIFECYCLE_HOOKS_LOG env var.",
		type: "string",
	});

	const effectiveOutput = resolveOutputPath(pi);

	// Append-only, never truncated: the default path is shared by every running
	// Pi process, and a truncate from one process eats the others' lines while
	// they are mid-write. Sessions are told apart by "session-id" + "pid".
	// ponytail: no rotation; if the file outgrows /tmp, cap it in logrotate, not here.
	prepareLog(effectiveOutput);

	let currentPromptText: string | undefined;
	let promptId = 0;

	pi.on("session_start", async (event, ctx) => {
		promptId = 0;
		currentPromptText = undefined;
		writeLog(effectiveOutput, {
			...buildBaseEntry(sessionOf(ctx), "session_start", promptId, undefined, modelOf(ctx), event.reason),
			pid: process.pid,
			previousSessionFile: event.previousSessionFile,
		});

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

	// sessionManager and model live on the handler's ctx, not on the ExtensionAPI
	// the factory receives — reading them off `pi` logged "unknown" forever.
	const sessionOf = (ctx?: ExtensionContext) => ctx?.sessionManager?.getSessionId() ?? "unknown";
	const modelOf = (ctx?: ExtensionContext) =>
		ctx?.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;

	pi.on("before_agent_start", async (event, ctx) => {
		writeLog(
			effectiveOutput,
			buildBeforeAgentStartEntry(
				sessionOf(ctx),
				promptId,
				event.prompt,
				event.prompt.length,
				!!event.images?.length,
				modelOf(ctx),
			),
		);
	});

	pi.on("agent_start", async (event, ctx) => {
		writeLog(effectiveOutput, buildAgentEntry(sessionOf(ctx), "agent_start", promptId, currentPromptText, modelOf(ctx)));
	});

	pi.on("agent_end", async (event, ctx) => {
		writeLog(effectiveOutput, buildAgentEntry(sessionOf(ctx), "agent_end", promptId, currentPromptText, modelOf(ctx)));
	});

	// @ts-expect-error - agent_settled is a valid Pi hook but is not present in older overload declarations.
	pi.on("agent_settled", async (event, ctx) => {
		writeLog(effectiveOutput, buildAgentEntry(sessionOf(ctx), "agent_settled", promptId, currentPromptText, modelOf(ctx)));
	});

	// @ts-expect-error - before_provider_headers is a valid Pi hook but is not present in older overload declarations.
	pi.on("before_provider_headers", async (event, ctx) => {
		writeLog(
			effectiveOutput,
			buildBeforeProviderHeadersEntry(sessionOf(ctx), promptId, currentPromptText, modelOf(ctx)),
		);
	});

	const GENERIC_HOOKS = [
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
	] as const;

	for (const hook of GENERIC_HOOKS) {
		const handler = async (event: { [key: string]: unknown }, ctx: ExtensionContext) => {
			const sessionId = () => sessionOf(ctx);
			const model = () => modelOf(ctx);
			const base = () => buildBaseEntry(sessionId(), hook, promptId, currentPromptText, model(), hook);
			let entry = base();

			switch (hook) {
				case "message_start":
				case "message_update":
				case "message_end": {
					const msg = event.message as
						| { role?: string; customType?: string; id?: string; content?: string }
						| undefined;
					entry = buildMessageEntry(sessionId(), hook, promptId, currentPromptText, model(), msg);
					break;
				}
				case "turn_start":
					entry = buildTurnEntry(
						sessionId(),
						"turn_start",
						(event.turnIndex as number) ?? 0,
						promptId,
						currentPromptText,
						model(),
					);
					break;
				case "turn_end": {
					const msg = event.message as
						| { role?: string; customType?: string; id?: string; content?: string }
						| undefined;
					entry = buildTurnEntry(
						sessionId(),
						"turn_end",
						(event.turnIndex as number) ?? 0,
						promptId,
						currentPromptText,
						model(),
						msg,
						event.toolResults as { role?: string }[] | undefined,
					);
					break;
				}
				case "context":
					entry = buildContextEntry(
						sessionId(),
						event.messages as { role?: string }[] | undefined,
						promptId,
						currentPromptText,
						model(),
					);
					break;
				case "before_provider_request":
					entry = buildBeforeProviderRequestEntry(
						sessionId(),
						event.payload as Record<string, unknown> | undefined,
						promptId,
						currentPromptText,
						model(),
					);
					break;
				case "after_provider_response":
					entry = buildAfterProviderResponseEntry(
						sessionId(),
						event.status as number,
						event.headers as Record<string, unknown> ?? {},
						promptId,
						currentPromptText,
						model(),
					);
					break;
				case "tool_execution_start":
				case "tool_call":
					entry = buildToolEntry(
						sessionId(),
						hook,
						event.toolCallId as string,
						event.toolName as string,
						undefined,
						promptId,
						currentPromptText,
						model(),
						event.args as Record<string, unknown> | undefined,
						event.input as Record<string, unknown> | undefined,
					);
					break;
				case "tool_execution_update": {
					const partialResult = typeof event.partialResult === "string"
						? event.partialResult
						: JSON.stringify(event.partialResult);
					entry = buildToolUpdateEntry(
						sessionId(),
						event.toolCallId as string,
						event.toolName as string,
						partialResult,
						promptId,
						currentPromptText,
						model(),
					);
					break;
				}
				case "tool_result":
					entry = buildToolResultEntry(
						sessionId(),
						event.toolCallId as string,
						event.toolName as string,
						event.isError as boolean,
						event.content as { type?: string }[] | undefined,
						promptId,
						currentPromptText,
						model(),
					);
					break;
				case "tool_execution_end":
					entry = buildToolEntry(
						sessionId(),
						"tool_execution_end",
						event.toolCallId as string,
						event.toolName as string,
						event.isError as boolean,
						promptId,
						currentPromptText,
						model(),
					);
					break;
			}

			writeLog(effectiveOutput, entry);
		};

		// @ts-expect-error - the loop is restricted to known Pi hook names, but the overloads are not union-friendly.
		pi.on(hook, handler);
	}
}
