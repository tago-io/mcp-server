const TOKEN_FIELD_NAMES = new Set(["token", "analysis_token"]);

/** API responses (AnalysisInfo, complete widget objects) can carry token/analysis_token at any depth, so allowlisting top-level fields alone is not a complete boundary. */
function stripTokenFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripTokenFields);
  }
  // The SDK parses timestamps into Date instances, which have no enumerable entries, so the generic branch would turn them into {}. A Date cannot carry a credential field; pass it through.
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "object" && value !== null) {
    const stripped: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (TOKEN_FIELD_NAMES.has(key)) {
        continue;
      }
      stripped[key] = stripTokenFields(entry);
    }
    return stripped;
  }
  return value;
}

export { stripTokenFields };
