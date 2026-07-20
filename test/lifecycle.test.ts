import { describe, expect, test } from "bun:test";
import {
	buildAfterProviderResponseEntry,
	buildBeforeAgentStartEntry,
	buildBeforeProviderRequestEntry,
	buildBaseEntry,
	buildContextEntry,
	buildMessageEntry,
	buildToolEntry,
	buildToolResultEntry,
	buildToolUpdateEntry,
	buildTurnEntry,
	modelInfo,
	truncatePrompt,
	MAX_PROMPT_PREVIEW,
} from "../src/lifecycle-hooks-log-helpers.ts";

describe("truncatePrompt", () => {
	test("returns unchanged when shorter than max", () => {
		expect(truncatePrompt("hello")).toBe("hello");
		expect(truncatePrompt("")).toBe("");
		expect(truncatePrompt("a".repeat(MAX_PROMPT_PREVIEW))).toBe("a".repeat(MAX_PROMPT_PREVIEW));
	});

	test("truncates to max with ellipsis suffix", () => {
		const long = "a".repeat(MAX_PROMPT_PREVIEW + 10);
		const result = truncatePrompt(long);

		expect(result.length).toBe(MAX_PROMPT_PREVIEW + 1); // truncated text + …
		expect(result).toContain("…");
		expect(result.startsWith("a")).toBe(true);
		expect(result.slice(-1)).toBe("…");
	});

	test("preserves unicode characters up to max", () => {
		const unicode = "🦊🦊�🦊".repeat(30);
		const result = truncatePrompt(unicode);

		expect(result.length).toBe(MAX_PROMPT_PREVIEW + 1);
		expect(result).toContain("…");
	});
});

describe("modelInfo", () => {
	test("returns formatted string when model present", () => {
		const ctx = { model: { provider: "openai", id: "gpt-4" } } as never;
		expect(modelInfo(ctx)).toBe("openai/gpt-4");
	});

	test("returns undefined when no model", () => {
		const ctx = {} as never;
		expect(modelInfo(ctx)).toBeUndefined();
	});

	test("returns undefined when model is null", () => {
		const ctx = { model: null } as never;
		expect(modelInfo(ctx)).toBeUndefined();
	});

	test("formats empty provider and id", () => {
		const ctx = { model: { provider: "", id: "" } } as never;
		expect(modelInfo(ctx)).toBe("/");
	});
});

describe("buildBaseEntry", () => {
	test("includes all common fields", () => {
		const entry = buildBaseEntry("sess-1", "input", 1, "hello world", "openai/gpt-4", "prompt");

		expect(entry["session-id"]).toBe("sess-1");
		expect(entry.hook).toBe("input");
		expect(entry["prompt-id"]).toBe(1);
		expect(entry.prompt).toBe("hello world");
		expect(entry.model).toBe("openai/gpt-4");
		expect(entry.context).toBe("prompt");
		expect(entry.ts).toBeDefined();
		expect(entry.createdAt).toBeDefined();
	});

	test("omits optional fields when not provided", () => {
		const entry = buildBaseEntry("sess-2", "agent_start", 0);

		expect(entry["prompt-id"]).toBe(0);
		expect(entry.prompt).toBeUndefined();
		expect(entry.model).toBeUndefined();
		expect(entry.context).toBeUndefined();
	});

	test("truncates long prompt text", () => {
		const long = "x".repeat(200);
		const entry = buildBaseEntry("sess-3", "agent_start", 1, long);

		expect(entry.prompt?.length).toBe(101);
		expect(entry.prompt).toContain("…");
	});

	test("timestamp is valid ISO string", () => {
		const entry = buildBaseEntry("sess-4", "agent_start", 1);
		expect(() => new Date(entry.ts)).not.toThrow();
		expect(Number.isNaN(new Date(entry.ts).getTime())).toBe(false);
	});

	test("createdAt is finite number", () => {
		const entry = buildBaseEntry("sess-5", "agent_start", 1);
		expect(Number.isFinite(entry.createdAt)).toBe(true);
		expect(entry.createdAt).toBeGreaterThan(0);
	});
});

describe("buildBeforeAgentStartEntry", () => {
	test("includes prompt metadata fields", () => {
		const entry = buildBeforeAgentStartEntry("sess-1", 1, "my prompt", 9, false, "anthropic/claude-3");

		expect(entry.hook).toBe("before_agent_start");
		expect(entry.prompt).toBe("my prompt");
		expect(entry.promptLength).toBe(9);
		expect(entry.hasImages).toBe(false);
		expect(entry.model).toBe("anthropic/claude-3");
	});

	test("marks images presence", () => {
		const entry = buildBeforeAgentStartEntry("sess-2", 2, "prompt", 5, true);
		expect(entry.hasImages).toBe(true);
	});

	test("context is descriptive", () => {
		const entry = buildBeforeAgentStartEntry("sess-3", 3, "p", 1, false);
		expect(entry.context).toBe("prompt submitted, before agent loop");
	});
});

describe("buildMessageEntry", () => {
	test("extracts role, type, id from message", () => {
		const entry = buildMessageEntry("s1", "message_start", 1, undefined, "o/gpt-4", {
			role: "assistant",
			customType: "text",
			id: "msg-123",
			content: "hello",
		});

		expect(entry["message-role"]).toBe("assistant");
		expect(entry["message-type"]).toBe("text");
		expect(entry["message-id"]).toBe("msg-123");
		expect(entry["message-preview"]).toBe("hello");
	});

	test("truncates long message content", () => {
		const longContent = "c".repeat(200);
		const entry = buildMessageEntry("s2", "message_end", 1, undefined, "o/gpt-4", {
			role: "assistant",
			id: "msg-2",
			content: longContent,
		});

		expect((entry["message-preview"] as string | undefined)?.length).toBe(101);
		expect(entry["message-preview"]).toContain("…");
	});

	test("handles message without content", () => {
		const entry = buildMessageEntry("s3", "message_start", 2, undefined, "o/gpt-4", {
			role: "user",
			id: "msg-3",
		});

		expect(entry["message-role"]).toBe("user");
		expect(entry["message-preview"]).toBeUndefined();
	});

	test("handles undefined message", () => {
		const entry = buildMessageEntry("s4", "message_update", 3, undefined, "o/gpt-4");

		expect(entry["message-role"]).toBeUndefined();
		expect(entry["message-type"]).toBeUndefined();
		expect(entry["message-id"]).toBeUndefined();
		expect(entry["message-preview"]).toBeUndefined();
	});

	test("supports all message hooks", () => {
		const start = buildMessageEntry("s", "message_start", 1);
		expect(start.hook).toBe("message_start");

		const update = buildMessageEntry("s", "message_update", 1);
		expect(update.hook).toBe("message_update");

		const end = buildMessageEntry("s", "message_end", 1);
		expect(end.hook).toBe("message_end");
	});
});

describe("buildTurnEntry", () => {
	test("includes turn index and message id", () => {
		const entry = buildTurnEntry("s1", "turn_start", 3, 2, "prompt", "o/gpt-4");

		expect(entry["turn-index"]).toBe(3);
		expect(entry.hook).toBe("turn_start");
	});

	test("turn_end includes message id and tool results count", () => {
		const entry = buildTurnEntry(
			"s2",
			"turn_end",
			1,
			1,
			"prompt",
			"o/gpt-4",
			{ role: "assistant", id: "msg-1" },
			[{ role: "toolResult" }, { role: "toolResult" }],
		);

		expect(entry["turn-index"]).toBe(1);
		expect(entry["message-id"]).toBe("msg-1");
		expect(entry["tool-results-count"]).toBe(2);
	});

	test("turn_end with no message or tools", () => {
		const entry = buildTurnEntry("s3", "turn_end", 0, 0);

		expect(entry["message-id"]).toBeUndefined();
		expect(entry["tool-results-count"]).toBe(0);
	});

	test("handles undefined message in turn_end", () => {
		const entry = buildTurnEntry("s4", "turn_end", 5, 3, undefined, undefined, undefined, []);

		expect(entry["message-id"]).toBeUndefined();
		expect(entry["tool-results-count"]).toBe(0);
	});

	test("turn_start excludes message and tool fields", () => {
		const entry = buildTurnEntry("s5", "turn_start", 2, 1, "p", "m");

		expect(entry["message-id"]).toBeUndefined();
		expect(entry["tool-results-count"]).toBeUndefined();
	});
});

describe("buildToolEntry", () => {
	test("includes tool id, name, and args keys", () => {
		const entry = buildToolEntry("s1", "tool_call", "tc-1", "read_file", undefined, 1, "p", "m", {
			path: "/foo",
			lines: [1, 2, 3],
		});

		expect(entry["tool-call-id"]).toBe("tc-1");
		expect(entry["tool-name"]).toBe("read_file");
		expect(entry["args-keys"]).toEqual(["path", "lines"]);
		expect(entry["is-error"]).toBeUndefined();
	});

	test("marks error state", () => {
		const entry = buildToolEntry("s2", "tool_execution_end", "tc-2", "write_file", true);
		expect(entry["is-error"]).toBe(true);
	});

	test("uses input when args is undefined", () => {
		const entry = buildToolEntry("s3", "tool_call", "tc-3", "bash", undefined, 1, "p", "m", undefined, {
			command: "ls",
		});

		expect(entry["args-keys"]).toEqual(["command"]);
	});

	test("empty args produces empty keys", () => {
		const entry = buildToolEntry("s4", "tool_call", "tc-4", "tool", undefined, 1, "p", "m", {});
		expect(entry["args-keys"]).toEqual([]);
	});

	test("tool_execution_end omits args-keys", () => {
		const entry = buildToolEntry("s5", "tool_execution_end", "tc-5", "read_file", false, 1, "p", "m", {
			key: "val",
		});

		expect(entry["args-keys"]).toBeUndefined();
		expect(entry["is-error"]).toBe(false);
	});

	test("tool_execution_start includes args-keys", () => {
		const entry = buildToolEntry("s6", "tool_execution_start", "tc-6", "write_file", undefined, 2, "p", "m", {
			path: "/bar",
		});

		expect(entry["args-keys"]).toEqual(["path"]);
	});
});

describe("buildToolUpdateEntry", () => {
	test("truncates string partial results", () => {
		const long = "s".repeat(200);
		const entry = buildToolUpdateEntry("s1", "tc-1", "bash", long, 1, "p", "m");

		expect((entry["partial-result-preview"] as string | undefined)?.length).toBe(101);
		expect(entry["partial-result-preview"]).toContain("…");
	});

	test("stringifies and truncates object results", () => {
		const obj = { data: "x".repeat(200) };
		const entry = buildToolUpdateEntry("s2", "tc-2", "tool", obj, 1, "p", "m");

		expect((entry["partial-result-preview"] as string | undefined)?.length).toBe(101);
		expect(entry["partial-result-preview"]).toContain("…");
	});

	test("short results preserved as-is", () => {
		const entry = buildToolUpdateEntry("s3", "tc-3", "bash", "done", 1, "p", "m");

		expect(entry["partial-result-preview"]).toBe("done");
	});

	test("stringifies empty object", () => {
		const entry = buildToolUpdateEntry("s4", "tc-4", "tool", {}, 1);
		expect(entry["partial-result-preview"]).toBe("{}");
	});
});

describe("buildToolResultEntry", () => {
	test("includes error state and content count", () => {
		const entry = buildToolResultEntry("s1", "tc-1", "read_file", false, [{ type: "text" }], 1, "p", "m");

		expect(entry["is-error"]).toBe(false);
		expect(entry["content-count"]).toBe(1);
	});

	test("marks error", () => {
		const entry = buildToolResultEntry("s2", "tc-2", "bash", true);

		expect(entry["is-error"]).toBe(true);
	});

	test("counts undefined content as zero", () => {
		const entry = buildToolResultEntry("s3", "tc-3", "tool", false, undefined, 1);

		expect(entry["content-count"]).toBe(0);
	});

	test("counts multiple content parts", () => {
		const contents = [
			{ type: "text" },
			{ type: "image" },
			{ type: "text" },
		];
		const entry = buildToolResultEntry("s4", "tc-4", "tool", false, contents, 2);

		expect(entry["content-count"]).toBe(3);
	});
});

describe("buildContextEntry", () => {
	test("includes messages count", () => {
		const messages = [
			{ role: "user" },
			{ role: "assistant" },
			{ role: "user" },
		];
		const entry = buildContextEntry("s1", messages, 1, "p", "m");

		expect(entry["messages-count"]).toBe(3);
	});

	test("count is zero when messages undefined", () => {
		const entry = buildContextEntry("s2", undefined, 2);

		expect(entry["messages-count"]).toBe(0);
	});

	test("count is zero when messages empty", () => {
		const entry = buildContextEntry("s3", [], 3);

		expect(entry["messages-count"]).toBe(0);
	});
});

describe("buildBeforeProviderRequestEntry", () => {
	test("includes payload keys", () => {
		const entry = buildBeforeProviderRequestEntry("s1", { messages: [], model: "gpt-4" }, 1);

		expect(entry["payload-keys"]).toEqual(["messages", "model"]);
	});

	test("empty payload gives empty keys", () => {
		const entry = buildBeforeProviderRequestEntry("s2", {}, 2);
		expect(entry["payload-keys"]).toEqual([]);
	});

	test("undefined payload gives empty keys", () => {
		const entry = buildBeforeProviderRequestEntry("s3", undefined, 3);
		expect(entry["payload-keys"]).toEqual([]);
	});

	test("hook is before_provider_request", () => {
		const entry = buildBeforeProviderRequestEntry("s4");
		expect(entry.hook).toBe("before_provider_request");
	});
});

describe("buildAfterProviderResponseEntry", () => {
	test("includes status and headers keys", () => {
		const headers = { "content-type": "application/json", "content-length": "1234" };
		const entry = buildAfterProviderResponseEntry("s1", 200, headers, 1);

		expect(entry.status).toBe(200);
		expect(entry["headers-keys"]).toEqual(["content-type", "content-length"]);
	});

	test("includes response headers even when many", () => {
		const headers: Record<string, unknown> = {};
		for (let i = 0; i < 5; i++) {
			headers[`x-header-${i}`] = `value-${i}`;
		}
		const entry = buildAfterProviderResponseEntry("s2", 200, headers, 2);

		expect(entry["headers-keys"]).toHaveLength(5);
	});
});

describe("MAX_PROMPT_PREVIEW constant", () => {
	test("is set to 100", () => {
		expect(MAX_PROMPT_PREVIEW).toBe(100);
	});
});