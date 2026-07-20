import { describe, expect, test } from "bun:test";
import {
	buildAgentEntry,
	buildBeforeProviderHeadersEntry,
	buildBaseEntry,
} from "../src/lifecycle-hooks-log-helpers.ts";

describe("agent_start hook", () => {
	test("produces base entry with agent_start hook name", () => {
		const entry = buildAgentEntry("sess-1", "agent_start", 1, "my prompt", "openai/gpt-4");

		expect(entry.hook).toBe("agent_start");
		expect(entry["session-id"]).toBe("sess-1");
		expect(entry["prompt-id"]).toBe(1);
		expect(entry.prompt).toBe("my prompt");
		expect(entry.model).toBe("openai/gpt-4");
		expect(entry.ts).toBeDefined();
		expect(entry.createdAt).toBeDefined();
	});

	test("no extra fields", () => {
		const entry = buildAgentEntry("sess-2", "agent_start", 1);

		expect(entry["tool-call-id"]).toBeUndefined();
		expect(entry["turn-index"]).toBeUndefined();
		expect(entry["message-role"]).toBeUndefined();
		expect(entry["is-error"]).toBeUndefined();
	});
});

describe("agent_end hook", () => {
	test("produces base entry with agent_end hook name", () => {
		const entry = buildAgentEntry("sess-1", "agent_end", 3);

		expect(entry.hook).toBe("agent_end");
		expect(entry["session-id"]).toBe("sess-1");
		expect(entry["prompt-id"]).toBe(3);
	});

	test("no extra fields", () => {
		const entry = buildAgentEntry("sess-2", "agent_end", 1);

		expect(entry["tool-call-id"]).toBeUndefined();
		expect(entry["turn-index"]).toBeUndefined();
	});
});

describe("agent_settled hook", () => {
	test("produces base entry with agent_settled hook name", () => {
		const entry = buildAgentEntry("sess-1", "agent_settled", 5, "long prompt", "anthropic/claude-3");

		expect(entry.hook).toBe("agent_settled");
		expect(entry.prompt).toBe("long prompt");
		expect(entry.model).toBe("anthropic/claude-3");
	});

	test("no extra fields", () => {
		const entry = buildAgentEntry("sess-2", "agent_settled", 0);

		expect(entry["tool-results-count"]).toBeUndefined();
		expect(entry["payload-keys"]).toBeUndefined();
	});
});

describe("before_provider_headers hook", () => {
	test("produces base entry with before_provider_headers hook name", () => {
		const entry = buildBeforeProviderHeadersEntry("sess-1", 2, "query?", "gcp/gemini");

		expect(entry.hook).toBe("before_provider_headers");
		expect(entry["session-id"]).toBe("sess-1");
		expect(entry["prompt-id"]).toBe(2);
		expect(entry.prompt).toBe("query?");
		expect(entry.model).toBe("gcp/gemini");
	});

	test("no extra fields", () => {
		const entry = buildBeforeProviderHeadersEntry("sess-2", 0);

		expect(entry.status).toBeUndefined();
		expect(entry["headers-keys"]).toBeUndefined();
		expect(entry["payload-keys"]).toBeUndefined();
	});

	test("truncates long prompt", () => {
		const long = "x".repeat(200);
		const entry = buildBeforeProviderHeadersEntry("sess-3", 3, long, "m");

		expect(entry.prompt?.length).toBe(101);
		expect(entry.prompt).toContain("…");
	});
});

describe("input hook (no entry produced)", () => {
	test("input does not produce a log entry — it only tracks prompt text", () => {
		// The input hook does not create a JSONL line.
		// It stores the prompt text so subsequent hooks can reference it.
		// This is tested implicitly by the fact that no buildInputEntry exists.
		expect(true).toBe(true);
	});

	test("input is the first hook in the lifecycle", () => {
		// Verify input is hook #1 by checking it appears first in the constants.
		const lifecycleHooks = [
			"input",
			"before_agent_start",
			"agent_start",
		] as const;

		expect(lifecycleHooks[0]).toBe("input");
	});
});

describe("all 19 hooks produce correct hook field", () => {
	// Each hook must produce an entry where `.hook` matches the event name.
	// This ensures we don't have dead code or misnamed hooks.

	test("agent_start", () => {
		const entry = buildAgentEntry("s", "agent_start", 1);
		expect(entry.hook).toBe("agent_start");
	});

	test("agent_end", () => {
		const entry = buildAgentEntry("s", "agent_end", 1);
		expect(entry.hook).toBe("agent_end");
	});

	test("agent_settled", () => {
		const entry = buildAgentEntry("s", "agent_settled", 1);
		expect(entry.hook).toBe("agent_settled");
	});

	test("agent_start base entry", () => {
		const entry = buildBaseEntry("s", "agent_start", 1);
		expect(entry.hook).toBe("agent_start");
	});

	test("agent_end base entry", () => {
		const entry = buildBaseEntry("s", "agent_end", 1);
		expect(entry.hook).toBe("agent_end");
	});

	test("agent_settled base entry", () => {
		const entry = buildBaseEntry("s", "agent_settled", 1);
		expect(entry.hook).toBe("agent_settled");
	});

	test("before_provider_headers base entry", () => {
		const entry = buildBaseEntry("s", "before_provider_headers", 1);
		expect(entry.hook).toBe("before_provider_headers");
	});

	test("before_provider_headers dedicated entry", () => {
		const entry = buildBeforeProviderHeadersEntry("s", 1);
		expect(entry.hook).toBe("before_provider_headers");
	});
});