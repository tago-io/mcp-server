/** Exact literal replacement, longest secret first (never interpolated into a RegExp), so overlapping values cannot leave a recognizable remainder. */
function redactSecrets(text: string, knownSecrets: Array<string | undefined>): string {
  const secrets = knownSecrets.filter((secret): secret is string => typeof secret === "string" && secret.length > 0).sort((left, right) => right.length - left.length);

  let safe = text;
  for (const secret of secrets) {
    safe = safe.split(secret).join("[redacted-token]");
  }
  return safe;
}

/** Non-Error, non-string values carry unknown structure and become a generic message instead of being serialized. */
function describeErrorSafely(caught: unknown, knownSecrets: Array<string | undefined>): string {
  const raw = caught instanceof Error ? caught.message : typeof caught === "string" ? caught : "Unknown error (unrecognized failure value)";
  return redactSecrets(raw, knownSecrets);
}

export { describeErrorSafely, redactSecrets };
