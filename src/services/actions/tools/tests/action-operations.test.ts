import { describe, expect, it } from "vitest";
import { actionBaseSchema } from "../action-operations";

describe("actionBaseSchema Validation", () => {
  describe("Operation validation", () => {
    it("should accept valid operations", () => {
      const validOperations = ["create", "update", "delete", "lookup"];

      validOperations.forEach((operation) => {
        const result = actionBaseSchema.safeParse({ operation });
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid operations", () => {
      const invalidOperations = ["invalid", "get", "patch", ""];

      invalidOperations.forEach((operation) => {
        const result = actionBaseSchema.safeParse({ operation });
        expect(result.success).toBe(false);
      });
    });

    it("should require operation field", () => {
      const result = actionBaseSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Required");
      }
    });
  });

  describe("ActionID validation", () => {
    it("should accept valid actionID", () => {
      const result = actionBaseSchema.safeParse({
        operation: "delete",
        actionID: "123456789012345678901234",
      });
      expect(result.success).toBe(true);
    });

    it("should accept undefined actionID for lookup operations", () => {
      const result = actionBaseSchema.safeParse({ operation: "lookup" });
      expect(result.success).toBe(true);
    });

    it("should reject non-string actionID", () => {
      const result = actionBaseSchema.safeParse({
        operation: "delete",
        actionID: 123,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Create operation validation", () => {
    it("should accept valid createAction with required fields", () => {
      const validCreateAction = {
        name: "Test Action",
        type: "condition",
        action: {
          type: "sms",
          message: "Test message",
          to: "123456789",
        },
        trigger: [
          {
            resource: "device",
            when: "create",
            tag_key: "device_type",
            tag_value: "sensor",
          },
        ],
      };

      const result = actionBaseSchema.safeParse({
        operation: "create",
        createAction: validCreateAction,
      });

      expect(result.success).toBe(true);
    });

    it("should accept createAction with all optional fields", () => {
      const completeCreateAction = {
        name: "Complete Action",
        type: "condition",
        action: {
          type: "email",
          message: "Test email",
          subject: "Test Subject",
          to: "test@example.com",
        },
        tags: [{ key: "category", value: "notification" }],
        description: "A complete test action",
        trigger_when_unlock: true,
        trigger: [
          {
            resource: "device",
            when: "create",
            tag_key: "device_type",
            tag_value: "sensor",
          },
        ],
      };

      const result = actionBaseSchema.safeParse({
        operation: "create",
        createAction: completeCreateAction,
      });

      expect(result.success).toBe(true);
    });

    it("should reject createAction with missing required fields", () => {
      const incompleteCreateAction = {
        name: "Test Action",
        // Missing type and action
      };

      const result = actionBaseSchema.safeParse({
        operation: "create",
        createAction: incompleteCreateAction,
      });

      expect(result.success).toBe(false);
    });

    it("should reject createAction with invalid action type", () => {
      const invalidCreateAction = {
        name: "Test Action",
        type: "condition",
        action: {
          type: "invalid_type",
          message: "Test message",
        },
      };

      const result = actionBaseSchema.safeParse({
        operation: "create",
        createAction: invalidCreateAction,
      });

      expect(result.success).toBe(false);
    });
  });

  describe("Lookup operation validation", () => {
    it("should accept valid lookupAction with filters", () => {
      const validLookupAction = {
        amount: 50,
        fields: ["id", "name", "active"],
        filter: {
          name: "test",
          active: true,
          tags: [{ key: "category", value: "notification" }],
        },
      };

      const result = actionBaseSchema.safeParse({
        operation: "lookup",
        lookupAction: validLookupAction,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Verify name filter transformation (adds wildcards)
        expect(result.data.lookupAction?.filter?.name).toBe("*test*");
      }
    });

    it("should accept minimal lookupAction", () => {
      const result = actionBaseSchema.safeParse({
        operation: "lookup",
        lookupAction: { amount: 10 },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Update operation validation", () => {
    it("should accept valid updateAction", () => {
      const validUpdateAction = {
        name: "Updated Action",
        type: "condition",
        action: {
          type: "sms",
          message: "Updated message",
          to: "987654321",
        },
      };

      const result = actionBaseSchema.safeParse({
        operation: "update",
        actionID: "123456789012345678901234",
        updateAction: validUpdateAction,
      });

      expect(result.success).toBe(true);
    });

    it("should accept empty updateAction", () => {
      const result = actionBaseSchema.safeParse({
        operation: "update",
        actionID: "123456789012345678901234",
        updateAction: {},
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Trigger schema validation", () => {
    it("should accept different trigger types", () => {
      const triggerVariations = [
        // Resource trigger
        {
          resource: "device",
          when: "create",
          tag_key: "type",
          tag_value: "sensor",
        },
        // Interval trigger
        { interval: "5 minutes" },
        // Cron trigger
        {
          timezone: "UTC",
          cron: "0 0 * * *",
        },
        // Condition trigger
        {
          device: "device123",
          variable: "temperature",
          is: ">",
          value: "25",
          value_type: "number",
        },
      ];

      triggerVariations.forEach((trigger) => {
        const result = actionBaseSchema.safeParse({
          operation: "create",
          createAction: {
            name: "Trigger Test",
            type: "condition",
            action: {
              type: "sms",
              message: "test",
              to: "123",
            },
            trigger: [trigger],
          },
        });

        expect(result.success).toBe(true);
      });
    });
  });

  describe("Edge cases", () => {
    it("should handle null actionID", () => {
      const result = actionBaseSchema.safeParse({
        operation: "lookup",
        actionID: null,
      });
      expect(result.success).toBe(false);
    });

    it("should ignore unknown fields", () => {
      const result = actionBaseSchema.safeParse({
        operation: "lookup",
        unknownField: "should be ignored",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect("unknownField" in result.data).toBe(false);
      }
    });

    it("should validate complex action with multiple optional fields", () => {
      const complexData = {
        operation: "create",
        actionID: "123456789012345678901234",
        createAction: {
          name: "Complex Action",
          type: "condition",
          action: {
            type: "post",
            url: "https://api.example.com/webhook",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer token123",
            },
          },
          trigger: [
            {
              device: "device123",
              variable: "temperature",
              is: ">",
              value: "25",
              value_type: "number",
            },
          ],
        },
      };

      const result = actionBaseSchema.safeParse(complexData);
      expect(result.success).toBe(true);
    });
  });
});
