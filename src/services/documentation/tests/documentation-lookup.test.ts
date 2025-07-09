import { describe, it, expect, vi } from 'vitest';
import { documentationBaseSchema } from '../tools/documentation-lookup';  

vi.mock("../../../utils/get-env-variables", () => ({
  ENV: {
    TAGOIO_TOKEN: "test",
  },
}));

describe('documentationBaseSchema', () => {
  describe('valid inputs', () => {
    it('should accept a single question', () => {
      const validInput = {
        lookupCodeQuestions: ['How to configure a dashboard?']
      };

      const result = documentationBaseSchema.safeParse(validInput);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupCodeQuestions).toEqual(['How to configure a dashboard?']);
      }
    });

    it('should accept multiple questions (within limit)', () => {
      const validInput = {
        lookupCodeQuestions: [
          'How to configure a dashboard?',
          'How to configure a widget?',
          'Dashboard setup and configuration'
        ]
      };

      const result = documentationBaseSchema.safeParse(validInput);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupCodeQuestions).toHaveLength(3);
        expect(result.data.lookupCodeQuestions).toEqual([
          'How to configure a dashboard?',
          'How to configure a widget?',
          'Dashboard setup and configuration'
        ]);
      }
    });

    it('should accept exactly 5 questions (maximum limit)', () => {
      const validInput = {
        lookupCodeQuestions: [
          'Question 1',
          'Question 2', 
          'Question 3',
          'Question 4',
          'Question 5'
        ]
      };

      const result = documentationBaseSchema.safeParse(validInput);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupCodeQuestions).toHaveLength(5);
      }
    });

    it('should accept questions with various formats and lengths', () => {
      const validInput = {
        lookupCodeQuestions: [
          'Short question?',
          'This is a much longer question about dashboard configuration and widget setup with multiple concepts involved'
        ]
      };

      const result = documentationBaseSchema.safeParse(validInput);
      
      expect(result.success).toBe(true);
    });

    it('should accept questions with special characters and unicode', () => {
      const validInput = {
        lookupCodeQuestions: [
          'How to configure a dashboard with special chars: !@#$%^&*()?',
          'Question with unicode: 日本語',
          'Question with newlines\nand\ttabs'
        ]
      };

      const result = documentationBaseSchema.safeParse(validInput);
      
      expect(result.success).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('should reject empty array', () => {
      const invalidInput = {
        lookupCodeQuestions: []
      };

      const result = documentationBaseSchema.safeParse(invalidInput);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe('too_small');
        expect((result.error.issues[0] as any).minimum).toBe(1);
      }
    });

    it('should reject more than 5 questions', () => {
      const invalidInput = {
        lookupCodeQuestions: [
          'Question 1',
          'Question 2',
          'Question 3', 
          'Question 4',
          'Question 5',
          'Question 6'
        ]
      };

      const result = documentationBaseSchema.safeParse(invalidInput);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe('too_big');
        expect((result.error.issues[0] as any).maximum).toBe(5);
      }
    });

    it('should reject non-string elements in array', () => {
      const invalidInput = {
        lookupCodeQuestions: [
          'Valid question',
          123,
          'Another valid question'
        ]
      };

      const result = documentationBaseSchema.safeParse(invalidInput);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe('invalid_type');
        expect((result.error.issues[0] as any).expected).toBe('string');
      }
    });

    it('should reject non-array input for lookupCodeQuestions', () => {
      const invalidInput = {
        lookupCodeQuestions: 'Not an array'
      };

      const result = documentationBaseSchema.safeParse(invalidInput);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe('invalid_type');
        expect((result.error.issues[0] as any).expected).toBe('array');
      }
    });

    it('should reject missing lookupCodeQuestions field', () => {
      const invalidInput = {};

      const result = documentationBaseSchema.safeParse(invalidInput);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe('invalid_type');
        expect(result.error.issues[0].path).toEqual(['lookupCodeQuestions']);
      }
    });

    it('should reject null or undefined values', () => {
      const invalidInputs = [
        { lookupCodeQuestions: null },
        { lookupCodeQuestions: undefined }
      ];

      invalidInputs.forEach((invalidInput) => {
        const result = documentationBaseSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].code).toBe('invalid_type');
        }
      });
    });

    it('should reject object instead of array', () => {
      const invalidInput = {
        lookupCodeQuestions: { question: 'How to configure?' }
      };

      const result = documentationBaseSchema.safeParse(invalidInput);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe('invalid_type');
        expect((result.error.issues[0] as any).expected).toBe('array');
      }
    });

    it('should reject boolean values in array', () => {
      const invalidInput = {
        lookupCodeQuestions: ['Valid question', true, 'Another valid question']
      };

      const result = documentationBaseSchema.safeParse(invalidInput);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe('invalid_type');
        expect((result.error.issues[0] as any).expected).toBe('string');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty strings in array', () => {
      const edgeCaseInput = {
        lookupCodeQuestions: ['', 'Valid question']
      };

      const result = documentationBaseSchema.safeParse(edgeCaseInput);
      
      // Should still be valid as empty strings are still strings
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupCodeQuestions[0]).toBe('');
        expect(result.data.lookupCodeQuestions[1]).toBe('Valid question');
      }
    });

    it('should handle whitespace-only strings', () => {
      const edgeCaseInput = {
        lookupCodeQuestions: ['   ', '\t\n', 'Valid question']
      };

      const result = documentationBaseSchema.safeParse(edgeCaseInput);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupCodeQuestions).toHaveLength(3);
      }
    });

    it('should handle very long question strings', () => {
      const longQuestion = 'A'.repeat(1000); // 1000 character string
      const edgeCaseInput = {
        lookupCodeQuestions: [longQuestion]
      };

      const result = documentationBaseSchema.safeParse(edgeCaseInput);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupCodeQuestions[0]).toHaveLength(1000);
      }
    });

    it('should handle mixed length questions', () => {
      const edgeCaseInput = {
        lookupCodeQuestions: [
          'Short',
          'A'.repeat(500), // Medium length
          'How?', // Very short
          'This is a reasonable length question about TagoIO documentation and configuration?'
        ]
      };

      const result = documentationBaseSchema.safeParse(edgeCaseInput);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupCodeQuestions).toHaveLength(4);
        expect(result.data.lookupCodeQuestions[0]).toBe('Short');
        expect(result.data.lookupCodeQuestions[1]).toHaveLength(500);
        expect(result.data.lookupCodeQuestions[2]).toBe('How?');
      }
    });
  });

  describe('boundary conditions', () => {
    it('should accept exactly 1 question (minimum boundary)', () => {
      const boundaryInput = {
        lookupCodeQuestions: ['Single question']
      };

      const result = documentationBaseSchema.safeParse(boundaryInput);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupCodeQuestions).toHaveLength(1);
      }
    });

    it('should accept exactly 5 questions (maximum boundary)', () => {
      const boundaryInput = {
        lookupCodeQuestions: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5']
      };

      const result = documentationBaseSchema.safeParse(boundaryInput);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupCodeQuestions).toHaveLength(5);
      }
    });

    it('should reject 0 questions (below minimum)', () => {
      const boundaryInput = {
        lookupCodeQuestions: []
      };

      const result = documentationBaseSchema.safeParse(boundaryInput);
      
      expect(result.success).toBe(false);
    });

    it('should reject 6 questions (above maximum)', () => {
      const boundaryInput = {
        lookupCodeQuestions: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6']
      };

      const result = documentationBaseSchema.safeParse(boundaryInput);
      
      expect(result.success).toBe(false);
    });
  });

  describe('type inference and parsing', () => {
    it('should have correct TypeScript type inference', () => {
      const validInput = {
        lookupCodeQuestions: ['Test question']
      };

      const result = documentationBaseSchema.parse(validInput);
      
      // TypeScript should infer the correct type
      expect(typeof result.lookupCodeQuestions).toBe('object');
      expect(Array.isArray(result.lookupCodeQuestions)).toBe(true);
      expect(typeof result.lookupCodeQuestions[0]).toBe('string');
    });

    it('should maintain data structure integrity after parsing', () => {
      const originalInput = {
        lookupCodeQuestions: [
          'Question 1',
          'Question 2',
          'Question 3'
        ]
      };

      const result = documentationBaseSchema.parse(originalInput);
      
      expect(result).toEqual(originalInput);
      expect(result.lookupCodeQuestions).not.toBe(originalInput.lookupCodeQuestions); // Should be a copy
    });

    it('should preserve question order', () => {
      const inputWithOrder = {
        lookupCodeQuestions: [
          'First question',
          'Second question', 
          'Third question',
          'Fourth question',
          'Fifth question'
        ]
      };

      const result = documentationBaseSchema.parse(inputWithOrder);
      
      expect(result.lookupCodeQuestions[0]).toBe('First question');
      expect(result.lookupCodeQuestions[1]).toBe('Second question');
      expect(result.lookupCodeQuestions[2]).toBe('Third question');
      expect(result.lookupCodeQuestions[3]).toBe('Fourth question');
      expect(result.lookupCodeQuestions[4]).toBe('Fifth question');
    });
  });

  describe('schema metadata and descriptions', () => {
    it('should have proper schema description', () => {
      expect(documentationBaseSchema.description).toBe('Schema for the documentation operation');
    });

    it('should have field descriptions accessible', () => {
      const shape = documentationBaseSchema.shape;
      expect(shape.lookupCodeQuestions.description).toContain('questions to search for documentation');
      expect(shape.lookupCodeQuestions.description).toContain('at least 1 question and maximum 5 questions');
    });
  });
}); 