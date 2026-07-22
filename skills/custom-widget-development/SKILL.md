---
name: custom-widget-development
description: Author, upload, debug, and place TagoIO custom dashboard widgets (.tsx) through the TagoIO MCP server's custom-widget tools. Use when the user explicitly asks for a custom widget or asks to change the code of an existing one; native widget types are the default and are configured with create_widget/update_widget, not with code.
---

# TagoIO Custom Widget Development

A custom widget is an `iframe` widget whose code is one `.tsx` React component in the profile's TagoIO Files storage; the platform bundles it on upload and the dashboard renders the bundled build. **Build one only when the user explicitly asks**: native widget types are the default (see `widget_schema_lookup`); never silently replace a native widget with a custom one.

## Tool sequence

1. When given titles instead of 24-character IDs, resolve them: `search_dashboards` → `get_dashboard` (`arrangement` lists widget IDs) → `get_widget`.
2. `read_device_data` on the target device BEFORE coding: real variable names, units, and `group` batching are what your code filters against; never guess them.
3. New widget: `create_widget` with `{"type": "iframe", "label": ..., "display": {"url": ""}}` plus bindings and container style (below). It starts unplaced, with no source file.
4. Existing widget: `get_custom_widget_code`: current source, fetched fresh (never CDN-stale), plus bundle state. "No source authored yet" is the normal starting state, not an error.
5. Author the `.tsx` per the contract below.
6. `upload_custom_widget_code` with plain UTF-8 source. Bundle failures are fixable caveats, not fatal errors.
7. The widget renders only once placed: send the COMPLETE arrangement via `update_dashboard` (arrays replace atomically; include every existing entry). Sizing: see "Space".

## Binding data

`useRealtimeData` delivers only what the widget's top-level `data` array binds: **an empty feed means missing bindings, not the wrong hook**. Bind on create (or later via `update_widget`):

```json
{
  "data": [{ "origin": "<device_id>", "variables": ["speed", "fuel_level"], "qty": 500 }],
  "display": { "url": "", "max_data": 500 }
}
```

- **Set `qty` explicitly**: omitted, the server silently returns 15 records regardless of `max_data`. Keep `max_data` ≥ the largest `qty`.
- **Never set `data[].query`**: omission IS the read-all contract; the enum values are for aggregate views, and the common-looking ones break data resolution at render time.
- **`display.variables` is a decoy**: host-recomputed from `data` every render (drives write auto-fill, not reads); anything written there is overwritten and never selects data.
- The load handshake delivers an initial snapshot of STORED data per these bindings; history appears in `useRealtimeData()` immediately; there is no separate history fetch.

## Updating an existing widget

1. `get_custom_widget_code` first, always: edit what is deployed, not what you remember.
2. Inventory the deployed behaviors (interactions like chart↔table sync, computed KPIs, transparency, bindings) and preserve everything you weren't asked to change; silently dropping working features is the most common update failure.
3. Config (bindings, `qty`/`max_data`, chrome) → `update_widget`; code → `upload_custom_widget_code`. Config-only changes need no re-upload.

## Authoring contract

One component tree, single `export default`, wrapped in `TagoIOProvider`. The provider performs the iframe ready-handshake; **omitting it hangs the widget forever** (blank iframe, no data). The platform injects the HTML shell, `#root`, `createRoot`, and an error boundary; never provide your own, post `loaded` yourself, or add message handlers for the dashboard protocol. JSX uses the automatic runtime; importing React is only required for hooks but pins the version explicitly.

### Imports: `npm:` specifiers, EXACT pins

Every import is `npm:<package>@<exact.version>`; unpinned resolves to `latest` and ranges are tolerated; both are unreproducible; one version per package per file. Platform-tested set:

| Package           | Pin                                      |
| ----------------- | ---------------------------------------- |
| React             | `npm:react@19.2.8`                       |
| TagoIO widget SDK | `npm:@tago-io/custom-widget-react@2.2.0` |
| Charts            | `npm:recharts@3.9.2`                     |
| Icons             | `npm:lucide-react@0.562.0`               |
| Dates             | `npm:luxon@3.7.2`                        |

React is hard-gated to major 19 (unpinned sources get an older `19.2.3` injected; other majors fail the bundle). SDK `2.2.0` adds typed resource editing (2.1.0 added `useResourceData`); older versions may be warm-cached, so the first save can pay a cold registry fetch (a delay, not a failure). Other npm packages resolve but are unvetted against the widget runtime and install cold; prefer the tested set.

### Tailwind

Utility classes work only when the literal string `tailwind` appears in the source (case-insensitive whole-file scan). Convention: `// tailwind` as the FIRST LINE, where it survives later edits. **No marker → classes silently do nothing** (the bundle still "succeeds").

### Forbidden: fails the bundle or breaks the widget

- Relative imports (only ONE file is staged; they fail the production bundle even when local tooling suggests otherwise).
- Dynamic `import()` / code-splitting (output must be a single chunk).
- Own `createRoot`, HTML shell, or `loaded` handshake.
- CSS-file imports (no stylesheets exist in the bundle; use Tailwind or inline styles).
- shadcn / `widget/ui/*` (not available; build from plain elements).
- Page furniture: navigation, footers, a root page background (`bg-*`, `min-h-dvh`); the widget is a panel, not a page.

### Pick a lane: dashboard UI or seamless

Outer chrome (background, shadow, radius, padding, title bar) belongs to the widget container: `display.theme.color.background` + `display.frame_settings` (shapes in `widget_schema_lookup("iframe")`; `theme.color.header` colors the header BAR, not its text). Decide the lane first: the user's call when stated, else yours (state it):

- **Dashboard UI**: the container draws the card; no card-styled wrappers in code (card-in-card). Title bar visible → no in-code title; hidden via `header_visibility: "show_only_buttons"` → title belongs in code.
- **Seamless**: container background `"transparent"` + `frame_settings.shadow.hide: true` + `header_visibility: "show_only_buttons"` (buttons/context menu keep working, the bar reserves no space) AND a transparent code root. Half-measures fail: root-only leaves the platform card behind your content; container-only leaves your background as the card. In-code cards and section chrome are good composition in this lane.

**Theme caveat:** the dashboard's light/dark theme is NOT detectable from inside the widget today. A seamless widget tuned to one is unreadable on the other; ask the user, or pick colors legible on both (e.g. a subtle surface tint behind text-dense areas).

### Space: the arrangement must afford the content

The iframe is sized by its arrangement entry `{x, y, width, height}` (set via `update_dashboard`). The grid is **4 columns** wide (`x: 0, width: 4` = full width; fractions valid); **one `height` unit = 80 px** on desktop, and a visible header bar eats ~40 px off the widget's total. Never leave a data widget near the platform default (height 2 ≈ 160 px): a lone chart wants `height: 6–8`, chart + table `height: 10+`; 10–24 renders well. Narrow viewports stack to one full-width column (`width` ignored).

Size the entry to the content, or design scrolling explicitly, never by accident: (a) fully responsive with explicit overflow; (b) iframe-level scrolling (usually worst: clipping at the fold reads as broken); (c) managed regions (usually best: the table scrolls within itself; charts essentially never scroll). Build fluid regardless: `h-full` + `min-h-0` down the chain, `tabular-nums`, recharts in `ResponsiveContainer`.

**Inside the iframe:** tooltips/popovers/menus clip at the edges: position or flip them inward; never rely on rendering outside the widget bounds. `scrollIntoView` (chart↔table sync) escapes the iframe and scroll-jacks the host page; use `{ block: "nearest" }` and scroll the inner container, not the document. External webfonts/stylesheets load normally (no sandbox/CSP); a system stack stays the safe default.

### Default look (no user direction)

A stated direction always wins. Otherwise match the TagoIO Admin UI: neutral scale + ONE restrained accent; status colors only for state, never decoration, never alone (pair with label/icon); max two font weights; consistent spacing; no emojis. The contract is not a style guide; invest real design effort within it.

### SDK hooks (verified 2.2.0 signatures)

Read:

- `useWidget(): { widget, isLoading, variables, dashboardId, widgetId, label }`. Config only; its `data`/`resource` arrays are binding DEFINITIONS, never data rows.
- `useRealtimeData(options?): { data, records, eventCount, lastUpdatedAt, clear }`. The data feed (stored snapshot + live). `records` is the flat `TDataRecord[]`: `{ id, variable, value?, unit?, group?, device?, time, location?, metadata? }`; `time` is an ISO string, `lastUpdatedAt` a `Date` (not a number), `group` the batch key for pivoting (display something derived, like the batch's time, never the raw key). Default pattern: call with no options, filter after the hook. The `selector` option receives/returns `TRealtimeData[]` BLOCKS (flat-record filtering silently returns nothing) and must be referentially stable; inline clones crash with React error #185.
- `useResourceData(): { resources, getByType, refresh, eventCount, lastUpdatedAt }`. Resources do NOT live-update: add a visible refresh or an interval calling `refresh()`. Rows are open-ended; guard field access.
- `useWidgetData(): { widget, isLoading, records, realtimeEventCount, lastUpdatedAt, errors }`. Convenience combo over the SAME store as `useRealtimeData` (not a more-historical source); empty feed here = fix bindings, not the hook. Auxiliary: `useWidgetErrors()`, `useUserInformation()`, `useBlueprintDevices()`, `useDictionary()`.

Mutate (each returns a named function + `isX`/`error`/`reset`):

- `useSendData()`: `await sendData({ variable, value })`; the host fills the device by matching `variable` against the widget's bindings; **unbound variables are silently dropped**.
- `useEditData()`: like send, pass the record `id`.
- `useDeleteData()`: takes FULL records (with `id`/`device`), not bare IDs.
- `useEditResourceData()`: edits resource ROWS; the payload's identity key selects the type (`{ device: id }`, `{ user: id }`, `{ id: rowId, entity: blockId }`); columns outside the resource's `editable` config are **silently dropped**; rows don't live-update; call `refresh()` after edits.
- `useRunAnalysis()`, `useNavigation()`: analysis trigger; links/modal.

## Failure map

**At save (`bundle FAILED` + bundler error):** unresolvable/conflicting versions · protocol-escape versions (`file:`, `git:`) · subpath traversal · non-19 React · multiple chunks / dynamic `import()` · relative imports · source > 1 MiB · install/bundle timeouts.

**At render (bundle "succeeds"):** no `data` bindings → hooks empty forever · missing `qty` → 15 records · missing `tailwind` marker → unstyled · missing `TagoIOProvider` → hangs · runtime exception → swallowed by the injected error boundary (blank widget) · unbound `variable` send → silently dropped · rows read off `useWidget()` config → always empty · resources without refresh → stale.

**Fix loop:** a failed bundle still saves the source and advances `display.url` while the widget keeps rendering the previous build (`artifact_url` untouched); read the bundler error, fix, re-upload. Uploads are rate limited per minute (free 1 / starter 10 / scale 30); batch fixes.

## Example 1: minimal live-data widget

```tsx
import React from "npm:react@19.2.8";
import { TagoIOProvider, useWidget, useRealtimeData } from "npm:@tago-io/custom-widget-react@2.2.0";

function Dashboard() {
  const { label, isLoading } = useWidget();
  const { records, eventCount } = useRealtimeData();
  if (isLoading) return <p style={{ padding: 20 }}>Waiting for data...</p>;
  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: 20 }}>
      <h1>{label || "My Widget"}</h1>
      <p>Data updates received: {eventCount}</p>
      {records.length === 0 ? (
        <p>No data received yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {records.map((record) => (
            <li key={record.id}>
              <strong>{record.variable}</strong>: {record.value} {record.unit || ""}
              <br />
              <small>Time: {new Date(record.time).toLocaleString()}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function App() {
  return (
    <TagoIOProvider>
      <Dashboard />
    </TagoIOProvider>
  );
}
```

## Example 2: realistic Tailwind metric widget

Single dominant metric, transparent root (the container owns the frame), loading/empty states, filter-after-hook:

```tsx
// tailwind
import React, { useMemo } from "npm:react@19.2.8";
import { TagoIOProvider, useRealtimeData, useWidget } from "npm:@tago-io/custom-widget-react@2.2.0";
import { Droplets, TrendingUp } from "npm:lucide-react@0.562.0";
import { DateTime } from "npm:luxon@3.7.2";

function HumidityMetric() {
  const { isLoading } = useWidget();
  const { records } = useRealtimeData();
  const latest = useMemo(
    () => records.filter((r) => r.variable === "humidity" && typeof r.value !== "undefined").sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime())[0],
    [records]
  );

  if (isLoading) return <div className="flex h-full items-center justify-center p-4 text-sm text-neutral-500">Loading metric...</div>;
  if (!latest) return <div className="flex h-full items-center justify-center p-4 text-sm text-neutral-500">Waiting for live data</div>;

  const value = Math.max(0, Math.min(100, Number(latest.value) || 0));
  const circumference = 2 * Math.PI * 40;
  const status = value < 30 ? "Dry" : value > 80 ? "High moisture" : "Balanced";

  return (
    <div className="flex h-full flex-col justify-between gap-3 p-4 text-neutral-900">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">Shipment condition</div>
          <div className="mt-1 text-base font-semibold">Humidity</div>
        </div>
        <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600">
          <Droplets className="h-5 w-5" strokeWidth={2} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-semibold tracking-tight">{value.toFixed(1)}</span>
            <span className="text-sm font-medium text-neutral-400">{latest.unit || "%"}</span>
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
            <TrendingUp className="h-3 w-3" strokeWidth={2.5} />
            {status}
          </div>
        </div>
        <div className="relative h-[88px] w-[88px] shrink-0">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-label={`Humidity ${value}%`}>
            <circle cx="50" cy="50" r="40" fill="none" className="stroke-neutral-100" strokeWidth="9" />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              className="stroke-indigo-500"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - (value / 100) * circumference}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-neutral-600">{Math.round(value)}%</div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-neutral-100 pt-2 text-[11px] text-neutral-400">
        <span>Last reading</span>
        <span>{latest.time ? DateTime.fromISO(latest.time).toFormat("MMM dd, HH:mm") : "No timestamp"}</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <TagoIOProvider realtimeStrategy="merge" realtimeMaxRecords={50}>
      <HumidityMetric />
    </TagoIOProvider>
  );
}
```
