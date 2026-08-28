import { createServerFn } from "@tanstack/react-start";

export const getCanonDevices = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchCanonDevices } = await import("./canon.server");
  try {
    return { ok: true as const, ...(await fetchCanonDevices()) };
  } catch (error) {
    console.error("Canon fetch failed:", error);
    return {
      ok: false as const,
      devices: [],
      distributorName: null,
      fetchedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});
