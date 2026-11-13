import { useWebDesignConfiguration } from "@tokenring-ai/one-frontend/rpc.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_WEB_DESIGN_FS_PROVIDER, DEFAULT_WEB_DESIGN_SERVE_DIRECTORY, designKey } from "./paths.ts";
import { type DesignDocument, loadDesign, useDesignDocument } from "./webDesignStore.ts";

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
