import { z } from "zod/v3";

import { responseFormatSchema } from "../../../utils/global-params.model";
import { invalidParamError } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";
import { PermissionCatalog, TARGET_TYPES, TargetType, fetchPermissionCatalog } from "../permission-catalog";

const lookupAccessPermissionsBaseSchema = z.object({
  target_type: z
    .enum(TARGET_TYPES)
    .describe("Which kind of token the grants are for. `analysis` for an analysis script, `run_user` for a TagoRUN user. Access Management governs these two and no others."),
  resource: z.string().describe("Narrow to one resource type, e.g. `device`, `analysis`, `file`. Omit to list every resource this target kind can be granted on.").optional(),
  response_format: responseFormatSchema,
});

type LookupAccessPermissionsSchema = z.infer<typeof lookupAccessPermissionsBaseSchema>;

function renderResource(catalog: PermissionCatalog, targetType: TargetType, resource: string, detailed: boolean): string {
  const grants = catalog.grants[targetType][resource] ?? [];
  const label = catalog.resourceLabels[resource] ?? resource;
  const heading = `### \`${resource}\` (${label})`;

  if (!detailed) {
    return `${heading}\n${grants.map((grant) => `\`${grant.action}\``).join(", ")}`;
  }

  const lines = grants.map((grant) => `- \`${grant.action}\` (${label} / ${grant.label}): ${grant.description}. Match by: ${grant.match_by.join(", ")}`);
  return `${heading}\n${lines.join("\n")}`;
}

async function lookupAccessPermissionsTool(context: ServerContext, params: LookupAccessPermissionsSchema): Promise<string> {
  const catalog = await fetchPermissionCatalog(context);
  const targetType = params.target_type;
  const available = Object.keys(catalog.grants[targetType]).sort();

  if (params.resource !== undefined && !available.includes(params.resource)) {
    throw invalidParamError("resource", `a \`${targetType}\` policy cannot be granted anything on \`${params.resource}\`. Available: ${available.join(", ")}`, '"device"');
  }

  const resources = params.resource !== undefined ? [params.resource] : available;
  const detailed = params.response_format === "detailed";

  const sections = [
    `Grants available to \`${targetType}\` targets. Each entry is one \`actions\` value for a \`permissions\` rule in create_${targetType}_access_policy or update_${targetType}_access_policy, paired with that rule's \`resource\`.`,
    "",
    ...resources.map((resource) => `${renderResource(catalog, targetType, resource, detailed)}\n`),
    "A rule's `match` decides which resources of that type it covers, and must be one of the forms the grant accepts: `any` (all of them), `id` (one, by 24-character ID), `tag` (a key and value the resource carries), `tag_match` (a key whose value must be the same on the target and on the resource), or `path` (a storage prefix, files only). A form the grant does not accept is stored and then never matches.",
  ];

  if (!detailed) {
    sections.push("", 'Concise view. Use response_format: "detailed" for each grant\'s meaning and its accepted match forms.');
  }

  return sections.join("\n");
}

const lookupAccessPermissionsConfigJSON: IToolConfig = {
  name: "lookup_access_permissions",
  description: `Lists the permissions an Access Management policy can grant: for a given kind of token, which resources it can be granted on, which actions each resource offers, and how each action can be scoped.

Use this when an analysis or a TagoRUN user is denied at runtime and you need to know which grant to add, and before writing a policy with create_analysis_access_policy or create_run_user_access_policy, to get the \`resource\`, \`actions\`, and \`match\` values right. The catalog is read from the platform, so it always reflects what the API will actually honour.

The two kinds are not two views of one list. Five resource names appear under both, with different action sets: \`dashboard\` offers a run user \`access\` and \`arrangement\`, and an analysis \`access\` plus six others a run user cannot have. Overlap is partial, never a rule you can assume, so look up the kind you are about to write a policy for.

An analysis calling the SDK's Resources class needs a grant for each thing it touches: sending data to a device it does not own needs \`device\` / \`send_data\`, reading one needs \`device\` / \`get_data\`, and so on.

<example>
{ "target_type": "analysis", "resource": "device", "response_format": "detailed" }
</example>

Key limitations: this describes what can be granted, not what any particular policy grants (use get_access_policy) and not whether a specific token would be allowed; \`run_user\` targets can be granted far less than \`analysis\` targets.`,
  parameters: lookupAccessPermissionsBaseSchema.shape,
  title: "Lookup Access Permissions",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: lookupAccessPermissionsTool,
};

export { lookupAccessPermissionsConfigJSON };
