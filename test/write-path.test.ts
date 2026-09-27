import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import lifecycleLog from "../src/lifecycle-hooks-log.ts";

type Handler = (event: never, ctx: never) => unknown;

const out = join(mkdtempSync(join(tmpdir(), "lhl-")), "hooks.jsonl");
const handlers = new Map<string, Handler>();
const pi = {
	on: (name: string, handler: Handler) => handlers.set(name, handler),
	registerFlag: () => {},
	ui: { notify: () => {} },
	getFlag: () => out,
};
const ctx = {
	sessionManager: { getSessionId: () => "sess-abc" },
	model: { provider: "selfhosted-asus-gx10", id: "Qwen/Qwen3.8-Flash-Next" },
};

lifecycleLog(pi as never);

const lines = () => readFileSync(out, "utf8").trimEnd().split("\n");
const fire = async (hook: string, event: Record<string, unknown>) => {
	await handlers.get(hook)?.(event as never, ctx as never);
};

describe("log writing", () => {
	test("session_start never truncates the shared file", async () => {
		writeFileSync(out, "line from another process\n");
		await fire("session_start", { reason: "startup" });
		expect(lines()[0]).toBe("line from another process");
	});

	test("session_start logs a marker with pid and reason", async () => {
		const entry = JSON.parse(lines()[1] as string);
		expect(entry.hook).toBe("session_start");
		expect(entry.context).toBe("startup");
		expect(entry.pid).toBe(process.pid);
	});

	test("session-id and model come from the handler ctx", async () => {
		await fire("agent_start", {});
		await fire("message_end", { message: { role: "assistant" } });
		for (const raw of lines().slice(2)) {
			const entry = JSON.parse(raw);
			expect(entry["session-id"]).toBe("sess-abc");
			expect(entry.model).toBe("selfhosted-asus-gx10/Qwen/Qwen3.8-Flash-Next");
		}
	});
});
