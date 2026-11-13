import { useLayoutApi } from "@tokenring-ai/one-frontend/layout/context.ts";
import { useLayout, usePaneLink } from "@tokenring-ai/one-frontend/layout/hooks.ts";
import { useCallback } from "react";
import { DESIGN_EDITOR_VIEW_ID, DESIGN_PREVIEW_VIEW_ID } from "../ids.ts";
import { editorParams, previewParams } from "./designParams.ts";
import { forgetFlow, renameDesignState, renameFlowState } from "./webDesignStore.ts";

/**
 * Navigation between the Web Design views on the layout engine. Opening a
 * design navigates to its editor, whose URL the engine focuses.
 */
export function useWebDesignLayoutNavigation() {
  const api = useLayoutApi();
  const open = usePaneLink();
  const layout = useLayout();

  /** Opens (or focuses) a design's editor; the editor docks its preview when it mounts. */
  const openDesign = useCallback(
    (flowName: string, designName: string) => {
      // The landing tab has done its job once a design is open.
      open(DESIGN_EDITOR_VIEW_ID, editorParams(flowName, designName));
    },
    [open, layout],
  );

  /** Closes both panels of a design (after it is deleted); the engine moves focus to a neighbour. */
  const closeDesign = useCallback(
    (flowName: string, designName: string) => {
      layout.close(DESIGN_EDITOR_VIEW_ID, editorParams(flowName, designName));
      layout.close(DESIGN_PREVIEW_VIEW_ID, previewParams(flowName, designName));
    },
    [layout],
  );

  /** Panels showing a design of `flowName` (and, when given, that file), as [key, viewId, designName]. */
  const designPanels = useCallback(
    (flowName: string, designName?: string) =>
      Object.values(api.store.getState().panels).flatMap(panel => {
        if (panel.viewId !== DESIGN_EDITOR_VIEW_ID && panel.viewId !== DESIGN_PREVIEW_VIEW_ID) return [];
        const name = panel.viewId === DESIGN_EDITOR_VIEW_ID ? panel.params["*"] : panel.params.designName;
        if (panel.params.flowName !== flowName || name === undefined) return [];
        if (designName !== undefined && name !== designName) return [];
        return [{ key: panel.key, viewId: panel.viewId, designName: name }];
      }),
    [api],
  );

  /**
   * A panel's params are fixed, so a renamed design's panels are re-opened
   * under the new name (the one the URL showed takes the URL) and the old ones close.
   */
  const repoint = useCallback(
    (panels: ReturnType<typeof designPanels>, flowName: string, nameFor: (old: string) => string) => {
      for (const panel of panels) {
        const next = nameFor(panel.designName);
        if (panel.viewId === DESIGN_EDITOR_VIEW_ID)
          open(DESIGN_EDITOR_VIEW_ID, editorParams(flowName, next), api.activeKey === panel.key ? undefined : { focus: false });
        else open(DESIGN_PREVIEW_VIEW_ID, previewParams(flowName, next), { focus: false });
        api.close(panel.key);
      }
    },
    [api, open],
  );

  /** After a flow is deleted: closes the panels of every design in it and drops their drafts, documents and chat attachments. */
  const closeFlow = useCallback(
    (flowName: string) => {
      // The focused panel closes last: its fallback focus would otherwise land on a sibling that is about to close too.
      const panels = designPanels(flowName).sort((a, b) => Number(a.key === api.activeKey) - Number(b.key === api.activeKey));
      for (const panel of panels) api.close(panel.key);
      forgetFlow(flowName);
    },
    [api, designPanels],
  );

  /** After a design is renamed or moved: its open editor and preview follow it, unsaved edits included. */
  const renameDesign = useCallback(
    (from: { flowName: string; name: string }, to: { flowName: string; name: string }) => {
      const panels = designPanels(from.flowName, from.name);
      renameDesignState(from, to);
      repoint(panels, to.flowName, () => to.name);
    },
    [designPanels, repoint],
  );

  /** After a flow is renamed: open designs and drafts move to the new flow name. */
  const renameFlow = useCallback(
    (flowName: string, newFlowName: string) => {
      const panels = designPanels(flowName);
      renameFlowState(flowName, newFlowName);
      repoint(panels, newFlowName, name => name);
    },
    [designPanels, repoint],
  );

  /** Opens (or focuses) the chat panel for an agent without leaving the app. */
  const openAgentChat = useCallback((agentId: string) => open("chat", { agentId }, { beside: { edge: "right" } }), [open]);

  return { openDesign, closeDesign, closeFlow, renameDesign, renameFlow, openAgentChat };
}
