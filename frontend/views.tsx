import { defineView } from "@tokenring-ai/one-frontend/layout/define.ts";
import type { PluginLayoutViews } from "@tokenring-ai/one-frontend/plugins/layoutTypes.ts";
import { Code2, Frame, Monitor } from "lucide-react";
import { lazy } from "react";
import { DESIGN_EDITOR_VIEW_ID, DESIGN_FLOWS_VIEW_ID, DESIGN_LANDING_VIEW_ID, DESIGN_PREVIEW_KIND, DESIGN_PREVIEW_VIEW_ID, DESIGN_VIEW_KIND } from "./ids.ts";
import { editorInstanceKey, previewInstanceKey } from "./lib/designParams.ts";
import { designBasename } from "./lib/paths.ts";

const DesignFlowsPane = lazy(() => import("./panes/DesignFlowsPane.tsx"));
const DesignLandingPane = lazy(() => import("./panes/DesignLandingPane.tsx"));
const DesignEditorPane = lazy(() => import("./panes/DesignEditorPane.tsx"));
const DesignPreviewPane = lazy(() => import("./panes/DesignPreviewPane.tsx"));

export default {
  views: [
    // Navigator: design flows, the files inside them and the attached design agent.
    defineView({
      id: DESIGN_FLOWS_VIEW_ID,
      kind: "navigator",
      title: "Design flows",
      description: "Design flows and the mockup files inside them",
      icon: Frame,
      closable: false,
      component: DesignFlowsPane,
    }),
    // `/web-design` (or `/web-design/<flow>`, which expands the flow): the "Design with agents" landing tab; closes once a design is opened.
    defineView({
      id: DESIGN_LANDING_VIEW_ID,
      landing: true,
      kind: DESIGN_VIEW_KIND,
      title: "Select a design",
      description: "Describe screens for a design agent, or pick a design from the flows",
      icon: Frame,
      route: ":flowName?",
      instanceKey: () => "",
      component: DesignLandingPane,
    }),
    // `/web-design/<flow>/<file...>`: the file name is the splat, so nested names ("assets/logo.png") work.
    defineView({
      id: DESIGN_EDITOR_VIEW_ID,
      kind: DESIGN_VIEW_KIND,
      title: params => designBasename(params["*"] ?? "") || "Design",
      description: "Edit the HTML of one design file",
      icon: Code2,
      route: ":flowName/*",
      instanceKey: editorInstanceKey,
      component: DesignEditorPane,
    }),
    // One live preview per design, opened alongside its editor (no URL of its own).
    defineView({
      id: DESIGN_PREVIEW_VIEW_ID,
      kind: DESIGN_PREVIEW_KIND,
      title: params => `${designBasename(params.designName ?? "")} preview`,
      description: "Live preview of one design file",
      icon: Monitor,
      instanceKey: previewInstanceKey,
      component: DesignPreviewPane,
    }),
  ],
} satisfies PluginLayoutViews;
