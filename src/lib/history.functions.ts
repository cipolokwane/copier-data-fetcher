import { createServerFn } from "@tanstack/react-start";

export const getMeterHistory = createServerFn({ method: "GET" })
  .inputValidator((input: { from: string; to: string }) => input)
  .handler(async ({ data }) => {
    try {
      const { getMeterHistory: loadHistory } = await import("./history.server");
      const result = await loadHistory(data.from, data.to);
      return { ok: true as const, ...result };
    } catch (error) {
      console.error("Meter history lookup failed:", error);
      return {
        ok: false as const,
        snapshots: [],
        truncated: false,
        error: error instanceof Error ? error.message : "Could not load meter history.",
      };
    }
  });

export const getMeterSnapshot = createServerFn({ method: "GET" })
  .inputValidator((input: { sha: string }) => input)
  .handler(async ({ data }) => {
    try {
      const { getMeterSnapshot: loadSnapshot } = await import("./history.server");
      const snapshot = await loadSnapshot(data.sha);
      return { ok: true as const, ...snapshot };
    } catch (error) {
      console.error("Meter snapshot read failed:", error);
      return {
        ok: false as const,
        rows: [],
        csv: "",
        error: error instanceof Error ? error.message : "Could not read this snapshot.",
      };
    }
  });