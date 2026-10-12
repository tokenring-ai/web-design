import type { PluginFrontendContribution } from "@tokenring-ai/one-frontend/plugins/types.ts";
import { lazy } from "react";
import { z } from "zod";
import { openDesignPanels } from "./lib/openDesign.ts";
import { designBasename, designKey, designNameFromRouteParams, designPath, WEB_DESIGN_ROOT } from "./lib/paths.ts";
import manifest, { DESIGN_EDITOR_VIEW, DESIGN_PREVIEW_VIEW, designEditorViewManifest, designFlowsViewManifest, designPreviewViewManifest } from "./manifest.ts";

/** Both params are omitted for the landing panel the next opened design fills. */
export const DesignEditorParams = z.object({
  flowName: z.string().min(1).optional(),
  designName: z.string().min(1).optional(),
});
export type DesignEditorParams = z.infer<typeof DesignEditorParams>;

/** A preview always belongs to a design; there is no parameter-less preview. */
export const DesignPreviewParams = z.object({
  flowName: z.string().min(1),
  designName: z.string().min(1),
});
export type DesignPreviewParams = z.infer<typeof DesignPreviewParams>;

function editorInstanceKey(params: DesignEditorParams): string {
  return params.flowName && params.designName ? designKey(params.flowName, params.designName) : "new";
}

/**
 * The Web Design dashboard: a flow tree beside one editor panel per open
 * design, with that design's live preview docked to its right.
 * `/web-design/<flow>/<file>` opens (or focuses) a design; the active panel
 * keeps the URL in step. Discovered by `frontend/src/plugins/registry.ts`.
 */
export default {
  ...manifest,
  views: [
    { ...designFlowsViewManifest, component: lazy(() => import("./views/DesignFlowsView.tsx")) },
    {
      ...designEditorViewManifest,
      params: DesignEditorParams,
      instanceKey: editorInstanceKey,
      titleFor: params => (params.designName ? designBasename(params.designName) : "Select a design"),
      component: lazy(() => import("./views/DesignEditorView.tsx")),
    },
    {
      ...designPreviewViewManifest,
      params: DesignPreviewParams,
      instanceKey: params => designKey(params.flowName, params.designName),
      titleFor: params => `${designBasename(params.designName)} preview`,
      component: lazy(() => import("./views/DesignPreviewView.tsx")),
    },
  ],
  dashboards: [
    {
      ...manifest,
      routePath: "/web-design/:flowName?/:designName*",
      extraRoutePaths: ["/web-design", "/web-design/:flowName?"],
      defaultLayout: {
        kind: "row",
        sizes: [1, 3],
        children: [
          { kind: "panel", view: designFlowsViewManifest.id },
          { kind: "panel", view: designEditorViewManifest.id },
        ],
      },
      onNavigate({ params }, api) {
        const designName = designNameFromRouteParams(params);
        // A flow on its own only expands the tree; design files are what open panels.
        if (!params.flowName || !designName) return;
        openDesignPanels(api, params.flowName, designName);
      },
      pathForActivePanel(panel) {
        if (panel?.viewId !== DESIGN_EDITOR_VIEW && panel?.viewId !== DESIGN_PREVIEW_VIEW) return null;
        const { flowName, designName } = panel.params;
        if (typeof flowName !== "string" || typeof designName !== "string") return WEB_DESIGN_ROOT;
        return designPath(flowName, designName);
      },
      documentTitle: ({ params }) => {
        const designName = designNameFromRouteParams(params);
        return designName ? `${designBasename(designName)} · Web Design` : "Web Design";
      },
    },
  ],
} satisfies PluginFrontendContribution;
