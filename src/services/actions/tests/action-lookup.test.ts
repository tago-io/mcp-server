import { describe, it, expect } from "vitest";
import { actionBaseSchema } from "../tools/action-lookup";

describe("actionBaseSchema Parse", () => {
  describe("Operation Validation", () => {
    it("should accept valid operation types", () => {
      const validOperations = ["create", "update", "delete", "lookup"];
      
      for (const operation of validOperations) {
        const result = actionBaseSchema.safeParse({ operation });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.operation).toBe(operation);
        }
      }
    });

    it("should reject invalid operation types", () => {
      const invalidOperations = ["invalid", "get", "patch", "remove", ""];
      
      for (const operation of invalidOperations) {
        const result = actionBaseSchema.safeParse({ operation });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].code).toBe("invalid_enum_value");
          expect(result.error.issues[0].path).toEqual(["operation"]);
        }
      }
    });

    it("should require operation field", () => {
      const result = actionBaseSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["operation"]);
        expect(result.error.issues[0].message).toBe("Required");
      }
    });
  });

  describe("ActionID Validation", () => {
    it("should accept valid actionID", () => {
      const result = actionBaseSchema.safeParse({
        operation: "delete",
        actionID: "123456789012345678901234",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.actionID).toBe("123456789012345678901234");
      }
    });

    it("should accept undefined actionID", () => {
      const result = actionBaseSchema.safeParse({
        operation: "lookup",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.actionID).toBeUndefined();
      }
    });

    it("should reject non-string actionID", () => {
      const result = actionBaseSchema.safeParse({
        operation: "delete",
        actionID: 123,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["actionID"]);
      }
    });
  });

  describe("CreateAction Validation", () => {
    it("should accept valid createAction", () => {
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
      if (result.success) {
        expect(result.data.createAction).toEqual(validCreateAction);
      }
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
      if (result.success) {
        expect(result.data.createAction).toEqual(completeCreateAction);
      }
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
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
        const paths = result.error.issues.map(issue => issue.path.join("."));
        expect(paths).toContain("createAction.type");
        expect(paths).toContain("createAction.action");
      }
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
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_enum_value");
        expect(result.error.issues[0].path).toEqual(["createAction", "action", "type"]);
      }
    });
  });

  describe("ListAction Validation", () => {
    it("should accept valid listAction with all fields", () => {
      const validListAction = {
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
        lookupAction: validListAction,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const returnListAction = {
          amount: 50,
          fields: ["id", "name", "active"],
          filter: {
            name: "*test*",
            active: true,
            tags: [{ key: "category", value: "notification" }],
          },
        };
        expect(result.data.lookupAction).toEqual(returnListAction);
      }
    });

    it("should accept listAction with minimal fields", () => {
      const minimalListAction = {
        amount: 10,
      };

      const result = actionBaseSchema.safeParse({
        operation: "lookup",
        lookupAction: minimalListAction,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupAction).toEqual(minimalListAction);
      }
    });

    it("should reject listAction with invalid fields", () => {
      const invalidListAction = {
        fields: ["invalid_field", "another_invalid"],
      };

      const result = actionBaseSchema.safeParse({
        operation: "lookup",
        lookupAction: invalidListAction,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_enum_value");
        expect(result.error.issues[0].path).toEqual(["lookupAction", "fields", 0]);
      }
    });
  });

  describe("UpdateAction Validation", () => {
    it("should accept valid updateAction", () => {
      const validUpdateAction = {
        name: "Updated Action",
        type: "condition",
        action: {
          type: "sms",
          message: "Updated message",
          to: "987654321",
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
        operation: "update",
        actionID: "123456789012345678901234",
        updateAction: validUpdateAction,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.updateAction).toEqual(validUpdateAction);
      }
    });

    it("should accept empty updateAction", () => {
      const result = actionBaseSchema.safeParse({
        operation: "update",
        actionID: "123456789012345678901234",
        updateAction: {},
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.updateAction).toEqual({});
      }
    });
  });

  describe("Complex Validation Scenarios", () => {
    it("should accept operation with multiple optional fields", () => {
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
              "Authorization": "Bearer token123",
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
        lookupAction: {
          amount: 100,
          fields: ["id", "name"],
        },
      };

      const result = actionBaseSchema.safeParse(complexData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operation).toBe("create");
        expect(result.data.actionID).toBe("123456789012345678901234");
        expect(result.data.createAction?.name).toBe("Complex Action");
        expect(result.data.lookupAction?.amount).toBe(100);
      }
    });

    it("should handle nested validation errors", () => {
      const invalidNestedData = {
        operation: "create",
        createAction: {
          name: "Test",
          type: "condition",
          action: {
            type: "script",
            script: "invalid_script_format", // Should be array
          },
        },
      };

      const result = actionBaseSchema.safeParse(invalidNestedData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["createAction", "action", "script"]);
      }
    });

    it("should validate trigger schema variations", () => {
      const triggerVariations = [
        // Resource trigger
        {
          resource: "device",
          when: "create",
          tag_key: "type",
          tag_value: "sensor",
        },
        // Interval trigger
        {
          interval: "5 minutes",
        },
        // Cron trigger
        {
          timezone: "UTC",
          cron: "0 0 * * *",
        },
      ];

      for (const trigger of triggerVariations) {
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
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle null values", () => {
      const result = actionBaseSchema.safeParse({
        operation: "lookup",
        actionID: null,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["actionID"]);
      }
    });

    it("should handle empty strings", () => {
      const result = actionBaseSchema.safeParse({
        operation: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_enum_value");
      }
    });

    it("should handle extra unknown fields", () => {
      const result = actionBaseSchema.safeParse({
        operation: "lookup",
        unknownField: "should be ignored",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect("unknownField" in result.data).toBe(false);
      }
    });
  });
});