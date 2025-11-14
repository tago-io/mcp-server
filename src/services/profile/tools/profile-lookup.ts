import { z } from "zod";
import { Resources, SecretsQuery } from "@tago-io/sdk";

import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";

const profileLookupSchema = z.object({
  operation: z.enum(["profile_info", "secrets_list"]).describe("Operation to perform. 'profile_info' gets current profile information, 'secrets_list' lists profile secrets"),
  secrets_query: z
    .object({
      amount: z.number().optional().describe("Number of secrets to retrieve (pagination)"),
      orderBy: z.enum(["created_at", "updated_at", "key"]).optional().describe("Field to order results by. Available options: created_at, updated_at, key"),
      filter: z
        .object({
          id: z.string().optional().describe("Filter by secret ID"),
          key: z.string().optional().describe("Filter by secret key name"),
        })
        .optional()
        .describe("Filters to apply to the secrets list"),
    })
    .optional()
    .describe("Query parameters for secrets_list operation. Only used when operation is 'secrets_list'"),
});

type ProfileLookupSchema = z.infer<typeof profileLookupSchema>;

/**
 * @description Fetches profile information or lists secrets based on the operation parameter.
 * For profile_info, gets current profile details.
 * For secrets_list, retrieves profile secrets with optional filtering and pagination.
 */
async function profileLookupTool(resources: Resources, params: ProfileLookupSchema) {
  let data: unknown;

  if (params.operation === "profile_info") {
    data = await resources.profiles.info("current").catch((error) => {
      throw `**Error fetching profile information:** ${error}`;
    });
  }

  if (params.operation === "secrets_list") {
    // Build query object for secrets with only defined values
    const query: Record<string, unknown> = {};

    if (params.secrets_query?.amount) {
      query.amount = params.secrets_query.amount;
    }
    if (params.secrets_query?.orderBy) {
      query.orderBy = params.secrets_query.orderBy;
    }
    if (params.secrets_query?.filter) {
      const filter: SecretsQuery["filter"] = {};
      if (params.secrets_query.filter.id) {
        filter.id = params.secrets_query.filter.id;
      }
      if (params.secrets_query.filter.key) {
        filter.key = params.secrets_query.filter.key;
      }
      query.filter = filter;
    }

    // Only pass query if at least one parameter is provided
    const hasQuery = Object.keys(query).length > 0;
    data = await resources.secrets.list(hasQuery ? query : undefined).catch((error) => {
      throw `**Error fetching secrets list:** ${error}`;
    });
  }

  const markdownResponse = convertJSONToMarkdown(data);

  return markdownResponse;
}

const profileLookupConfigJSON: IDeviceToolConfig = {
  name: "profile-lookup",
  description: `Get profile information or list secrets based on the operation parameter.
- Use 'profile_info' to get current profile details
- Use 'secrets_list' to retrieve profile secrets with optional filtering by id/key, ordering, and pagination`,
  parameters: profileLookupSchema.shape,
  title: "Profile and Secrets Lookup",
  tool: profileLookupTool,
};

export { profileLookupConfigJSON, profileLookupSchema };
