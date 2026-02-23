#!/usr/bin/env bun
/**
 * Minimal MCP stdio server exposing an `escapeHatch` tool.
 * When called, writes a signal file so chad knows to stop.
 */
import { writeFileSync } from "node:fs";

const SIGNAL_FILE = process.env.CHAD_SIGNAL_FILE;
if (!SIGNAL_FILE) {
	process.stderr.write("mcp: CHAD_SIGNAL_FILE not set\n");
	process.exit(1);
}

function send(msg: Record<string, unknown>) {
	const json = JSON.stringify(msg);
	process.stdout.write(
		`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`,
	);
}

function handle(msg: Record<string, unknown>) {
	const id = msg.id;
	switch (msg.method) {
		case "initialize":
			send({
				jsonrpc: "2.0",
				id,
				result: {
					protocolVersion: "2024-11-05",
					capabilities: { tools: {} },
					serverInfo: { name: "chad-escape", version: "1.0.0" },
				},
			});
			break;
		case "notifications/initialized":
			// no response needed
			break;
		case "tools/list":
			send({
				jsonrpc: "2.0",
				id,
				result: {
					tools: [
						{
							name: "escapeHatch",
							description:
								"Stop the chad loop runner. Call this when the current step is impossible, blocked, or requires human intervention. Provide a clear reason.",
							inputSchema: {
								type: "object",
								properties: {
									reason: {
										type: "string",
										description: "Why this step cannot be completed",
									},
								},
								required: ["reason"],
							},
						},
					],
				},
			});
			break;
		case "tools/call": {
			const params = msg.params as Record<string, unknown>;
			const args = (params.arguments ?? {}) as Record<string, string>;
			const reason = args.reason ?? "no reason given";
			writeFileSync(SIGNAL_FILE, JSON.stringify({ reason }));
			send({
				jsonrpc: "2.0",
				id,
				result: {
					content: [
						{
							type: "text",
							text: `chad will stop after this iteration. Reason: ${reason}`,
						},
					],
				},
			});
			break;
		}
		default:
			if (id !== undefined) {
				send({
					jsonrpc: "2.0",
					id,
					error: { code: -32601, message: "Method not found" },
				});
			}
	}
}

// --- Read JSON-RPC messages from stdin (Content-Length framing) ---
let inputBuf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
	inputBuf += chunk;
	while (true) {
		const headerEnd = inputBuf.indexOf("\r\n\r\n");
		if (headerEnd === -1) break;
		const header = inputBuf.slice(0, headerEnd);
		const match = header.match(/Content-Length:\s*(\d+)/i);
		if (!match) {
			inputBuf = inputBuf.slice(headerEnd + 4);
			continue;
		}
		const len = Number.parseInt(match[1], 10);
		const bodyStart = headerEnd + 4;
		if (inputBuf.length < bodyStart + len) break;
		const body = inputBuf.slice(bodyStart, bodyStart + len);
		inputBuf = inputBuf.slice(bodyStart + len);
		try {
			handle(JSON.parse(body));
		} catch {
			// malformed message, skip
		}
	}
});
