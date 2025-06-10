import { describe, it, expect } from "vitest";
import { toMarkdown } from "./markdown.js";
import { ActionInfo } from "@tago-io/sdk/lib/types.js";

const actions: ActionInfo[] = [
  {
    id: "123",
    active: false,
    name: "test 1",
    description: null,
    created_at: new Date("2024-12-11T13:39:03.467Z"),
    updated_at: new Date("2025-02-28T13:52:29.919Z"),
    last_triggered: new Date("2024-12-11T13:45:40.604Z"),
    tags: [{ key: "blah", value: "test_1" }],
    type: "interval",
    action: { type: "script", script: ["analysis-id"] },
  },
  {
    id: "321",
    active: true,
    name: "Test MQTT",
    description: null,
    created_at: new Date("2024-02-08T19:32:10.727Z"),
    updated_at: new Date("2024-02-08T20:01:01.742Z"),
    last_triggered: new Date("2025-03-24T17:25:14.822Z"),
    tags: [],
    type: "mqtt_topic",
    action: { type: "script", script: ["analysis-id"] },
  },
];

describe("toMarkdown", () => {
  it("should convert an array of actions to a Markdown table", () => {
    const md = toMarkdown(actions);
    expect(md).toContain("| id | active | name | description | created_at | updated_at | last_triggered | tags | type | action |");
    expect(md).toContain("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    expect(md).toContain(
      '| 123 | false | test 1 | _empty_ | `"2024-12-11T13:39:03.467Z"` | `"2025-02-28T13:52:29.919Z"` | `"2024-12-11T13:45:40.604Z"` | `[{"key":"blah","value":"test_1"}]` | interval | `{"type":"script","script":["analysis-id"]}` |'
    );
    expect(md).toContain(
      '| 321 | true | Test MQTT | _empty_ | `"2024-02-08T19:32:10.727Z"` | `"2024-02-08T20:01:01.742Z"` | `"2025-03-24T17:25:14.822Z"` | [] | mqtt_topic | `{"type":"script","script":["analysis-id"]}` |'
    );
    expect(md).toContain("interval");
    expect(md).toContain("mqtt_topic");
    expect(md).toContain("tags");
  });

  it("should handle an empty array", () => {
    expect(toMarkdown([])).toBe("_No data found._");
  });

  it("should convert a simple object to a Markdown list", () => {
    const obj = { foo: "bar", num: 42 };
    const md = toMarkdown(obj);
    expect(md).toContain("**foo**: bar");
    expect(md).toContain("**num**: 42");
  });

  it("should convert a primitive to string", () => {
    expect(toMarkdown(123)).toBe("123");
    expect(toMarkdown(true)).toBe("true");
    expect(toMarkdown(null)).toBe("_empty_");
    expect(toMarkdown(undefined)).toBe("_empty_");
  });
});

// Test data for device object
const deviceResponse = {
  active: true,
  bucket: {
    id: "668415d28f6c02000999ad76",
    name: "test freezer simulator",
  },
  connector: "60881d703824d4001031f296",
  created_at: "2024-07-02T14:59:30.069Z",
  description: "Ice cream freezer simulates internal temperature, door and compressor status",
  id: "668415d28f6c02000999ad76",
  last_input: "2025-06-06T21:19:48.714Z",
  name: "test freezer simulator",
  network: "6073cdfec79ed00011228e47",
  payload_decoder: null,
  profile: "659d7ffe712b4b0009aca22d",
  tags: [
    {
      key: "device_type",
      value: "sensor",
    },
  ],
  updated_at: "2024-08-01T18:40:06.849Z",
  visible: true,
  type: "mutable",
  chunk_period: null,
  chunk_retention: null,
  rpm: null,
};

describe("Device object formatting", () => {
  it("should format a device response object correctly", () => {
    const md = toMarkdown(deviceResponse);

    // Test primitive fields in result
    expect(md).toContain("**active**: true");
    expect(md).toContain("**connector**: 60881d703824d4001031f296");
    expect(md).toContain("**name**: test freezer simulator");

    // Test null values
    expect(md).toContain("**payload_decoder**: _empty_");
    expect(md).toContain("**chunk_period**: _empty_");

    // Test nested object (bucket)
    expect(md).toContain("### bucket:");
    expect(md).toContain("| Key | Value |");
    expect(md).toContain("| id | 668415d28f6c02000999ad76 |");
    expect(md).toContain("| name | test freezer simulator |");

    // Test array of objects (tags)
    expect(md).toContain("### tags:");
    expect(md).toContain("| key | value |");
    expect(md).toContain("| device_type | sensor |");
  });

  it("should format the device result object directly", () => {
    const md = toMarkdown(deviceResponse);

    // Test primitive fields
    expect(md).toContain("**active**: true");
    expect(md).toContain("**connector**: 60881d703824d4001031f296");
    expect(md).toContain("**name**: test freezer simulator");

    // Test nested object (bucket)
    expect(md).toContain("### bucket:");
    expect(md).toContain("| Key | Value |");
    expect(md).toContain("| id | 668415d28f6c02000999ad76 |");
    expect(md).toContain("| name | test freezer simulator |");

    // Test array of objects (tags)
    expect(md).toContain("### tags:");
    expect(md).toContain("| key | value |");
    expect(md).toContain("| device_type | sensor |");
  });

  it("should format date strings correctly", () => {
    const md = toMarkdown(deviceResponse);

    // Date strings should be displayed as strings, not wrapped in quotes
    expect(md).toContain("**created_at**: 2024-07-02T14:59:30.069Z");
    expect(md).toContain("**updated_at**: 2024-08-01T18:40:06.849Z");
    expect(md).toContain("**last_input**: 2025-06-06T21:19:48.714Z");

    // Not wrapped in backticks
    expect(md).not.toContain("**created_at**: `");
  });
});

// Test data for schema model
const entityResponse = {
  schema: {
    id: {
      type: "uuid",
      required: true,
    },
    created_at: {
      type: "timestamp",
      required: false,
    },
    updated_at: {
      type: "timestamp",
      required: false,
    },
    temperature: {
      type: "float",
      required: false,
    },
  },
  index: {
    id_idx: {
      fields: ["id"],
    },
    id_created_at_idx: {
      fields: ["id", "created_at"],
    },
    id_updated_at_idx: {
      fields: ["id", "updated_at"],
    },
    temperature_index: {
      fields: ["temperature"],
    },
  },
  id: "6790f8ef61a81600089e99c4",
  name: "Updated Entity Name",
  tags: [
    {
      key: "xpto",
      value: "123",
    },
  ],
  created_at: "2025-01-22T13:55:59.389Z",
  updated_at: "2025-06-04T20:02:30.790Z",
  profile: "659d7ffe712b4b0009aca22d",
  database: "6229032d0620c89169acbdc0",
  payload_decoder: null,
};

describe("Schema model formatting", () => {
  it("should format schema model correctly with nested objects and arrays", () => {
    const md = toMarkdown(entityResponse);

    // Check basic properties
    expect(md).toContain("**id**: 6790f8ef61a81600089e99c4");
    expect(md).toContain("**name**: Updated Entity Name");
    expect(md).toContain("**profile**: 659d7ffe712b4b0009aca22d");
    expect(md).toContain("**database**: 6229032d0620c89169acbdc0");
    expect(md).toContain("**payload_decoder**: _empty_");

    // Date handling
    expect(md).toContain("**created_at**: 2025-01-22T13:55:59.389Z");
    expect(md).toContain("**updated_at**: 2025-06-04T20:02:30.790Z");

    // Check nested schema object is properly formatted as a table
    expect(md).toContain("### schema:");
    const schemaMd = md.split("### schema:")[1].split("###")[0];
    expect(schemaMd).toContain("| Key | Value |");
    expect(schemaMd).toContain('| id | `{"type":"uuid","required":true}` |');
    expect(schemaMd).toContain('| created_at | `{"type":"timestamp","required":false}` |');
    expect(schemaMd).toContain('| updated_at | `{"type":"timestamp","required":false}` |');
    expect(schemaMd).toContain('| temperature | `{"type":"float","required":false}` |');

    // Check that schema.id is represented correctly
    expect(schemaMd).toContain('`{"type":"uuid","required":true}`');

    // Check nested index object is properly formatted as a table
    expect(md).toContain("### index:");
    const indexMd = md.split("### index:")[1].split("###")[0];
    expect(indexMd).toContain("| Key | Value |");
    expect(indexMd).toContain('| id_idx | `{"fields":["id"]}` |');
    expect(indexMd).toContain('| id_created_at_idx | `{"fields":["id","created_at"]}` |');
    expect(indexMd).toContain('| id_updated_at_idx | `{"fields":["id","updated_at"]}` |');
    expect(indexMd).toContain('| temperature_index | `{"fields":["temperature"]}` |');

    // Check array fields representation
    expect(indexMd).toContain('`{"fields":["id"]}`');
    expect(indexMd).toContain('`{"fields":["temperature"]}`');

    // Check tags array formatting
    expect(md).toContain("### tags:");
    expect(md).toContain("| key | value |");
    expect(md).toContain("| xpto | 123 |");
  });
});
