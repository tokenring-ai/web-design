import type { AppManifest } from "@tokenring-ai/one-frontend/layout/types.ts";
import type { PluginLayoutManifest } from "@tokenring-ai/one-frontend/plugins/layoutTypes.ts";
import { Frame } from "lucide-react";
import {
  DESIGN_EDITOR_VIEW_ID,
  DESIGN_FLOWS_VIEW_ID,
  DESIGN_LANDING_VIEW_ID,
  DESIGN_PREVIEW_KIND,
  DESIGN_PREVIEW_VIEW_ID,
  DESIGN_VIEW_KIND,
  WEB_DESIGN_APP_ID,
  WEB_DESIGN_APP_PATH,
} from "./ids.ts";

/**
 * Web Design: the flow tree (with the attached design agent) on the left; one
 * editor tab per open design beside the "Design with agents" landing tab, with
 * the designs' live previews docked in a column to their right. Routes:
 * `/web-design`, `/web-design/<flow>` (expands it), `/web-design/<flow>/<file>`
 * (nested file names such as `assets/logo.png` included).
 */
export const WEB_DESIGN_APP: AppManifest = {
  id: WEB_DESIGN_APP_ID,
  path: WEB_DESIGN_APP_PATH,
  label: "Web Design",
  shortLabel: "WD",
  description: "Build UI mockups and design flows with agents",
  group: "Build",
  icon: Frame,
  iconClass: "text-purple-500",
  gradient: "from-purple-500 to-violet-600",
  views: [DESIGN_FLOWS_VIEW_ID, DESIGN_LANDING_VIEW_ID, DESIGN_EDITOR_VIEW_ID, DESIGN_PREVIEW_VIEW_ID, "chat"],
  primaryKind: DESIGN_VIEW_KIND,
  placement: { agent: "right", [DESIGN_PREVIEW_KIND]: "right" },
  layout: {
    split: "row",
    sizes: [1, 3],
    children: [
      { presenter: "single", accepts: ["navigator"], items: [DESIGN_FLOWS_VIEW_ID] },
      { presenter: "tabs", accepts: [DESIGN_VIEW_KIND], items: [DESIGN_LANDING_VIEW_ID], primary: true },
    ],
  },
};

export default {
  apps: [WEB_DESIGN_APP],
  kinds: [
    { id: DESIGN_VIEW_KIND, label: "Designs", plural: "designs" },
    { id: DESIGN_PREVIEW_KIND, label: "Design previews", plural: "design previews" },
  ],
} satisfies PluginLayoutManifest;
