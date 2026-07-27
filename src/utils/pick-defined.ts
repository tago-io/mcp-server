/**
 * Returns a shallow copy of `source` with every `undefined`-valued key removed.
 * Centralizes the "assemble a partial wire body from optional inputs" pattern so
 * conditional spreads and key-copy loops do not repeat across mutation handlers.
 */
const pickDefined = <T extends object>(source: T): Partial<T> => {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(source) as [keyof T, T[keyof T]][]) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
};

export { pickDefined };
