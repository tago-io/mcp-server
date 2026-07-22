import { z } from "zod/v3";

import { getProfileID } from "../../../utils/get-profile-id";
import { resourceIdSchema } from "../../../utils/global-params.model";
import { describeErrorSafely } from "../../../utils/safe-error";
import { fetchAnalysisSource, isControlledFetchError } from "../../analysis/source-fetch";
import { IToolConfig, ServerContext } from "../../types";
import { parseWidgetSourcePath } from "../custom-widget-source";
import { resolveSignedWidgetSourceUrl } from "../custom-widget-transport";

const getCustomWidgetCodeSchemaShape = {
  dashboard_id: resourceIdSchema("dashboard ID"),
  widget_id: resourceIdSchema("widget ID"),
};

type GetCustomWidgetCodeParams = z.infer<z.ZodObject<typeof getCustomWidgetCodeSchemaShape>>;

const BOOTSTRAP_GUIDANCE = "No source has been authored yet. Write the complete .tsx component and save it with upload_custom_widget_code.";

function bootstrapAnswer(label: string, detail: string): string {
  return `Widget "${label}" is a custom (iframe) widget with no readable source. ${detail}\n\n${BOOTSTRAP_GUIDANCE}`;
}

async function getCustomWidgetCodeTool(context: ServerContext, params: GetCustomWidgetCodeParams): Promise<string> {
  const widget = (await context.resources.dashboards.widgets.info(params.dashboard_id, params.widget_id)) as unknown as Record<string, unknown>;
  const type = typeof widget.type === "string" ? widget.type : "";
  if (type !== "iframe") {
    throw new Error(
      `Widget \`${params.widget_id}\` has type "${type}", not "iframe". Custom widget code exists only on iframe widgets backed by a .tsx source file. Use get_widget to inspect this widget, or create_widget with type "iframe" and display.url "" to start a custom widget.`
    );
  }

  const label = typeof widget.label === "string" && widget.label.length > 0 ? widget.label : params.widget_id;
  const display = typeof widget.display === "object" && widget.display !== null ? (widget.display as Record<string, unknown>) : {};
  const rawUrl = typeof display.url === "string" ? display.url : "";
  const hasArtifact = typeof display.artifact_url === "string" && display.artifact_url.length > 0;

  if (rawUrl.trim().length === 0) {
    return bootstrapAnswer(label, "Its display.url is empty.");
  }

  const profileId = await getProfileID(context.resources);
  const sourcePath = parseWidgetSourcePath(rawUrl, profileId, context.region);
  if (!sourcePath) {
    return [
      `Widget "${label}" is an iframe widget, but its display.url does not point at a .tsx file inside this profile's TagoIO Files storage; it may be an external page, an .html file, or another profile's file. This tool only reads profile-owned .tsx custom-widget source.`,
      `If the URL is a placeholder rather than something the user set deliberately, clear it (update_widget with patch {"display": {"url": ""}}) and call this tool again to start authoring.`,
    ].join("\n\n");
  }

  // The signed route bypasses the ~60 s Files CDN cache, so a read immediately
  // after an upload returns the fresh bytes. The fetch is never cached.
  let source: string;
  try {
    const signedUrl = await resolveSignedWidgetSourceUrl(context, { profileId, widgetId: params.widget_id });
    const fetched = await fetchAnalysisSource(signedUrl);
    source = fetched.source;
  } catch (caught) {
    const httpStatus = (caught as { httpStatus?: number }).httpStatus;
    const fetchedMissing = isControlledFetchError(caught) && (caught as Error).message.includes("HTTP 4xx");
    if (httpStatus === 403 || httpStatus === 404 || fetchedMissing) {
      // This tool reads only the canonical managed file; a display.url wired
      // to a different profile-owned path is not proof nothing exists there.
      const canonicalPath = `widgets/${params.widget_id}.tsx`;
      const pathDetail =
        sourcePath === canonicalPath
          ? "Its display.url is wired, but the source file does not exist in TagoIO Files yet (or is not readable with this token)."
          : `Its display.url points at "${sourcePath}", not the managed "${canonicalPath}" path this tool reads; the managed file does not exist yet (uploading will store the source there and rewire display.url to it).`;
      return bootstrapAnswer(label, pathDetail);
    }
    // Controlled fetch failures name only a category; anything else is
    // formatted through the redaction helper so the credential never escapes.
    // The signed URL itself never appears in either failure family.
    const detail = describeErrorSafely(caught, [context.token]).replace("Analysis script fetch failed:", "the source fetch failed:");
    throw new Error(`Failed to read the widget source: ${detail}`);
  }

  const bundleState = hasArtifact
    ? "A bundled artifact exists (display.artifact_url is set), so the widget currently renders the last successful build."
    : "No bundled artifact exists yet (display.artifact_url is not set); the widget has never bundled successfully.";

  return [`Current .tsx source of widget "${label}" (\`${params.widget_id}\`). ${bundleState}`, "```tsx", source, "```"].join("\n");
}

const getCustomWidgetCodeConfigJSON: IToolConfig = {
  name: "get_custom_widget_code",
  description: `Reads the current .tsx source code of a custom widget (an iframe widget backed by a source file in TagoIO Files), fetched fresh so it never returns stale bytes after an upload. Also reports whether a bundled artifact exists.

Use this before editing an existing custom widget, or to check what a custom widget currently runs. If the widget has no source yet (fresh iframe widget, or the file was never created), the result says so and steers to upload_custom_widget_code; that is a normal starting state, not an error. Non-iframe widgets are refused: only iframe widgets carry custom code.

<example>
{"dashboard_id": "61f0000000000000000da001", "widget_id": "61f0000000000000000db001"}
</example>

Key limitations: reads only .tsx source owned by this profile (external URLs and .html widgets are refused); the source path is derived from the widget ID and is never a caller input.`,
  parameters: getCustomWidgetCodeSchemaShape,
  title: "Get Custom Widget Code",
  annotations: { readOnlyHint: true, openWorldHint: true },
  mutationClass: "read",
  tool: getCustomWidgetCodeTool,
};

export { getCustomWidgetCodeConfigJSON };
