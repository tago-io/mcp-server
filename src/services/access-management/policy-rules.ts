import { z } from "zod/v3";

/**
 * The wire grammar for Access Management rules, and the tool-facing vocabulary
 * that replaces it.
 *
 * On the wire a permission's `resource` and a policy's `target` are both bare
 * string tuples whose meaning comes from their length and their separator
 * words. The API validates them as `z.array(z.string())` and nothing more, so a
 * tuple of any other shape is stored happily, parses to nothing when a request
 * is evaluated, and leaves a policy that exists, reads correctly, and grants
 * nothing. Malformed arity is therefore not a wire error, it is a silent
 * failure, which is exactly the class of problem this domain exists to close.
 *
 * The tools accept a tagged `match` object instead and build the tuple here, so
 * the broken shapes cannot be expressed at all.
 */

/** Tuple separator words. Order and spelling are the parser's whole contract. */
const TAG_KEY_SEPARATOR = "tag.key";
const TAG_VALUE_SEPARATOR = "tag.value";

/**
 * How a rule points at what it covers.
 *
 * `path` is a prefix match and only ever appears on the `file` resource; the
 * target matcher has no path branch at all, which is why targets use their own
 * schema below rather than this one.
 */
type MatchSpec = { by: "any" } | { by: "id"; id: string } | { by: "tag"; key: string; value: string } | { by: "tag_match"; key: string } | { by: "path"; path: string };

type MatchBy = MatchSpec["by"];

const matchVariants = {
  any: z.object({
    by: z.literal("any").describe("Covers every resource of this type."),
  }),
  id: z.object({
    by: z.literal("id"),
    id: z.string().length(24, "must be a 24-character ID").describe("The 24-character ID of the single resource this rule covers."),
  }),
  tag: z.object({
    by: z.literal("tag"),
    key: z.string().min(1).describe("Tag key the resource must carry."),
    value: z.string().min(1).describe("Tag value the resource must carry for that key."),
  }),
  tag_match: z.object({
    by: z.literal("tag_match"),
    key: z
      .string()
      .min(1)
      .describe(
        "Tag key whose value must be the SAME on the target and on the resource. Use this to scope an analysis to only the devices sharing its own tag value for this key."
      ),
  }),
  path: z.object({
    by: z.literal("path"),
    path: z.string().min(1).describe("Storage path prefix, e.g. `reports/`. Covers every file whose path starts with it."),
  }),
} as const;

const permissionMatchSchema = z
  .discriminatedUnion("by", [matchVariants.any, matchVariants.id, matchVariants.tag, matchVariants.tag_match, matchVariants.path])
  .describe(
    'Which resources of this type the rule covers. Defaults to {"by": "any"}. Not every resource accepts every form: lookup_access_permissions reports the accepted ones as `match_by`.'
  );

/**
 * Targets take the same forms minus `path`: the target lookup matches on id,
 * tag key/value, tag_match, or nothing at all, and has no path branch, so a
 * path target would be stored and then never resolve to a policy.
 */
const targetMatchSchema = z
  .discriminatedUnion("by", [
    matchVariants.any,
    matchVariants.id,
    matchVariants.tag,
    // Target selection only checks that the target CARRIES this key; it never
    // compares values. That is a different meaning from the identically named
    // form on a permission rule, so it needs its own wording.
    z.object({
      by: z.literal("tag_match"),
      key: z.string().min(1).describe("Tag key the analysis or run user must carry. Any value counts; the value is compared only by a permission rule using the same form."),
    }),
  ])
  .describe(
    'How this target selects the analyses or run users it covers. Required: use {"by": "any"} for every one of the kind this tool targets. The kind itself comes from the tool, not from here.'
  );

/** Builds the wire tuple. Every branch produces an arity the API's parser reads. */
function buildMatchTuple(head: string, match: MatchSpec): string[] {
  switch (match.by) {
    case "any":
      return [head];
    case "id":
      return [head, "id", match.id];
    case "tag":
      return [head, TAG_KEY_SEPARATOR, match.key, TAG_VALUE_SEPARATOR, match.value];
    case "tag_match":
      return [head, "tag_match", match.key];
    case "path":
      return [head, "path", match.path];
  }
}

/**
 * Reads a wire tuple back, mirroring the API's own parser exactly: a tuple it
 * cannot classify yields `undefined` there and here, and a rule the API cannot
 * classify never matches anything. Returning `undefined` rather than guessing
 * is what lets the read tools mark such a rule inert instead of rendering a
 * plausible-looking line for a rule that does nothing.
 */
function parseMatchTuple(tuple: readonly string[]): MatchSpec | undefined {
  if (tuple.length === 5 && tuple[1] === TAG_KEY_SEPARATOR && tuple[3] === TAG_VALUE_SEPARATOR) {
    return { by: "tag", key: tuple[2], value: tuple[4] };
  }

  if (tuple.length === 3) {
    if (tuple[1] === "tag_match") {
      return { by: "tag_match", key: tuple[2] };
    }
    if (tuple[1] === "id") {
      return { by: "id", id: tuple[2] };
    }
    if (tuple[1] === "path") {
      return { by: "path", path: tuple[2] };
    }
  }

  if (tuple.length === 1) {
    return { by: "any" };
  }

  return undefined;
}

/** Human phrasing for a rendered rule, e.g. "device id 61f0...0001". */
function describeMatch(noun: string, match: MatchSpec): string {
  switch (match.by) {
    case "any":
      return `any ${noun}`;
    case "id":
      return `${noun} id \`${match.id}\``;
    case "tag":
      return `${noun} tagged \`${match.key}\` = \`${match.value}\``;
    case "tag_match":
      return `${noun} whose tag \`${match.key}\` matches the target's own value`;
    case "path":
      return `${noun} under path \`${match.path}\``;
  }
}

export { buildMatchTuple, describeMatch, parseMatchTuple, permissionMatchSchema, targetMatchSchema };
export type { MatchBy, MatchSpec };
