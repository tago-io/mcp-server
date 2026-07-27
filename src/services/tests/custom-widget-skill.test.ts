import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Self-consistency check for the custom-widget-development skill: every code
 * example the skill ships must obey the authoring rules the skill itself
 * states (exact pins, provider wrapper, tailwind marker, no forbidden
 * constructs). A rule change that invalidates an example fails here.
 */
const SKILL_PATH = resolve(__dirname, "../../../skills/custom-widget-development/SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

// Mirrors the platform bundler's hardcoded REACT_VERSION. Any other patch leaves
// react-dom at 19.2.3, so the widget bundles then renders blank (React #527).
const REQUIRED_REACT_VERSION = "19.2.3";

const EXACT_PIN_PATTERN = /^npm:(@[^/@]+\/[^/@]+|[^/@]+)@\d+\.\d+\.\d+(\/.*)?$/;

function extractTsxExamples(markdown: string): string[] {
  const blocks: string[] = [];
  const fence = /```tsx\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(markdown)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importPattern = /from\s+"([^"]+)"|import\s+"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = importPattern.exec(source)) !== null) {
    specifiers.push(match[1] ?? match[2]);
  }
  return specifiers;
}

const examples = extractTsxExamples(skill);

describe("custom-widget-development skill self-consistency", () => {
  it("has frontmatter and ships at least the two worked examples", () => {
    expect(skill.startsWith("---\n")).toBe(true);
    expect(skill).toContain("name: custom-widget-development");
    expect(skill).toContain("description:");
    expect(examples.length).toBeGreaterThanOrEqual(2);
  });

  it("teaches the locked SDK pin", () => {
    expect(skill).toContain("@tago-io/custom-widget-react@2.2.0");
    // Superseded pins never appear as a taught default.
    expect(skill).not.toContain("custom-widget-react@2.0.1");
    expect(skill).not.toContain("custom-widget-react@2.1.0");
  });

  it.each(examples.map((example, index) => [index + 1, example] as const))("example %d imports only npm: specifiers with exact pins", (_index, example) => {
    const specifiers = extractImportSpecifiers(example);
    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(specifier, `import "${specifier}" must be an exactly pinned npm: specifier`).toMatch(EXACT_PIN_PATTERN);
    }
  });

  it.each(examples.map((example, index) => [index + 1, example] as const))("example %d wraps the default export tree in TagoIOProvider", (_index, example) => {
    expect(example).toContain("export default");
    expect(example).toContain("<TagoIOProvider");
    expect(example).toContain("</TagoIOProvider>");
  });

  it.each(examples.map((example, index) => [index + 1, example] as const))("example %d pins React to the exact required version when it imports React", (_index, example) => {
    const reactPins = extractImportSpecifiers(example).filter((specifier) => /^npm:react(-dom)?@/.test(specifier));
    for (const pin of reactPins) {
      expect([`npm:react@${REQUIRED_REACT_VERSION}`, `npm:react-dom@${REQUIRED_REACT_VERSION}`]).toContain(pin);
    }
  });

  it("pin table React row carries the exact required pin", () => {
    const reactRow = skill.split("\n").find((line) => /^\|\s*React\s*\|/.test(line));
    expect(reactRow, "pin table must include a React row").toBeDefined();
    expect(reactRow).toContain(`\`npm:react@${REQUIRED_REACT_VERSION}\``);
  });

  it("teaches no React version other than the required one", () => {
    for (const [, version] of skill.matchAll(/npm:react(?:-dom)?@([^\s`"/)]+)/g)) {
      expect(version).toBe(REQUIRED_REACT_VERSION);
    }
    // Prose states the version bare, without the npm: prefix, so the pin scan above misses it.
    for (const [version] of skill.matchAll(/19\.\d+\.\d+/g)) {
      expect(version).toBe(REQUIRED_REACT_VERSION);
    }
  });

  it.each(examples.map((example, index) => [index + 1, example] as const))("example %d carries the tailwind first-line marker when it uses utility classes", (_index, example) => {
    if (example.includes("className=")) {
      expect(example.split("\n")[0].trim()).toBe("// tailwind");
    }
  });

  it.each(examples.map((example, index) => [index + 1, example] as const))("example %d contains no forbidden constructs", (_index, example) => {
    for (const specifier of extractImportSpecifiers(example)) {
      expect(specifier, "relative imports are forbidden").not.toMatch(/^\.\.?\//);
      expect(specifier, "CSS imports are forbidden").not.toMatch(/\.css$/);
    }
    expect(example).not.toContain("import(");
    expect(example).not.toContain("createRoot");
    expect(example).not.toContain("document.getElementById");
    expect(example).not.toMatch(/postMessage.*loaded/);
    expect(example).not.toContain("widget/ui/");
    expect(example).not.toMatch(/<html|<body|<!DOCTYPE/i);
  });
});
