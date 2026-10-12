import { DiffEditor } from "@monaco-editor/react";
import SectionLabel from "@tokenring-ai/one-frontend/components/ui/SectionLabel.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import { useDesignHistory, webDesignRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { defineMonacoThemes, monacoThemeName } from "@tokenring-ai/one-frontend/theme/bridges/monaco.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import { Columns2, History, Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Slide-out timeline of saved snapshots for one design file. Versions load into
 * the editor as unsaved drafts on restore, so nothing on disk changes until saved.
 */
export default function HistoryPanel({
  flowName,
  designName,
  currentContent,
  language,
  theme,
  lastSavedAt,
  onRestore,
  onClose,
}: {
  flowName: string;
  designName: string;
  currentContent: string;
  language: string;
  theme: string;
  /** Bumped by the parent after each save so the timeline refetches while open. */
  lastSavedAt?: number;
  onRestore: (content: string) => void;
  onClose: () => void;
}) {
  const { data, isLoading, error, mutate } = useDesignHistory(flowName, designName);
  const versions = data?.versions ?? [];
  const [comparingId, setComparingId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<{ original: string } | null>(null);

  useEffect(() => {
    void mutate();
  }, [mutate, lastSavedAt]);

  const openCompare = async (versionId: string) => {
    if (comparingId === versionId) {
      setComparingId(null);
      setComparison(null);
      return;
    }
    try {
      const { version } = await webDesignRPCClient.getDesignVersion({ flowName, name: designName, versionId });
      if (!version) {
        toastManager.error("Snapshot content is no longer available", { duration: 4000 });
        return;
      }
      setComparingId(versionId);
      setComparison({ original: version.content });
    } catch (e: unknown) {
      toastManager.error(formatError(e), { duration: 4000 });
    }
  };

  const restore = async (versionId: string) => {
    try {
      const { version } = await webDesignRPCClient.getDesignVersion({ flowName, name: designName, versionId });
      if (!version) {
        toastManager.error("Snapshot content is no longer available", { duration: 4000 });
        return;
      }
      onRestore(version.content);
      toastManager.success("Version loaded as unsaved draft", { duration: 2500 });
    } catch (e: unknown) {
      toastManager.error(formatError(e), { duration: 4000 });
    }
  };

  return (
    <div
      className="absolute inset-y-0 right-0 z-20 w-80 max-w-full flex flex-col bg-primary border-l border-primary shadow-card"
      role="region"
      aria-label="Version history"
    >
      <div className="shrink-0 px-3 py-2 border-b border-primary flex items-center gap-2">
        <History className="w-3.5 h-3.5 text-muted" />
        <SectionLabel className="flex-1 min-w-0 truncate">History — {designName}</SectionLabel>
        <button
          type="button"
          onClick={onClose}
          title="Close history"
          aria-label="Close history"
          className="p-1 text-muted hover:text-primary rounded transition-colors cursor-pointer focus-ring"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {comparingId && comparison ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="shrink-0 px-3 py-1.5 border-b border-primary flex items-center gap-2">
            <Columns2 className="w-3.5 h-3.5 text-muted" />
            <span className="text-xs text-muted flex-1 min-w-0 truncate">{comparingId} vs current</span>
            <button
              type="button"
              onClick={() => {
                setComparingId(null);
                setComparison(null);
              }}
              className="px-2 py-0.5 text-xs border border-primary text-muted hover:text-primary hover:bg-hover rounded-lg transition-colors cursor-pointer focus-ring"
            >
              Back
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <DiffEditor
              height="100%"
              original={comparison.original}
              modified={currentContent}
              language={language}
              beforeMount={defineMonacoThemes}
              theme={monacoThemeName(theme === "dark" ? "dark" : "light")}
              options={{
                readOnly: true,
                renderSideBySide: true,
                minimap: { enabled: false },
                fontSize: 12,
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-4 text-xs text-muted flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading history…
            </div>
          ) : error ? (
            <p className="px-3 py-4 text-xs text-error">{formatError(error)}</p>
          ) : versions.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted text-center">No snapshots yet. Overwriting this file creates one automatically.</p>
          ) : (
            <ol className="py-1">
              {versions.map((version, index) => (
                <li key={version.id} className="relative pl-6 pr-2 py-2 border-b border-primary/40">
                  {index < versions.length - 1 && <span className="absolute left-3 top-6 bottom-0 w-px bg-primary/40" aria-hidden="true" />}
                  <span className="absolute left-2 top-3.5 w-2 h-2 rounded-full bg-accent" aria-hidden="true" />
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-mono font-semibold text-primary truncate">{version.id}</span>
                    <span className="text-xs text-muted shrink-0">· {version.size.toLocaleString()} bytes</span>
                  </div>
                  <div className="text-xs text-muted mt-0.5">{formatTimestamp(version.createdAt)}</div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <button
                      type="button"
                      onClick={() => void openCompare(version.id)}
                      className="px-2 py-0.5 text-xs border border-primary text-muted hover:text-primary hover:bg-hover rounded-lg transition-colors cursor-pointer focus-ring"
                      aria-label={`Compare ${version.id} with current`}
                    >
                      Compare
                    </button>
                    <button
                      type="button"
                      onClick={() => void restore(version.id)}
                      className="flex items-center gap-1 px-2 py-0.5 text-xs bg-accent-muted hover:bg-accent-muted-hover text-accent rounded-lg transition-colors cursor-pointer focus-ring"
                      aria-label={`Restore ${version.id}`}
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restore
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
