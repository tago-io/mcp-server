import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod/v3';
import { userBaseSchema } from '../tools/user-lookup';

describe('userBaseSchema.parse', () => {
  describe('valid inputs', () => {
    it('should parse minimal valid input with only operation', () => {
      const input = { operation: 'lookup' as const };
      
      const result = userBaseSchema.parse(input);
      
      expect(result.operation).toBe('lookup');
      expect(result.runUserID).toBeUndefined();
      expect(result.lookupUser).toBeUndefined();
    });

    it('should parse input with runUserID', () => {
      const input = {
        operation: 'lookup' as const,
        runUserID: '123456789012345678901234',
      };
      
      const result = userBaseSchema.parse(input);
      
      expect(result.operation).toBe('lookup');
      expect(result.runUserID).toBe('123456789012345678901234');
      expect(result.lookupUser).toBeUndefined();
    });

    it('should parse input with complete lookupUser object', () => {
      const input = {
        operation: 'lookup' as const,
        lookupUser: {
          amount: 50,
          page: 1,
          fields: ['id', 'name', 'email'] as const,
          filter: {
            id: '123456789012345678901234',
            name: 'john',
            email: 'test@example.com',
            active: true,
            tags: [{ key: 'role', value: 'admin' }],
          },
        },
      };
      
      const result = userBaseSchema.parse(input);
      
      expect(result.operation).toBe('lookup');
      expect(result.lookupUser?.amount).toBe(50);
      expect(result.lookupUser?.page).toBe(1);
      expect(result.lookupUser?.fields).toEqual(['id', 'name', 'email']);
      expect(result.lookupUser?.filter?.active).toBe(true);
      expect(result.lookupUser?.filter?.tags).toEqual([{ key: 'role', value: 'admin' }]);
    });

    it('should parse input with all valid field options', () => {
      const validFields = [
        'id', 'name', 'email', 'timezone', 'company', 
        'phone', 'language', 'tags', 'active', 'last_login', 
        'created_at', 'updated_at'
      ] as const;
      
      const input = {
        operation: 'lookup' as const,
        lookupUser: {
          fields: validFields,
        },
      };
      
      const result = userBaseSchema.parse(input);
      
      expect(result.lookupUser?.fields).toEqual(validFields);
    });
  });

  describe('required field validation', () => {
    it('should throw error when operation is missing', () => {
      const input = {};
      
      expect(() => userBaseSchema.parse(input)).toThrow(ZodError);
      
      try {
        userBaseSchema.parse(input);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(['operation']);
        expect(zodError.errors[0].code).toBe('invalid_type');
      }
    });

    it('should throw error when operation is invalid', () => {
      const input = { operation: 'invalid' };
      
      expect(() => userBaseSchema.parse(input)).toThrow(ZodError);
      
      try {
        userBaseSchema.parse(input);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(['operation']);
        expect(zodError.errors[0].code).toBe('invalid_enum_value');
      }
    });
  });

  describe('runUserID validation', () => {
    it('should throw error when runUserID is not 24 characters', () => {
      const input = {
        operation: 'lookup' as const,
        runUserID: 'short',
      };
      
      expect(() => userBaseSchema.parse(input)).toThrow(ZodError);
      
      try {
        userBaseSchema.parse(input);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(['runUserID']);
        expect(zodError.errors[0].message).toContain('24 characters');
      }
    });

    it('should accept valid 24-character runUserID', () => {
      const input = {
        operation: 'lookup' as const,
        runUserID: '123456789012345678901234',
      };
      
      expect(() => userBaseSchema.parse(input)).not.toThrow();
    });
  });

  describe('lookupUser validation', () => {
    it('should throw error for invalid field values', () => {
      const input = {
        operation: 'lookup' as const,
        lookupUser: {
          fields: ['invalid_field'],
        },
      };
      
      expect(() => userBaseSchema.parse(input)).toThrow(ZodError);
      
      try {
        userBaseSchema.parse(input);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(['lookupUser', 'fields', 0]);
        expect(zodError.errors[0].code).toBe('invalid_enum_value');
      }
    });

    it('should throw error when filter.id is not 24 characters', () => {
      const input = {
        operation: 'lookup' as const,
        lookupUser: {
          filter: {
            id: 'short',
          },
        },
      };
      
      expect(() => userBaseSchema.parse(input)).toThrow(ZodError);
      
      try {
        userBaseSchema.parse(input);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(['lookupUser', 'filter', 'id']);
        expect(zodError.errors[0].message).toContain('24 characters');
      }
    });

    it('should accept valid filter with all optional properties', () => {
      const input = {
        operation: 'lookup' as const,
        lookupUser: {
          filter: {
            id: '123456789012345678901234',
            name: 'john',
            email: 'test@example.com',
            active: false,
            tags: [
              { key: 'department', value: 'engineering' },
              { key: 'level', value: 'senior' },
            ],
          },
        },
      };
      
      const result = userBaseSchema.parse(input);
      
      expect(result.lookupUser?.filter?.id).toBe('123456789012345678901234');
      expect(result.lookupUser?.filter?.name).toBe('*john*'); // transformed
      expect(result.lookupUser?.filter?.email).toBe('*test@example.com*'); // transformed
      expect(result.lookupUser?.filter?.active).toBe(false);
      expect(result.lookupUser?.filter?.tags).toHaveLength(2);
    });

    it('should transform name and email filters with wildcards', () => {
      const input = {
        operation: 'lookup' as const,
        lookupUser: {
          filter: {
            name: 'john',
            email: 'example.com',
          },
        },
      };
      
      const result = userBaseSchema.parse(input);
      
      expect(result.lookupUser?.filter?.name).toBe('*john*');
      expect(result.lookupUser?.filter?.email).toBe('*example.com*');
    });
  });

  describe('edge cases', () => {
    it('should handle empty objects in optional fields', () => {
      const input = {
        operation: 'lookup' as const,
        lookupUser: {},
      };
      
      expect(() => userBaseSchema.parse(input)).not.toThrow();
      
      const result = userBaseSchema.parse(input);
      expect(result.lookupUser).toEqual({});
    });

    it('should handle null values gracefully', () => {
      const input = {
        operation: 'lookup' as const,
        runUserID: null,
        lookupUser: null,
      };
      
      expect(() => userBaseSchema.parse(input)).toThrow(ZodError);
    });

    it('should preserve type safety for parsed result', () => {
      const input = {
        operation: 'lookup' as const,
        runUserID: '123456789012345678901234',
        lookupUser: {
          amount: 100,
          fields: ['id', 'name'] as const,
        },
      };
      
      const result = userBaseSchema.parse(input);
      
      // TypeScript should infer correct types
      expect(typeof result.operation).toBe('string');
      expect(typeof result.runUserID).toBe('string');
      expect(typeof result.lookupUser?.amount).toBe('number');
      expect(Array.isArray(result.lookupUser?.fields)).toBe(true);
    });
  });
}); 