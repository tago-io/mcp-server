import type { DeviceEditInfo } from "@tago-io/sdk";
import { z } from "zod/v3";

import { resourceIdSchema, tagsObjectModel } from "../../../utils/global-params.model";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { describeErrorSafely } from "../../../utils/safe-error";
import { invalidParamMessage } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";

const CONNECTOR_NETWORK_EXAMPLE =
  '{"device_id": "61f0000000000000000d0001", "connector": "61f0000000000000000c0001", "network": "61f0000000000000000e0001", "confirm_token_rotation": true}';

/**
 * First-party API contract: connector and network must be sent together (see 1.7).
 */
const updateDeviceCrossField = z.any().superRefine((value, ctx) => {
  const obj = (value ?? {}) as { connector?: string; network?: string };
  if ((obj.connector && !obj.network) || (obj.network && !obj.connector)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: invalidParamMessage(
        obj.connector ? "network" : "connector",
        "changing connector or network requires both fields together (TagoIO API contract)",
        CONNECTOR_NETWORK_EXAMPLE
      ),
    });
  }
});

const updateDeviceSchema = {
  device_id: resourceIdSchema("device ID"),
  name: z.string().describe("New device name.").optional(),
  connector: z
    .string()
    .length(24, "Connector ID must be 24 characters long")
    .describe("New connector ID. Changing it requires `network` too and rotates every device token (requires confirm_token_rotation).")
    .optional(),
  network: z
    .string()
    .length(24, "Network ID must be 24 characters long")
    .describe("New network ID. Changing it requires `connector` too and rotates every device token (requires confirm_token_rotation).")
    .optional(),
  serie_number: z.string().describe("New serial number. Changing it rotates every device token (requires confirm_token_rotation).").optional(),
  active: z.boolean().describe("Active status.").optional(),
  description: z.string().describe("Device description.").optional(),
  visible: z.boolean().describe("Visibility in listings.").optional(),
  tags: z.array(tagsObjectModel).describe("Replacement tag set.").optional(),
  chunk_retention: z.number().int().min(0).max(36500).describe("New chunk retention (immutable devices).").optional(),
  payload_decoder: z.string().describe("Payload parser JavaScript source. Sent base64-encoded automatically.").optional(),
  confirm_token_rotation: z
    .boolean()
    .describe("Must be true to proceed with connector, network, or serial-number changes: those delete and recreate every device token, invalidating credentials in use.")
    .optional(),
};

type UpdateDeviceParams = z.infer<z.ZodObject<typeof updateDeviceSchema>>;

interface PreflightedToken {
  token: string;
  name: string;
  permission: string;
  serie_number?: string;
  expire_time?: string | null;
}

interface RotatedToken {
  original_name: string;
  new_token: string;
  permission: string;
  expire_date?: string;
  serie_number?: string;
}

interface TokenFailure {
  name: string;
  error: string;
}

const TOKEN_PAGE_SIZE = 100;
const TOKEN_MAX_PAGES = 50;

/**
 * Preflights ALL device tokens, paginating so the rotation contract can never
 * silently rotate only a first page. Bails out on absurd token counts rather
 * than deleting thousands of live credentials.
 */
async function preflightAllTokens(context: ServerContext, deviceId: string): Promise<PreflightedToken[]> {
  const tokens: PreflightedToken[] = [];
  for (let page = 1; ; page += 1) {
    if (page > TOKEN_MAX_PAGES) {
      throw new Error(
        `Device ${deviceId} has more than ${TOKEN_PAGE_SIZE * TOKEN_MAX_PAGES} tokens; automated token rotation is not safe at that scale. No changes were made; rotate tokens via the TagoIO console instead.`
      );
    }
    const batch = (await context.resources.devices.tokenList(deviceId, {
      page,
      amount: TOKEN_PAGE_SIZE,
      fields: ["token", "name", "permission", "serie_number", "expire_time"],
    } as never)) as unknown as PreflightedToken[];
    tokens.push(...batch);
    if (batch.length < TOKEN_PAGE_SIZE) {
      return tokens;
    }
  }
}

function buildEditPayload(params: UpdateDeviceParams): DeviceEditInfo {
  const { device_id: _deviceId, confirm_token_rotation: _confirm, payload_decoder, ...fields } = params;
  return {
    ...fields,
    ...(payload_decoder ? { payload_decoder: Buffer.from(payload_decoder).toString("base64") } : {}),
  } as DeviceEditInfo;
}

/**
 * Recreates all preflighted tokens, preserving every SDK-exposed property
 * (name, permission, expire_time, serie_number). When the device serial
 * changed, the new serial is applied to every recreated token. Failures are
 * collected, never thrown; the caller reports them explicitly.
 *
 * The SDK create response carries token/expire_date/permission but no name,
 * so each replacement is paired here with the preflighted token it replaces.
 */
async function recreateTokens(context: ServerContext, deviceId: string, tokens: PreflightedToken[], newSerial: string | undefined, redactSecrets: string[]) {
  const recreated: RotatedToken[] = [];
  const failures: TokenFailure[] = [];
  const knownSecrets = [...redactSecrets];

  for (const original of tokens) {
    const serial = newSerial ?? original.serie_number;
    try {
      // Non-expiring tokens read back as expire_time null (or "never"), but
      // the create schema accepts only an interval string or date; the field
      // must be omitted entirely to keep the replacement non-expiring.
      const expireTime = original.expire_time && original.expire_time !== "never" ? { expire_time: original.expire_time as never } : {};
      const created = await context.resources.devices.tokenCreate(deviceId, {
        name: original.name,
        permission: original.permission as never,
        serie_number: serial,
        ...expireTime,
      });
      knownSecrets.push(created.token);
      recreated.push({
        original_name: original.name,
        new_token: created.token,
        permission: String(created.permission ?? original.permission),
        expire_date: created.expire_date ? String(created.expire_date) : (original.expire_time ?? undefined),
        serie_number: serial,
      });
    } catch (error) {
      failures.push({ name: original.name, error: describeErrorSafely(error, knownSecrets) });
    }
  }

  return { recreated, failures };
}

function describeFailures(failures: TokenFailure[]): string[] {
  return failures.map((failure) => `Failed to recreate token "${failure.name}": ${failure.error}`);
}

async function updateDeviceTool(context: ServerContext, params: UpdateDeviceParams): Promise<string> {
  const { resources } = context;
  const deviceId = params.device_id;

  const rotationNeeded = Boolean(params.connector || params.network || params.serie_number);

  if (!rotationNeeded) {
    await resources.devices.edit(deviceId, buildEditPayload(params));
    return `Device \`${deviceId}\` updated.`;
  }

  if (!params.confirm_token_rotation) {
    return [
      "**No changes were made.** Changing a device's connector, network, or serial number rotates its credentials: every device token is deleted and recreated, and any hardware or integration using the old tokens stops authenticating until it receives a replacement.",
      "",
      "To proceed, call update_device again with the same arguments plus `confirm_token_rotation: true`. The response will include every replacement token.",
    ].join("\n");
  }

  const tokens = await preflightAllTokens(context, deviceId);

  if (tokens.length === 0) {
    await resources.devices.edit(deviceId, buildEditPayload(params));
    return convertJSONToMarkdown({ result: `Device \`${deviceId}\` updated.`, token_rotation: "Device has no tokens; nothing to rotate." });
  }

  // The API requires all tokens deleted before a connector/network edit.
  // Once any token is deleted, this handler must RETURN a report instead of
  // throwing: replacement secrets can only be delivered through the tool
  // result, and thrown errors may be transport-logged.
  // Every credential a failure message must never echo: the old token values
  // (the SDK deletes via /device/token/<token>, so raw errors can carry them)
  // and the request credential itself.
  const secretsToRedact = [context.token, ...tokens.map((token) => token.token)];

  const deleted: PreflightedToken[] = [];
  let deletionFailure: TokenFailure | undefined;
  for (const token of tokens) {
    try {
      await resources.devices.tokenDelete(token.token);
      deleted.push(token);
    } catch (error) {
      deletionFailure = { name: token.name, error: describeErrorSafely(error, secretsToRedact) };
      break;
    }
  }

  if (deletionFailure) {
    if (deleted.length === 0) {
      throw new Error(
        `Token rotation aborted before any changes: deleting token "${deletionFailure.name}" failed (${deletionFailure.error}). No tokens were deleted and the device was NOT edited; fix the cause and retry.`
      );
    }
    const recovery = await recreateTokens(context, deviceId, deleted, undefined, secretsToRedact);
    return convertJSONToMarkdown({
      error: `Token rotation aborted: deleting token "${deletionFailure.name}" failed (${deletionFailure.error}). The device was NOT edited. The ${deleted.length} already-deleted token(s) were recreated with NEW values below.`,
      recovered_tokens: recovery.recreated,
      ...(recovery.failures.length > 0 ? { recovery_failures: describeFailures(recovery.failures) } : {}),
      warning: "Update any hardware or integration using the recovered tokens with the new values above, then retry the update.",
    });
  }

  try {
    await resources.devices.edit(deviceId, buildEditPayload(params));
  } catch (error) {
    const detail = describeErrorSafely(error, secretsToRedact);
    const recovery = await recreateTokens(context, deviceId, tokens, undefined, secretsToRedact);
    return convertJSONToMarkdown({
      error: `Device edit failed (${detail}). The device was NOT changed, but every token had already been deleted for the rotation; ${recovery.recreated.length} of ${tokens.length} were recreated with their original properties and NEW values below.`,
      recovered_tokens: recovery.recreated,
      ...(recovery.failures.length > 0 ? { recovery_failures: describeFailures(recovery.failures) } : {}),
      warning: "Update any hardware or integration using the recovered tokens with the new values above, then retry the update.",
    });
  }

  const rotation = await recreateTokens(context, deviceId, tokens, params.serie_number, secretsToRedact);

  return convertJSONToMarkdown({
    result: `Device \`${deviceId}\` updated.`,
    rotated_tokens: rotation.recreated,
    ...(rotation.failures.length > 0 ? { token_recreation_failures: describeFailures(rotation.failures) } : {}),
    warning: "Every device token was rotated. Update any hardware or integration using the old tokens with the new values above.",
  });
}

const updateDeviceConfigJSON: IToolConfig = {
  name: "update_device",
  description: `Updates a device's properties. Plain field changes (name, tags, description, active) apply directly. Changing the connector, network, or serial number rotates credentials: the TagoIO API requires all device tokens to be deleted first, so this tool preflights every token, deletes them, applies the edit, and recreates them preserving name, permission, expiry, and serial, returning every replacement token.

Use when modifying an existing device found via search_devices. Credential-rotating changes require confirm_token_rotation: true; without it the tool makes no changes and explains what would happen. Connector and network must always be changed together. Storage type cannot be changed. Use configure_device for configuration parameters.

<example>
{"device_id": "61f0000000000000000d0001", "name": "Dock Sensor 2"}
</example>`,
  parameters: updateDeviceSchema,
  title: "Update Device",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  mutationClass: "destructive",
  crossFieldSchema: updateDeviceCrossField,
  tool: updateDeviceTool,
};

export { updateDeviceConfigJSON };
