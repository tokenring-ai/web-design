import { useDashboardApi } from "@tokenring-ai/one-frontend/dock/DashboardApiContext.tsx";
import { useWebDesignConfiguration } from "@tokenring-ai/one-frontend/rpc.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { WEB_DESIGN_DASHBOARD_ID } from "../manifest.ts";
import { closeDesignPanels, closeFlowPanels, openDesignPanels, renameDesignPanels, renameFlowPanels } from "./openDesign.ts";
import { DEFAULT_WEB_DESIGN_FS_PROVIDER, DEFAULT_WEB_DESIGN_SERVE_DIRECTORY, designKey, designPath, WEB_DESIGN_ROOT } from "./paths.ts";
import { type DesignDocument, forgetFlow, loadDesign, renameDesignState, renameFlowState, useDesignDocument } from "./webDesignStore.ts";

/**
 * Navigation between the Web Design views. Opening a design lands its editor
 * in the main area and its preview beside it right away (so panels the user
 * closed re-open even when the URL does not change) and then updates the URL.
 * On another dashboard it only navigates, which lands the user here.
 */
export function useWebDesignNavigation() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dashboard = useDashboardApi();
  const onDashboard = dashboard.dashboardId === WEB_DESIGN_DASHBOARD_ID;

  const openDesign = useCallback(
    (flowName: string, designName: string, options?: { replace?: boolean }) => {
      if (onDashboard) openDesignPanels(dashboard, flowName, designName);
      void navigate(designPath(flowName, designName), options?.replace ? { replace: true } : undefined);
    },
    [dashboard, navigate, onDashboard],
  );

  /** Closes a design's panels after it is deleted, and leaves its URL if we are on it. */
  const closeDesign = useCallback(
    (flowName: string, designName: string) => {
      if (onDashboard) closeDesignPanels(dashboard, flowName, designName);
      if (pathname === designPath(flowName, designName)) void navigate(WEB_DESIGN_ROOT);
    },
    [dashboard, navigate, onDashboard, pathname],
  );

  /**
   * After a flow is deleted: closes the editor and preview of every design in
   * it (not just the one in the URL), drops their drafts, cached documents and
   * chat attachments, and leaves the URL if it points into the flow.
   */
  const closeFlow = useCallback(
    (flowName: string) => {
      if (onDashboard) closeFlowPanels(dashboard, flowName);
      forgetFlow(flowName);
      if (pathname.startsWith(`${WEB_DESIGN_ROOT}/${encodeURIComponent(flowName)}/`)) void navigate(WEB_DESIGN_ROOT);
    },
    [dashboard, navigate, onDashboard, pathname],
  );

  /**
   * After a design is renamed or moved: its open editor and preview follow it
   * (unsaved edits included) and the URL follows when it pointed at the old name.
   */
  const renameDesign = useCallback(
    (from: { flowName: string; name: string }, to: { flowName: string; name: string }) => {
      if (onDashboard) renameDesignPanels(dashboard, from, to);
      renameDesignState(from, to);
      if (pathname === designPath(from.flowName, from.name)) void navigate(designPath(to.flowName, to.name), { replace: true });
    },
    [dashboard, navigate, onDashboard, pathname],
  );

  /** After a flow is renamed: open designs, drafts and the URL move to the new flow name. */
  const renameFlow = useCallback(
    (flowName: string, newFlowName: string) => {
      if (onDashboard) renameFlowPanels(dashboard, flowName, newFlowName);
      renameFlowState(flowName, newFlowName);
      const prefix = `${WEB_DESIGN_ROOT}/${encodeURIComponent(flowName)}/`;
      if (pathname.startsWith(prefix)) {
        void navigate(`${WEB_DESIGN_ROOT}/${encodeURIComponent(newFlowName)}/${pathname.slice(prefix.length)}`, { replace: true });
      }
    },
    [dashboard, navigate, onDashboard, pathname],
  );

  /** Opens (or focuses) the chat panel for an agent without leaving the dashboard. */
  const openAgentChat = useCallback(
    (agentId: string) => {
      if (onDashboard) dashboard.openView("chat", { agentId }, { position: "right" });
      else void navigate(`/agent/${agentId}`);
    },
    [dashboard, navigate, onDashboard],
  );

  return { openDesign, closeDesign, closeFlow, renameDesign, renameFlow, openAgentChat, onDashboard };
}

/** Where design files are served from, with the service defaults while the RPC loads. */
export function useWebDesignHosting() {
  const configuration = useWebDesignConfiguration();
  return {
    serveDirectory: configuration.data?.serveDirectory ?? DEFAULT_WEB_DESIGN_SERVE_DIRECTORY,
    fsProvider: configuration.data?.fsProvider ?? DEFAULT_WEB_DESIGN_FS_PROVIDER,
    agentTypes: configuration.data?.agentTypes ?? ["web-design"],
  };
}

export interface DesignLoad {
  document: DesignDocument | null;
  error: string | null;
  isLoading: boolean;
  reload: (options?: { silent?: boolean }) => Promise<void>;
}

/**
 * Loads one design into the shared store. The editor and preview panels of a
 * design both call this; the store dedupes the request so they share one fetch.
 */
export function useDesignLoad(flowName: string, designName: string): DesignLoad {
  const key = designKey(flowName, designName);
  const document = useDesignDocument(key);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(document === null);

  const reload = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setError(null);
        setIsLoading(true);
      }
      try {
        const loaded = await loadDesign(flowName, designName, { force: true });
        if (!loaded && !options?.silent) setError(`File "${designName}" not found in flow "${flowName}"`);
      } catch (e: unknown) {
        if (!options?.silent) setError(formatError(e));
      } finally {
        if (!options?.silent) setIsLoading(false);
      }
    },
    [designName, flowName],
  );

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setIsLoading(true);
    loadDesign(flowName, designName)
      .then(loaded => {
        if (cancelled) return;
        if (!loaded) setError(`File "${designName}" not found in flow "${flowName}"`);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(formatError(e));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [designName, flowName]);

  return { document, error, isLoading, reload };
}
