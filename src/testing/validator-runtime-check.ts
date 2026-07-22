import { validateDashboardCreate, validateWidgetCreate, WIDGET_TYPES } from "../services/dashboards/validation-adapter";

/**
 * Standalone runtime check for the built validation adapter. Run after
 * `pnpm run build` via `pnpm run test:validator:node`; it proves the
 * CommonJS build can require() the ESM-only `@tago-io/dashboard-schema`
 * package on the running Node version (require(esm) needs >= 22.12.0).
 */

let failures = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

console.log(`Node ${process.version}`);

check("widget types count is 40", WIDGET_TYPES.length === 40, `got ${WIDGET_TYPES.length}`);
check("widget types include gauge and summary", WIDGET_TYPES.includes("gauge") && WIDGET_TYPES.includes("summary"));

const validGauge = validateWidgetCreate({
  label: "Tank pressure",
  type: "gauge",
  display: { gauge_type: "solid", numberformat: "0", minimum: 0, maximum: 100 },
});
check("valid gauge create passes", validGauge.ok, validGauge.ok ? undefined : JSON.stringify(validGauge.issues));

const missingDisplay = validateWidgetCreate({ label: "Tank pressure", type: "gauge" });
check(
  "gauge create without display fails at display",
  !missingDisplay.ok && missingDisplay.issues.length > 0 && missingDisplay.issues.some((issue) => issue.path === "display"),
  missingDisplay.ok ? "unexpectedly passed" : JSON.stringify(missingDisplay.issues)
);

let duplicateTabsCaught = false;
try {
  validateDashboardCreate(
    {
      label: "Ops",
      tabs: [
        { key: "main", value: "Main" },
        { key: "main", value: "Duplicate" },
      ],
    },
    "a".repeat(24)
  );
} catch (error) {
  duplicateTabsCaught = error instanceof Error && error.message.includes("main");
}
check("dashboard create rejects duplicate tab keys", duplicateTabsCaught);

if (failures > 0) {
  process.exit(1);
}
