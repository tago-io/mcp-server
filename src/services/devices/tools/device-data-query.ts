import { Device } from "@tago-io/sdk";
import type { DataQuery } from "@tago-io/sdk";
import { z } from "zod/v3";

import { describeErrorSafely, redactSecrets } from "../../../utils/safe-error";
import { invalidParamError } from "../../../utils/tool-errors";
import { ServerContext } from "../../types";

const dataFilterShape = {
  variables: z.array(z.string()).describe("Filter by variable names. E.g: ['temperature', 'humidity']").optional(),
  groups: z.array(z.string()).describe("Filter by groups. E.g: ['1738000000000']").optional(),
  ids: z.array(z.string()).describe("Filter by record IDs.").optional(),
  values: z
    .array(z.union([z.string(), z.number(), z.boolean()]))
    .describe("Filter by values. E.g: [25.5, 'high', true]")
    .optional(),
  start_date: z.string().describe("Start date as ISO 8601 string. E.g: '2026-06-01T00:00:00Z'").optional(),
  end_date: z.string().describe("End date as ISO 8601 string. Defaults to now.").optional(),
  qty: z.number().int().min(1).max(10000).describe("Quantity of records (min 1, max 10000, default 15).").optional(),
  skip: z.number().int().min(0).describe("Records to skip, for pagination.").optional(),
  ordination: z.enum(["descending", "ascending"]).describe("Sort order by time. Default 'descending'.").optional(),
};

const readQueryShape = {
  query: z
    .enum([
      "default",
      "last_item",
      "last_value",
      "last_location",
      "last_insert",
      "first_item",
      "first_value",
      "first_location",
      "first_insert",
      "min",
      "max",
      "count",
      "avg",
      "sum",
      "aggregate",
      "conditional",
    ])
    .describe(
      `Query type. 'default' pages through records (qty/skip). last_*/first_* return single records. min/max/count compute over filtered records. avg/sum also compute but require start_date (period must not exceed one month). 'aggregate' groups by time interval (requires interval + function avg/sum/min/max). 'conditional' filters by value comparison (requires start_date + value + function gt/gte/lt/lte/eq/ne). interval/function/value are only valid on aggregate/conditional queries.`
    )
    .optional(),
  ...dataFilterShape,
  interval: z.enum(["minute", "hour", "day", "month", "quarter", "year"]).describe("Aggregation interval, required for query='aggregate'.").optional(),
  function: z
    .enum(["avg", "sum", "min", "max", "gt", "gte", "lt", "lte", "eq", "ne"])
    .describe("Aggregate function (avg/sum/min/max for query='aggregate') or comparison operator (gt/gte/lt/lte/eq/ne for query='conditional').")
    .optional(),
  value: z.number().describe("Comparison value, required for query='conditional'.").optional(),
};

interface DeviceDataReadQuery {
  query?: string;
  start_date?: string;
  interval?: string;
  function?: string;
  value?: number;
  [key: string]: unknown;
}

const AGGREGATE_FUNCTIONS = ["avg", "sum", "min", "max"];
const CONDITIONAL_FUNCTIONS = ["gt", "gte", "lt", "lte", "eq", "ne"];

/**
 * Validates cross-field requirements per query family, mirroring the SDK's
 * DataQuery union: DataQueryAvgSum requires start_date, DataQueryAggregate and
 * DataQueryConditional each accept only their own function subset, and the
 * remaining families take none of interval/function/value.
 */
function validateReadQuery(query: DeviceDataReadQuery): DataQuery {
  const rejectStray = (fields: string[]) => {
    const stray = fields.find((field) => query[field] !== undefined);
    if (stray) {
      throw invalidParamError(
        stray,
        `'${stray}' does not apply to query='${query.query ?? "default"}'`,
        '{"query": "aggregate", "interval": "day", "function": "avg", "variables": ["temperature"]}'
      );
    }
  };

  switch (query.query) {
    case "avg":
    case "sum":
      if (typeof query.start_date !== "string") {
        throw invalidParamError(
          "start_date",
          `'${query.query}' queries require start_date`,
          `{"query": "${query.query}", "start_date": "2026-06-01T00:00:00Z", "variables": ["temperature"]}`
        );
      }
      rejectStray(["interval", "function", "value"]);
      break;
    case "min":
    case "max":
    case "count":
      rejectStray(["interval", "function", "value"]);
      break;
    case "aggregate":
      if (typeof query.interval !== "string" || typeof query.function !== "string") {
        throw invalidParamError(
          "query",
          "aggregate queries require interval and function",
          '{"query": "aggregate", "interval": "day", "function": "avg", "variables": ["temperature"]}'
        );
      }
      if (!AGGREGATE_FUNCTIONS.includes(query.function)) {
        throw invalidParamError(
          "function",
          `aggregate queries accept only ${AGGREGATE_FUNCTIONS.join("/")}; comparison operators belong to query='conditional'`,
          '{"query": "aggregate", "interval": "day", "function": "avg", "variables": ["temperature"]}'
        );
      }
      rejectStray(["value"]);
      break;
    case "conditional":
      if (typeof query.start_date !== "string" || typeof query.value !== "number" || typeof query.function !== "string") {
        throw invalidParamError(
          "query",
          "conditional queries require start_date, value, and function",
          '{"query": "conditional", "start_date": "2026-06-01T00:00:00Z", "value": 25.5, "function": "gt", "variables": ["temperature"]}'
        );
      }
      if (!CONDITIONAL_FUNCTIONS.includes(query.function)) {
        throw invalidParamError(
          "function",
          `conditional queries accept only ${CONDITIONAL_FUNCTIONS.join("/")}; aggregate functions belong to query='aggregate'`,
          '{"query": "conditional", "start_date": "2026-06-01T00:00:00Z", "value": 25.5, "function": "gt", "variables": ["temperature"]}'
        );
      }
      rejectStray(["interval"]);
      break;
    default:
      // default and first_*/last_* single-record queries
      rejectStray(["interval", "function", "value"]);
  }
  return query as DataQuery;
}

interface DeviceDataHandler {
  read(deviceID: string, query?: DataQuery): Promise<unknown>;
  send(deviceID: string, data: unknown): Promise<unknown>;
  edit(deviceID: string, data: unknown): Promise<unknown>;
  remove(deviceID: string, query?: DataQuery): Promise<unknown>;
}

interface DeviceSendToken {
  token: string;
  name?: string;
  permission?: string;
  expire_time?: string | null;
}

const SEND_TOKEN_PERMISSIONS = new Set(["full", "write"]);
const SEND_TOKEN_PAGE_SIZE = 100;

/** A token can send data if it grants write access and has not expired. */
function isUsableSendToken(token: DeviceSendToken): boolean {
  if (!SEND_TOKEN_PERMISSIONS.has(token.permission ?? "")) {
    return false;
  }
  const expire = token.expire_time;
  if (expire === undefined || expire === null || expire === "never") {
    return true;
  }
  return new Date(expire) > new Date();
}

/**
 * Sends data on behalf of a Profile token by mirroring the Admin UI: the
 * /device/:id/data POST route is analysis-only (a profile token gets
 * AUTHDENIED), so reuse one of the device's own tokens, minting one (with the
 * Admin-UI default full permission) when none is usable, and ingest through the
 * SDK Device client (POST /data). The resolved or minted device token is a
 * secret; the success result and any thrown failure redact it (and the request
 * credential) so it never escapes.
 */
async function sendDataAsProfile(context: ServerContext, deviceID: string, data: unknown): Promise<unknown> {
  let deviceToken = "";
  try {
    const tokens = (await context.resources.devices.tokenList(deviceID, {
      page: 1,
      amount: SEND_TOKEN_PAGE_SIZE,
      fields: ["token", "name", "permission", "expire_time"],
    } as never)) as unknown as DeviceSendToken[];

    const usable = tokens.find(isUsableSendToken);
    deviceToken = usable ? usable.token : (await context.resources.devices.tokenCreate(deviceID, { name: "mcp-send-data", permission: "full" })).token;

    const device = new Device({ token: deviceToken, region: { api: context.region.api, sse: context.region.sse } });
    const result = await device.sendData(data as never);
    // The device token is not the request credential, so the outer boundary
    // cannot redact it; redact here, symmetric with the catch below.
    return redactSecrets(result, [context.token, deviceToken]);
  } catch (error) {
    throw new Error(describeErrorSafely(error, [context.token, deviceToken]));
  }
}

/**
 * Routes device-data calls by the credential kind classified at context
 * construction: profile/analysis tokens go through the request-scoped
 * Resources; a device token addresses only the device it authenticated as,
 * through a Device client built with the supplied token, never a token
 * looked up via tokenList.
 */
function createDeviceDataHandler(context: ServerContext): DeviceDataHandler {
  if (context.credentialKind === "device") {
    const { token, region, authenticatedDeviceId } = context;

    // A device token is bound to exactly one device. The SDK Device client
    // does not take a device_id at all, so a mismatched request would silently
    // read or mutate the authenticated device while claiming another; reject it
    // before any data operation is constructed or sent.
    const assertAuthenticatedDevice = (deviceID: string) => {
      if (deviceID !== authenticatedDeviceId) {
        throw invalidParamError(
          "device_id",
          `this Device token is bound to device ${authenticatedDeviceId} and cannot operate on ${deviceID}. Use a Profile or Analysis token to reach other devices`,
          `{"device_id": "${authenticatedDeviceId}"}`
        );
      }
    };

    const device = new Device({ token, region: { api: region.api, sse: region.sse } });
    return {
      // The Device.getData signature is narrower than DataQuery in the SDK types.
      read: async (deviceID, query) => {
        assertAuthenticatedDevice(deviceID);
        return device.getData(query as never);
      },
      send: async (deviceID, data) => {
        assertAuthenticatedDevice(deviceID);
        return device.sendData(data as never);
      },
      edit: async (deviceID, data) => {
        assertAuthenticatedDevice(deviceID);
        return device.editData(data as never);
      },
      remove: async (deviceID, query) => {
        assertAuthenticatedDevice(deviceID);
        return device.deleteData(query as never);
      },
    };
  }

  const { resources } = context;
  // A Profile token cannot POST /device/:id/data (analysis-only). Fork ONLY the
  // send path to reuse or mint a device token; analysis keeps its AM-gated
  // sendDeviceData, and read/edit/remove are unchanged for both kinds.
  const send =
    context.credentialKind === "profile"
      ? (deviceID: string, data: unknown) => sendDataAsProfile(context, deviceID, data)
      : (deviceID: string, data: unknown) => resources.devices.sendDeviceData(deviceID, data as never);

  return {
    read: (deviceID, query) => resources.devices.getDeviceData(deviceID, query),
    send,
    edit: (deviceID, data) => resources.devices.editDeviceData(deviceID, data as never),
    remove: (deviceID, query) => resources.devices.deleteDeviceData(deviceID, query),
  };
}

export { createDeviceDataHandler, dataFilterShape, readQueryShape, validateReadQuery };
export type { DeviceDataHandler, DeviceDataReadQuery };
