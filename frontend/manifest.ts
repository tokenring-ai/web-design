import type { ViewManifest } from "@tokenring-ai/one-frontend/dock/types.ts";
import type { PluginFrontendManifest } from "@tokenring-ai/one-frontend/plugins/types.ts";
import { Code2, Frame, Monitor } from "lucide-react";

export const WEB_DESIGN_DASHBOARD_ID = "web-design";
export const DESIGN_FLOWS_VIEW = "design-flows";
export const DESIGN_EDITOR_VIEW = "design-editor";
export const DESIGN_PREVIEW_VIEW = "design-preview";

/** Navigator: design flows, the files inside them, and (on the Web Design dashboard) the attached design agent. */
export const designFlowsViewManifest = {
  id: DESIGN_FLOWS_VIEW,
  title: "Design flows",
  description: "Design flows and the mockup files inside them",
  icon: Frame,
  availableOn: ["any"],
  defaultSize: { width: 300, height: 400 },
  minimumSize: { width: 240, height: 160 },
  tags: ["design"],
} satisfies ViewManifest;

/**
 * One design file per panel: the code editor with save, version history and
 * annotations. Without params the panel is the "Design with agents" landing
 * that the next opened design fills in place.
 */
export const designEditorViewManifest = {
  id: DESIGN_EDITOR_VIEW,
  title: "Design",
  description: "Edit the HTML of one design file",
  icon: Code2,
  availableOn: [],
  instanceable: true,
  renderer: "always",
  defaultSize: { width: 640, height: 480 },
  minimumSize: { width: 360, height: 240 },
  tags: ["design"],
} satisfies ViewManifest;

/** Live preview of one design file, with the device toolbar and annotation pins. */
export const designPreviewViewManifest = {
  id: DESIGN_PREVIEW_VIEW,
  title: "Preview",
  description: "Live preview of one design file",
  icon: Monitor,
  availableOn: [],
  instanceable: true,
  // An iframe that remounts loses its scroll position and re-runs the design's scripts.
  renderer: "always",
  defaultSize: { width: 520, height: 480 },
  minimumSize: { width: 360, height: 240 },
  tags: ["design"],
} satisfies ViewManifest;

/** Views that act as the Web Design dashboard's navigator; editors never tab into their group. */
export const WEB_DESIGN_SIDEBAR_VIEWS: readonly string[] = [DESIGN_FLOWS_VIEW];

/**
 * Metadata for the web-design dashboard shipped by this plugin. The frontend
 * merges this into its registry and derives the SPA server routes from it.
 */
export default {
  id: WEB_DESIGN_DASHBOARD_ID,
  path: "/web-design",
  label: "Web Design",
  shortLabel: "WD",
  description: "Build UI mockups and design flows with agents",
  group: "Build",
  icon: Frame,
  iconClass: "text-purple-500",
  gradient: "from-purple-500 to-violet-600",
  views: [designFlowsViewManifest, designEditorViewManifest, designPreviewViewManifest],
} satisfies PluginFrontendManifest;
