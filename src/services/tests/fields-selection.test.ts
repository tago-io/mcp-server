import { describe, expect, it, vi } from "vitest";

import { makeTestContext } from "../../testing/context";
import { searchActionsConfigJSON } from "../actions/tools/search-actions";
import { searchAnalysesConfigJSON } from "../analysis/tools/search-analyses";
import { searchDashboardsConfigJSON } from "../dashboards/tools/search-dashboards";
import { searchDevicesConfigJSON } from "../devices/tools/search-devices";
import { searchEntitiesConfigJSON } from "../entities/tools/search-entities";
import { searchConnectorsConfigJSON } from "../integration/tools/search-connectors";
import { searchNetworksConfigJSON } from "../integration/tools/search-networks";
import { searchSecretsConfigJSON } from "../profile/tools/search-secrets";
import { searchRunUsersConfigJSON } from "../run-users/tools/search-run-users";
import { IToolConfig } from "../types";

const SELECTED_VALUE = "selected-field-value";
const UNSELECTED_VALUE = "unselected-field-value";

interface FieldsSelectionCase {
  config: IToolConfig;
  /** A valid `fields` value that lies OUTSIDE the tool's concise defaults. */
  selectedField: string;
  /** A concise-default field that must disappear once `fields` is supplied. */
  unselectedField: string;
  makeResources: (item: Record<string, unknown>) => unknown;
}

// Every resource-list tool exposing `fields` must project the concise output
// through the caller's selection, not just shape the SDK query with it.
const cases: FieldsSelectionCase[] = [
  {
    config: searchDevicesConfigJSON,
    selectedField: "tags",
    unselectedField: "connector",
    makeResources: (item) => ({ devices: { list: vi.fn().mockResolvedValue([item]) } }),
  },
  {
    config: searchActionsConfigJSON,
    selectedField: "created_at",
    unselectedField: "type",
    makeResources: (item) => ({ actions: { list: vi.fn().mockResolvedValue([item]) } }),
  },
  {
    config: searchAnalysesConfigJSON,
    selectedField: "created_at",
    unselectedField: "runtime",
    makeResources: (item) => ({ analysis: { list: vi.fn().mockResolvedValue([item]) } }),
  },
  {
    config: searchDashboardsConfigJSON,
    selectedField: "tags",
    unselectedField: "type",
    makeResources: (item) => ({ dashboards: { list: vi.fn().mockResolvedValue([item]) } }),
  },
  {
    config: searchEntitiesConfigJSON,
    selectedField: "created_at",
    unselectedField: "name",
    makeResources: (item) => ({ entities: { list: vi.fn().mockResolvedValue([item]) } }),
  },
  {
    config: searchRunUsersConfigJSON,
    selectedField: "company",
    unselectedField: "email",
    makeResources: (item) => ({ run: { listUsers: vi.fn().mockResolvedValue([item]) } }),
  },
  {
    config: searchSecretsConfigJSON,
    selectedField: "value_length",
    unselectedField: "key",
    makeResources: (item) => ({ secrets: { list: vi.fn().mockResolvedValue([item]) } }),
  },
  {
    config: searchNetworksConfigJSON,
    selectedField: "description",
    unselectedField: "name",
    makeResources: (item) => ({ integration: { networks: { list: vi.fn().mockResolvedValue([item]) } } }),
  },
  {
    config: searchConnectorsConfigJSON,
    selectedField: "description",
    unselectedField: "name",
    makeResources: (item) => ({ integration: { connectors: { list: vi.fn().mockResolvedValue([item]) } } }),
  },
];

describe("resource-list fields selection reaches the rendered output", () => {
  it.each(cases.map((entry) => [entry.config.name, entry] as const))("%s renders exactly the supplied fields in concise mode", async (_name, entry) => {
    const item: Record<string, unknown> = {
      id: "61f0000000000000000a0001",
      [entry.selectedField]: SELECTED_VALUE,
      [entry.unselectedField]: UNSELECTED_VALUE,
    };
    const params = { fields: ["id", entry.selectedField], response_format: "concise" };
    const result = await entry.config.tool(makeTestContext({ resources: entry.makeResources(item) }), params as never);

    expect(result).toContain(SELECTED_VALUE);
    expect(result).not.toContain(UNSELECTED_VALUE);
  });
});
