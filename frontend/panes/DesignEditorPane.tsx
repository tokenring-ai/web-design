import Editor from "@monaco-editor/react";
import { usePanelBadge } from "@tokenring-ai/one-frontend/apps/panelHooks.ts";
import EditorSaveBar from "@tokenring-ai/one-frontend/components/ui/EditorSaveBar.tsx";
import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import ViewHeader from "@tokenring-ai/one-frontend/components/ui/ViewHeader.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { useConfirmDialog } from "@tokenring-ai/one-frontend/hooks/useConfirmDialog.tsx";
import { useFileUpload } from "@tokenring-ai/one-frontend/hooks/useFileUpload.ts";
import { useKeyboardShortcuts } from "@tokenring-ai/one-frontend/hooks/useKeyboardShortcuts.ts";
import { useRemoteChangeDetection } from "@tokenring-ai/one-frontend/hooks/useRemoteChangeDetection.ts";
import { useTheme } from "@tokenring-ai/one-frontend/hooks/useTheme.ts";
import type { ViewProps } from "@tokenring-ai/one-frontend/layout/define.ts";
import { useLayout, usePanel } from "@tokenring-ai/one-frontend/layout/hooks.ts";
import { useFlows, webDesignRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { useMonacoTheme } from "@tokenring-ai/one-frontend/theme/bridges/useMonacoTheme.ts";
import { Button } from "@tokenring-ai/one-frontend/ui";
import formatError from "@tokenring-ai/utility/error/formatError";
import { Download, FileCode2, FileUp, History, Paperclip, RotateCcw } from "lucide-react";
import { type ComponentProps, useCallback, useEffect, useRef, useState } from "react";
import DesignSaveAsModal from "../components/DesignSaveAsModal.tsx";
import HistoryPanel from "../components/HistoryPanel.tsx";
import { DESIGN_EDITOR_VIEW_ID, DESIGN_PREVIEW_VIEW_ID } from "../ids.ts";
import { useDesignLoad } from "../lib/designData.ts";
import { editorParams, previewParams } from "../lib/designParams.ts";
import { downloadDesign } from "../lib/downloadDesign.ts";
import { copyFileName, designKey, editorLanguage } from "../lib/paths.ts";
import { useWebDesignLayoutNavigation } from "../lib/useWebDesignLayoutNavigation.ts";
import {
  attachDesign,
  bumpPreviewRevision,
  getDesignDraft,
  refreshAttachedDesign,
  setDesignDocument,
  setDesignDraft,
  useDesignDraft,
  useRevealRequest,
} from "../lib/webDesignStore.ts";

type MonacoEditorInstance = Parameters<NonNullable<ComponentProps<typeof Editor>["onMount"]>>[0];

/** One design file: the code editor with save, save-as, version history and annotations. */
function DesignEditor({ flowName, designName }: { flowName: string; designName: string }) {
  const panel = usePanel();
  const layout = useLayout();
  const { openDesign } = useWebDesignLayoutNavigation();
  const [theme] = useTheme();
  const monacoTheme = useMonacoTheme();
  const flows = useFlows();

  const key = designKey(flowName, designName);
  const { document, error, reload } = useDesignLoad(flowName, designName);
  const draft = useDesignDraft(key);
  const [isSaving, setIsSaving] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(0);
  const monacoRef = useRef<MonacoEditorInstance | null>(null);

  const content = draft ?? document?.content ?? "";
  const isReady = document !== null;
  const isDirty = isReady && draft !== null && draft !== document.content;
  const isTextFile = document?.encoding !== "base64";

  // A design opened by URL, row click or rename gets its live preview docked beside the editors (one shared column, the new preview in front).
  // A preview that is already open is left where the user put it.
  useEffect(() => {
    if (!layout.has(DESIGN_PREVIEW_VIEW_ID, previewParams(flowName, designName))) layout.open(DESIGN_PREVIEW_VIEW_ID, previewParams(flowName, designName));
  }, [flowName, designName]);

  // Unsaved edits show as a dot on the tab; the draft itself survives closing the panel.
  usePanelBadge(isDirty ? { tone: "warning", label: "Unsaved changes" } : null);

  // An agent (or another client) rewriting the open design pulls in silently,
  // unless the user has local edits that would be clobbered.
  const { markLoaded } = useRemoteChangeDetection({
    documentKey: key,
    isDocumentReady: isReady,
    isDirty,
    strategy: {
      type: "polling",
      poll: async () => {
        const { design } = await webDesignRPCClient.getDesign({ flowName, name: designName });
        return design ? { updatedAt: design.updatedAt } : null;
      },
      intervalMs: 3000,
    },
    onRemoteChange: async () => {
      await reload({ silent: true });
      bumpPreviewRevision(key);
    },
  });
  useEffect(() => {
    markLoaded(document?.updatedAt ?? null);
  }, [document?.updatedAt, markLoaded]);

  // The preview's annotation pins ask this editor to scroll to the comment they anchor.
  const reveal = useRevealRequest(key);
  useEffect(() => {
    if (!reveal) return;
    const editor = monacoRef.current;
    if (!editor) return;
    editor.revealLineInCenter(reveal.line);
    editor.setPosition({ lineNumber: reveal.line, column: 1 });
    editor.createDecorationsCollection([
      {
        range: { startLineNumber: reveal.line, startColumn: 1, endLineNumber: reveal.line, endColumn: 1 },
        options: { isWholeLine: true, className: "webdesign-annotation-highlight", zIndex: 10 },
      },
    ]);
    editor.focus();
  }, [reveal]);

  const { openConfirm, Dialog: ConfirmDialog } = useConfirmDialog();
  const savingRef = useRef(false);

  // A draft that matches the saved text is no edit: drop it, or it would hide an agent's later changes.
  useEffect(() => {
    if (document && draft !== null && draft === document.content) setDesignDraft(key, null);
  }, [document, draft, key]);

  const handleSave = useCallback(async () => {
    // One save at a time: Ctrl+S during a save would send it twice.
    if (!isReady || draft === null || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    const sent = draft;
    try {
      // Unsaved edits hold back the silent reload, so an agent may have changed the design since it
      // was loaded. Saving would overwrite that change: ask first.
      const { design: current } = await webDesignRPCClient.getDesign({ flowName, name: designName });
      if (current && current.updatedAt !== document.updatedAt) {
        const overwrite = await openConfirm({
          id: "web-design-overwrite-newer",
          title: "This design changed since you opened it",
          message: "An agent or another window saved a newer version. Saving now replaces it with your edits. Use History to see the other version.",
          confirmText: "Save mine anyway",
          cancelText: "Cancel",
          variant: "danger",
          dontAskAgain: false,
        });
        if (!overwrite) return;
      }
      const { design } = await webDesignRPCClient.updateDesign({ flowName, name: designName, content: sent, encoding: document.encoding });
      setDesignDocument({
        flowName: design.flowName,
        name: design.name,
        content: design.content,
        encoding: design.encoding,
        mimeType: design.mimeType,
        updatedAt: design.updatedAt,
      });
      // Text typed while the save was in flight is still unsaved: keep it.
      if (getDesignDraft(key) === sent) setDesignDraft(key, null);
      bumpPreviewRevision(key);
      // Keep an attached chip for this design in step with the saved content.
      refreshAttachedDesign(design);
      setLastSavedAt(Date.now());
      void flows.mutate();
      toastManager.success("Saved", { duration: 2000 });
    } catch (e: unknown) {
      toastManager.error(formatError(e), { duration: 4000 });
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [designName, document, draft, flowName, flows, isReady, key, openConfirm]);

  // Ctrl/⌘+S saves the design on screen.
  useKeyboardShortcuts([{ key: "s", allowInEditable: true, enabled: panel.isActive && isDirty, handler: () => void handleSave() }]);

  /** Save As writes a copy, which opens in its own tab (a panel's params never change). */
  const handleSaveAs = useCallback(
    async (nextFlow: string, nextName: string) => {
      try {
        const { design } = await webDesignRPCClient.createDesign({ flowName: nextFlow, name: nextName, content, encoding: document?.encoding ?? "utf8" });
        setDesignDocument({
          flowName: design.flowName,
          name: design.name,
          content: design.content,
          encoding: design.encoding,
          mimeType: design.mimeType,
          updatedAt: design.updatedAt,
        });
        setDesignDraft(key, null);
        setSaveAsOpen(false);
        void flows.mutate();
        // A panel's params are fixed: the copy opens in its own tab and this one closes.
        openDesign(design.flowName, design.name);
        layout.close(DESIGN_EDITOR_VIEW_ID, editorParams(flowName, designName));
        toastManager.success("Saved", { duration: 2000 });
      } catch (e: unknown) {
        toastManager.error(formatError(e), { duration: 4000 });
      }
    },
    [content, designName, document, flowName, flows, key, layout, openDesign],
  );

  // Binary assets cannot be edited here; they are replaced by uploading a file over them.
  const replaceUpload = useFileUpload({
    encoding: "base64",
    uploadFile: async ({ content: uploaded, encoding }) => {
      const { design } = await webDesignRPCClient.updateDesign({ flowName, name: designName, content: uploaded, encoding });
      setDesignDocument({
        flowName: design.flowName,
        name: design.name,
        content: design.content,
        encoding: design.encoding,
        mimeType: design.mimeType,
        updatedAt: design.updatedAt,
      });
      bumpPreviewRevision(key);
      refreshAttachedDesign(design);
    },
    onSkip: ({ fileName, detail }) => toastManager.error(detail ?? `"${fileName}" was skipped`, { duration: 5000 }),
    onError: ({ error: uploadError }) => toastManager.error(formatError(uploadError), { duration: 5000 }),
    onComplete: ({ uploaded }) => {
      if (uploaded === 0) return;
      void flows.mutate();
      toastManager.success("File replaced", { duration: 2000 });
    },
  });

  /** Downloads what is on screen, unsaved edits included (as Attach does). */
  const handleDownload = useCallback(() => {
    if (!document) return;
    downloadDesign({ name: designName, content, encoding: document.encoding, mimeType: document.mimeType });
  }, [content, designName, document]);

  const handleAttach = useCallback(() => {
    if (!document) return;
    // Snapshot what is on screen, so unsaved edits go to the agent too.
    attachDesign({ ...document, content }, { announce: true });
  }, [content, document]);

  let body: React.ReactNode;
  if (isReady) {
    body = isTextFile ? (
      <Editor
        height="100%"
        language={editorLanguage(designName)}
        value={content}
        onChange={value => setDesignDraft(key, value ?? "")}
        beforeMount={monacoTheme.beforeMount}
        theme={monacoTheme.theme}
        onMount={editor => {
          monacoRef.current = editor;
        }}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: "on",
          padding: { top: 8 },
        }}
      />
    ) : (
      <>
        <input ref={replaceUpload.inputRef} type="file" className="hidden" aria-label="Replacement file" onChange={e => void replaceUpload.onChange(e)} />
        <EmptyState
          variant="page"
          icon={FileCode2}
          title="Binary asset"
          hint={`${document.mimeType} files can't be edited here. Preview it, download it, or replace it with another file.`}
          ctaLabel={replaceUpload.isUploading ? "Replacing…" : "Replace file…"}
          ctaIcon={FileUp}
          onCta={replaceUpload.trigger}
        />
      </>
    );
  } else if (error) {
    body = (
      <EmptyState
        variant="page"
        className="h-full"
        icon={FileCode2}
        title="Design not found"
        hint={error}
        ctaLabel="Retry"
        ctaIcon={RotateCcw}
        onCta={() => void reload()}
        action={
          <Button variant="secondary" onClick={() => panel.close()}>
            Close panel
          </Button>
        }
      />
    );
  } else {
    body = <LoadingState message={`Loading ${flowName} / ${designName}…`} className="h-full" />;
  }

  return (
    <ViewShell
      scroll={false}
      header={
        <ViewHeader
          variant="navigator"
          title={
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="flex-1 min-w-0 truncate text-xs text-muted font-mono" title={`${flowName} / ${designName}`}>
                {flowName} / {designName}
              </span>
              {isReady && (
                <>
                  <EditorSaveBar
                    isDirty={isDirty}
                    isSaving={isSaving}
                    hasItem
                    onSave={handleSave}
                    onSaveAs={isTextFile ? () => setSaveAsOpen(true) : undefined}
                    disabled={!isTextFile}
                    {...(isTextFile ? {} : { saveTooltip: "Binary files can't be edited here — use Replace file instead" })}
                  />
                  {!isTextFile && (
                    <span
                      className="text-xs text-muted shrink-0"
                      title="Binary files can't be edited or copied with Save As. Download it, or replace it with another file."
                    >
                      Read-only binary
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleDownload}
                    title="Download this file"
                    aria-label="Download this file"
                    className="p-1.5 text-muted hover:text-primary hover:bg-hover rounded-lg transition-colors focus-ring shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleAttach}
                    title="Attach this design to the agent chat"
                    aria-label="Attach this design to the agent chat"
                    className="p-1.5 text-muted hover:text-primary hover:bg-hover rounded-lg transition-colors focus-ring shrink-0 cursor-pointer"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </button>
                  {isTextFile && (
                    <button
                      type="button"
                      onClick={() => setHistoryOpen(previous => !previous)}
                      title="Version history"
                      aria-label="Version history"
                      aria-pressed={historyOpen}
                      className={`p-1.5 rounded-lg transition-colors focus-ring shrink-0 cursor-pointer ${
                        historyOpen ? "bg-accent-muted text-accent" : "text-muted hover:text-primary hover:bg-hover"
                      }`}
                    >
                      <History className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          }
        />
      }
    >
      <div className="flex-1 min-h-0 relative">
        {body}
        {historyOpen && isReady && (
          <HistoryPanel
            flowName={flowName}
            designName={designName}
            currentContent={content}
            language={editorLanguage(designName)}
            theme={theme}
            lastSavedAt={lastSavedAt}
            onRestore={restored => {
              // Snapshots land as unsaved edits, so nothing on disk changes until saved.
              setDesignDraft(key, restored);
              bumpPreviewRevision(key);
            }}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </div>

      {saveAsOpen && (
        <DesignSaveAsModal
          title="Save As"
          flowNames={(flows.data?.flows ?? []).map(flow => flow.name)}
          initialFlow={flowName}
          initialName={copyFileName(designName)}
          onSave={handleSaveAs}
          onClose={() => setSaveAsOpen(false)}
        />
      )}
      <ConfirmDialog />
    </ViewShell>
  );
}

/** One design file per panel; the route's splat param is the file name. */
export default function DesignEditorPane({ params }: ViewProps) {
  const flowName = params.flowName ?? "";
  const designName = params["*"] ?? "";
  return <DesignEditor flowName={flowName} designName={designName} />;
}
