const ANALYSIS_CREATE_RUNTIMES = ["node-rt2025", "python-rt2025", "deno-rt2025", "bun-rt2026", "luau-rt2026"] as const;

const DEFAULT_ANALYSIS_RUNTIME = "deno-rt2025";

/** Every runtime the platform stores, so legacy analyses stay readable and filterable. */
const ANALYSIS_RUNTIME_VALUES = ["node-legacy", "python-legacy", "node-rt2025", "python-rt2025", "deno-rt2025", "bun-rt2026", "luau-rt2026", "other"] as const;

type AnalysisCreateRuntime = (typeof ANALYSIS_CREATE_RUNTIMES)[number];

export { ANALYSIS_CREATE_RUNTIMES, ANALYSIS_RUNTIME_VALUES, AnalysisCreateRuntime, DEFAULT_ANALYSIS_RUNTIME };
