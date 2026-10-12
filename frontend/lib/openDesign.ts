import { openInMainArea } from "@tokenring-ai/one-frontend/dock/layout/mainArea.ts";
import { setPanelBadge } from "@tokenring-ai/one-frontend/dock/panelBadges.ts";
import type { DashboardApi } from "@tokenring-ai/one-frontend/dock/types.ts";
import { DESIGN_EDITOR_VIEW, DESIGN_PREVIEW_VIEW, WEB_DESIGN_SIDEBAR_VIEWS } from "../manifest.ts";

/**
 * Opens a design: its editor in the main area (filling the landing panel when
 * one is open) and its live preview beside it. The first preview docks to the
 * right of the editor; later ones join that preview's group as tabs, so N open
 * designs share one preview column instead of splitting off N of them. A
 * preview that is already open is left where the user put it, and neither call
 * adds a second panel for a design that is open already.
 *
 * Shared by the dashboard's `onNavigate` and the navigator, so a row click and
 * a deep link land the same pair of panels.
 */
export function openDesignPanels(api: DashboardApi, flowName: string, designName: string): string {
  const params = { flowName, designName };
  const editorPanelId = openInMainArea(api, DESIGN_EDITOR_VIEW, params, { sidebarViews: WEB_DESIGN_SIDEBAR_VIEWS, fillPlaceholder: true });
  if (!api.hasView(DESIGN_PREVIEW_VIEW, params)) {
    const previewGroupPanel = api.listPanels().find(panel => panel.viewId === DESIGN_PREVIEW_VIEW);
    if (previewGroupPanel) {
      // Shown in front of the other designs' previews (a background tab would
      // leave the old design on screen), then the editor takes focus back.
      api.openView(DESIGN_PREVIEW_VIEW, params, { position: "tab", referencePanelId: previewGroupPanel.panelId });
      api.focusView(editorPanelId);
    } else {
      api.openView(DESIGN_PREVIEW_VIEW, params, { position: "right", referencePanelId: editorPanelId, focus: false });
    }
  }
  return editorPanelId;
}

/** Closes both panels of a design (after it is deleted or renamed away). */
export function closeDesignPanels(api: DashboardApi, flowName: string, designName: string): void {
  const params = { flowName, designName };
  for (const viewId of [DESIGN_EDITOR_VIEW, DESIGN_PREVIEW_VIEW]) {
    const panelId = api.hasView(viewId, params);
    if (panelId) {
      api.closeView(panelId);
      setPanelBadge(panelId, null);
    }
  }
}

/** Closes the editor and preview panels of every design in a flow (after the flow is deleted). */
export function closeFlowPanels(api: DashboardApi, flowName: string): void {
  for (const panel of api.listPanels()) {
    if ((panel.viewId !== DESIGN_EDITOR_VIEW && panel.viewId !== DESIGN_PREVIEW_VIEW) || panel.params.flowName !== flowName) continue;
    api.closeView(panel.panelId);
    setPanelBadge(panel.panelId, null);
  }
}

/**
 * Points the open editor and preview of a renamed design at its new name, in
 * place, so the panels keep their position. A panel whose params cannot be
 * updated is closed instead. Returns whether any panel showed the design.
 */
export function renameDesignPanels(api: DashboardApi, from: { flowName: string; name: string }, to: { flowName: string; name: string }): boolean {
  let found = false;
  for (const panel of api.listPanels()) {
    if (panel.viewId !== DESIGN_EDITOR_VIEW && panel.viewId !== DESIGN_PREVIEW_VIEW) continue;
    if (panel.params.flowName !== from.flowName || panel.params.designName !== from.name) continue;
    found = true;
    setPanelBadge(panel.panelId, null);
    if (!api.updateViewParams(panel.panelId, { flowName: to.flowName, designName: to.name })) api.closeView(panel.panelId);
  }
  return found;
}

/** Re-points every open editor and preview of a renamed flow at the new flow name. */
export function renameFlowPanels(api: DashboardApi, flowName: string, newFlowName: string): void {
  for (const panel of api.listPanels()) {
    if ((panel.viewId !== DESIGN_EDITOR_VIEW && panel.viewId !== DESIGN_PREVIEW_VIEW) || panel.params.flowName !== flowName) continue;
    setPanelBadge(panel.panelId, null);
    if (!api.updateViewParams(panel.panelId, { ...panel.params, flowName: newFlowName })) api.closeView(panel.panelId);
  }
}
