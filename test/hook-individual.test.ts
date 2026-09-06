import { describe, expect, test } from "bun:test";
import {
	buildAgentEntry,
	buildBaseEntry,
	buildBeforeProviderHeadersEntry,
	buildMessageEntry,
	MAX_PROMPT_PREVIEW,
} from "../src/lifecycle-hooks-log-helpers.ts";

describe("base lifecycle entries", () => {
	test("include common lifecycle metadata", () => {
		const entry = buildBaseEntry("sess-1", "agent_start", 1, "my prompt", "openai/gpt-4", "agent_start");

		expect(entry.hook).toBe("agent_start");
		expect(entry["session-id"]).toBe("sess-1");
		expect(entry["prompt-id"]).toBe(1);
		expect(entry.prompt).toBe("my prompt");
		expect(entry.model).toBe("openai/gpt-4");
		expect(entry.context).toBe("agent_start");
		expect(entry.ts).toBeDefined();
		expect(entry.createdAt).toBeDefined();
	});

	test("truncates long prompts consistently", () => {
		const prompt = "x".repeat(MAX_PROMPT_PREVIEW + 100);
		const entry = buildBaseEntry("sess-2", "context", 2, prompt);

		expect(entry.prompt).toHaveLength(MAX_PROMPT_PREVIEW + 1);
		expect(entry.prompt).toBe(`${"x".repeat(MAX_PROMPT_PREVIEW)}…`);
	});
});

describe("agent lifecycle hooks", () => {
	test.each(["agent_start", "agent_end", "agent_settled"] as const)("builds %s entries", (hook) => {
		const entry = buildAgentEntry("sess-1", hook, 3, "prompt", "anthropic/claude-3");

		expect(entry.hook).toBe(hook);
		expect(entry["session-id"]).toBe("sess-1");
		expect(entry["prompt-id"]).toBe(3);
		expect(entry.prompt).toBe("prompt");
		expect(entry.model).toBe("anthropic/claude-3");
	});

	test("does not add unrelated fields", () => {
		const entry = buildAgentEntry("sess-2", "agent_end", 1);

		expect(entry["tool-call-id"]).toBeUndefined();
		expect(entry["turn-index"]).toBeUndefined();
		expect(entry["message-role"]).toBeUndefined();
	});
});

describe("before_provider_headers", () => {
	test("builds the expected base entry", () => {
		const entry = buildBeforeProviderHeadersEntry("sess-1", 2, "query?", "gcp/gemini");

		expect(entry.hook).toBe("before_provider_headers");
		expect(entry["session-id"]).toBe("sess-1");
		expect(entry["prompt-id"]).toBe(2);
		expect(entry.prompt).toBe("query?");
		expect(entry.model).toBe("gcp/gemini");
	});
});

describe("message lifecycle hooks", () => {
	test("records message metadata and uses the same prompt bound", () => {
		const prompt = "p".repeat(MAX_PROMPT_PREVIEW + 50);
		const message = {
			role: "assistant",
			customType: "text",
			id: "msg-1",
			content: "c".repeat(MAX_PROMPT_PREVIEW + 50),
		};

		const entry = buildMessageEntry("sess-3", "message_end", 4, prompt, "openai/gpt-5", message);

		expect(entry.hook).toBe("message_end");
		expect(entry.prompt).toHaveLength(MAX_PROMPT_PREVIEW + 1);
		expect(entry["message-role"]).toBe("assistant");
		expect(entry["message-type"]).toBe("text");
		expect(entry["message-id"]).toBe("msg-1");
		expect(entry["message-preview"]).toHaveLength(MAX_PROMPT_PREVIEW + 1);
	});

	test("does not add message fields when the message is absent", () => {
		const entry = buildMessageEntry("sess-4", "message_start", 1, "prompt");

		expect(entry["message-role"]).toBeUndefined();
		expect(entry["message-type"]).toBeUndefined();
		expect(entry["message-id"]).toBeUndefined();
		expect(entry["message-preview"]).toBeUndefined();
	});
});
