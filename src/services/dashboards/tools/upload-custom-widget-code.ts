import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { describeErrorSafely } from "../../../utils/safe-error";
import { invalidParamError } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";
import { postWidgetSourceUpload, WidgetUploadOutcome } from "../custom-widget-transport";

/** The bundler's real source cap, enforced locally before any request. */
const MAX_WIDGET_SOURCE_BYTES = 1024 * 1024;

const UPLOAD_EXAMPLE = '{ "dashboard_id": "61f0000000000000000da001", "widget_id": "61f0000000000000000db001", "source": "// tailwind\\nimport ..." }';

/** Distinct deployment-state messages the bundler returns as bundle failures. */
const FEATURE_DISABLED_ERROR = "widget bundler is not enabled on this deployment";
const OUTDATED_LAMBDA_ERROR = "widget bundler is outdated on this deployment";
const INVOCATION_FAILED_ERROR = "bundler invocation failed";

const uploadCustomWidgetCodeSchemaShape = {
  dashboard_id: resourceIdSchema("dashboard ID"),
  widget_id: resourceIdSchema("widget ID"),
  source: z.string().min(1).describe("The complete .tsx widget source as plain UTF-8 text, never base64. At most 1 MiB."),
};

type UploadCustomWidgetCodeParams = z.infer<z.ZodObject<typeof uploadCustomWidgetCodeSchemaShape>>;

function renderWarnings(warnings: string[]): string {
  if (warnings.length === 0) {
    return "";
  }
  return `\n\nBundler warnings (non-fatal):\n${warnings.map((warning) => `- ${warning}`).join("\n")}`;
}

function renderOutcome(widgetId: string, outcome: WidgetUploadOutcome): string {
  if (outcome.success) {
    return `Source uploaded and bundled successfully for widget \`${widgetId}\`. The widget now renders the new build (display.url and display.artifact_url were updated).${renderWarnings(outcome.warnings)}`;
  }

  if (outcome.error === FEATURE_DISABLED_ERROR) {
    return `Source saved for widget \`${widgetId}\`, but this deployment has no widget bundler (feature disabled), so nothing was bundled. The source file was stored and display.url updated; an operator must enable the bundler for builds to run.`;
  }
  if (outcome.error === OUTDATED_LAMBDA_ERROR) {
    return `Source saved for widget \`${widgetId}\`, but this deployment's widget bundler is outdated and could not produce an artifact. The previous build (if any) keeps rendering; an operator must update the bundler.`;
  }

  if (outcome.error === INVOCATION_FAILED_ERROR) {
    return `Source saved for widget \`${widgetId}\`, but the platform build service failed to run (an infrastructure error, not a source problem). The source file was stored and display.url advanced; the previous successful build (if any) keeps rendering. Retry the upload later; the source does not need changes for this error.`;
  }

  const bundleError = outcome.error ?? "the bundler reported no error detail";
  return (
    [
      `Source saved for widget \`${widgetId}\`, but the bundle FAILED; this is fixable, not fatal. The source file was stored and display.url advanced; the widget keeps rendering the previous successful build, if any (display.artifact_url unchanged).`,
      `Bundler error: ${bundleError}`,
      `Fix the source and call upload_custom_widget_code again. Common causes: an unresolvable or conflicting npm package version, source over 1 MiB, dynamic import() / code splitting, or a bundle timeout.`,
    ].join("\n\n") + renderWarnings(outcome.warnings)
  );
}

async function uploadCustomWidgetCodeTool(context: ServerContext, params: UploadCustomWidgetCodeParams): Promise<string> {
  const sourceBytes = Buffer.byteLength(params.source, "utf8");
  if (sourceBytes > MAX_WIDGET_SOURCE_BYTES) {
    throw invalidParamError("source", `must be at most ${MAX_WIDGET_SOURCE_BYTES} bytes of UTF-8 (received ${sourceBytes} bytes)`, UPLOAD_EXAMPLE);
  }

  // Uploading rewires display.url on ANY widget the route accepts, so gate on
  // the widget actually being an iframe custom widget before mutating.
  const widget = (await context.resources.dashboards.widgets.info(params.dashboard_id, params.widget_id)) as unknown as Record<string, unknown>;
  const type = typeof widget.type === "string" ? widget.type : "";
  if (type !== "iframe") {
    throw new Error(
      `Widget \`${params.widget_id}\` has type "${type}", not "iframe". Custom widget source can only be uploaded to iframe widgets; create one with create_widget (type "iframe", display.url "").`
    );
  }

  const encodedSource = Buffer.from(params.source, "utf8").toString("base64");
  // The extension is fixed by the tool: only .tsx uploads are supported, and
  // the API stores the file at the canonical widgets/{widget_id}.tsx key.
  let response;
  try {
    response = await postWidgetSourceUpload(context, { dashboardId: params.dashboard_id, widgetId: params.widget_id, file: encodedSource, fileName: "widget.tsx" });
  } catch (caught) {
    // The transport already redacts the credential and the base64 form; the
    // plaintext the caller submitted is only known here.
    throw new Error(describeErrorSafely(caught, [context.token, params.source, encodedSource]));
  }

  if (response.kind === "rate_limited") {
    const retryDetail = response.retryAfterSeconds === null ? "shortly" : `in ${response.retryAfterSeconds} seconds`;
    throw new Error(`Widget source uploads are rate limited per minute (free plan: 1, starter: 10, scale: 30). Nothing was uploaded. Retry ${retryDetail}.`);
  }

  if (response.kind === "request_error") {
    if (response.message.includes("exceeded the maximum limit")) {
      throw new Error(
        `${describeErrorSafely(response.message, [params.source, encodedSource])}. Nothing was uploaded or changed; free File Storage space (or raise the service limit) and retry.`
      );
    }
    if (response.message.includes("Authorization denied")) {
      throw new Error(
        "Authorization denied: only Profile and Analysis tokens can upload widget source (an Analysis token additionally needs an Access Management edit/dashboard policy)."
      );
    }
    throw new Error(`Widget source upload was rejected by the API: ${describeErrorSafely(response.message, [params.source, encodedSource])}`);
  }

  return renderOutcome(params.widget_id, response.outcome);
}

const uploadCustomWidgetCodeConfigJSON: IToolConfig = {
  name: "upload_custom_widget_code",
  description: `Uploads .tsx source code to a custom widget (an iframe widget) on a TagoIO dashboard and triggers the platform build. Send the source as plain UTF-8 in \`source\`, never base64; encoding happens internally. Only .tsx is supported (the extension is fixed by the tool) and the source must be at most 1 MiB.

Every outcome is reported distinctly: on success the widget renders the new build (non-fatal bundler warnings are surfaced); on a bundle failure the source is still saved and the widget keeps rendering the previous successful build; read the reported bundler error, fix the source, and upload again. The uploaded source is never echoed back.

<example>
${UPLOAD_EXAMPLE}
</example>

Key limitations: the widget must already exist (create_widget with type "iframe" and display.url ""); the file is stored at a path derived from the widget ID, never a caller input; uploads are rate limited per minute by plan (free 1 / starter 10 / scale 30); only Profile and Analysis tokens are accepted by the API.`,
  parameters: uploadCustomWidgetCodeSchemaShape,
  title: "Upload Custom Widget Code",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  tool: uploadCustomWidgetCodeTool,
};

export { MAX_WIDGET_SOURCE_BYTES, uploadCustomWidgetCodeConfigJSON };
