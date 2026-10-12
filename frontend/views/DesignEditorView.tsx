import Editor from "@monaco-editor/react";
import EditorSaveBar from "@tokenring-ai/one-frontend/components/ui/EditorSaveBar.tsx";
import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import EmptyStateWithPrompt from "@tokenring-ai/one-frontend/components/ui/EmptyStateWithPrompt.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import SaveAsModal from "@tokenring-ai/one-frontend/components/ui/SaveAsModal.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import ViewHeader from "@tokenring-ai/one-frontend/components/ui/ViewHeader.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { useDashboardApi } from "@tokenring-ai/one-frontend/dock/DashboardApiContext.tsx";
import { setPanelBadge } from "@tokenring-ai/one-frontend/dock/panelBadges.ts";
import type { ViewPanelHandle, ViewProps } from "@tokenring-ai/one-frontend/dock/types.ts";
import { useFileUpload } from "@tokenring-ai/one-frontend/hooks/useFileUpload.ts";
import { useKeyboardShortcuts } from "@tokenring-ai/one-frontend/hooks/useKeyboardShortcuts.ts";
import { useNavigationStatePayload } from "@tokenring-ai/one-frontend/hooks/useNavigationStatePayload.ts";
import { useRemoteChangeDetection } from "@tokenring-ai/one-frontend/hooks/useRemoteChangeDetection.ts";
import { useTheme } from "@tokenring-ai/one-frontend/hooks/useTheme.ts";
import { useFlows, webDesignRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { useMonacoTheme } from "@tokenring-ai/one-frontend/theme/bridges/useMonacoTheme.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import { Download, FileCode2, FileUp, Frame, History, Paperclip, RotateCcw } from "lucide-react";
import { type ComponentProps, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DesignEditorParams } from "../app.tsx";
import HistoryPanel from "../components/HistoryPanel.tsx";
import { downloadDesign } from "../lib/downloadDesign.ts";
import { copyFileName, designBasename, designKey, editorLanguage, FILE_NAME_PATTERN, FLOW_NAME_PATTERN, WEB_DESIGN_ROOT } from "../lib/paths.ts";
import { useDesignLoad, useWebDesignNavigation } from "../lib/webDesignShared.tsx";
import {
  attachDesign,
  bumpPreviewRevision,
  refreshAttachedDesign,
  setDesignDocument,
  setDesignDraft,
  useDesignDraft,
  useRevealRequest,
  useWebDesignAgentSession,
} from "../lib/webDesignStore.ts";

type MonacoEditorInstance = Parameters<NonNullable<ComponentProps<typeof Editor>["onMount"]>>[0];

/**
 * The panel before a design is opened: browse existing flows or describe the
 * screens you need and a design agent writes mockups into a flow. The agent
 * belongs to the flows navigator, which publishes the session this prompt uses.
 */
function DesignLanding({ panel }: { panel: ViewPanelHandle<DesignEditorParams> }) {
  const flows = useFlows();
  const navigate = useNavigate();
  const { openDesign } = useWebDesignNavigation();
  const session = useWebDesignAgentSession();
  const flowCount = flows.data?.flows.length ?? 0;
  // HTML handed over from another app (Files → "Open in Web Design") lands here.
  const [imported, setImported] = useState<string | null>(null);

  useEffect(() => {
    panel.setTitle("Select a design");
  }, [panel]);

  // One-shot payload: clear the navigation state so a later visit does not re-import it.
  useNavigationStatePayload<{ fileContent?: string }>({
    onPayload: state => {
      if (state.fileContent === undefined) return;
      setImported(state.fileContent);
    },
    clearAfterConsume: true,
    navigate,
    clearNavigateTo: WEB_DESIGN_ROOT,
  });

  const handleSaveImported = useCallback(
    async (flowName: string, name: string) => {
      try {
        const { design } = await webDesignRPCClient.createDesign({ flowName, name, content: imported ?? "" });
        setImported(null);
        void flows.mutate();
        openDesign(design.flowName, design.name);
        toastManager.success("Saved", { duration: 2000 });
      } catch (e: unknown) {
        toastManager.error(formatError(e), { duration: 4000 });
      }
    },
    [flows, imported, openDesign],
  );

  const handleStartDesign = useCallback(
    async (prompt: string): Promise<boolean> => {
      if (!session) {
        toastManager.error("Open the Design flows panel to start a design agent", { duration: 5000 });
        return false;
      }
      return session.start(prompt);
    },
    [session],
  );

  return (
    <>
      {imported !== null && (
        <SaveAsModal
          title="Save File"
          containerField={{
            label: "Flow",
            placeholder: "onboarding",
            initialValue: "",
            pattern: FLOW_NAME_PATTERN,
            validationError: "Use letters, numbers, hyphens, and underscores only, starting with a letter or number.",
            options: (flows.data?.flows ?? []).map(flow => ({ value: flow.name })),
          }}
          itemField={{
            label: "File name",
            placeholder: "index.html",
            initialValue: "index.html",
            pattern: FILE_NAME_PATTERN,
            validationError: "Use letters, numbers, dots, hyphens, and underscores only; subfolders are allowed (assets/logo.png).",
            options: [],
            autoFocus: true,
            selectOnFocus: true,
          }}
          onSave={handleSaveImported}
          onClose={() => setImported(null)}
        />
      )}
      <EmptyStateWithPrompt
        icon={Frame}
        iconGradient="from-purple-500 to-violet-600"
        title="Design with agents"
        descriptionWithContent={
          <>
            Open a mockup from the <span className="font-medium text-secondary">Design Flows</span> panel to edit its HTML beside a live preview, or describe
            screens below and a design agent will write mockups into flows for you.
          </>
        }
        descriptionEmpty={
          <>
            Describe the product area and screens you need. A design agent will create a flow and save self-contained HTML mockups you can preview and refine
            here.
          </>
        }
        hasContent={flowCount > 0}
        agentRunningMessage="A design agent is running in the chat panel. Designs it writes appear in the Design Flows panel — select one to open its editor and live preview."
        hasAgent={!!session?.agentId}
        promptLabel="Design prompt"
        promptPlaceholder="e.g. Onboarding for a notes app: welcome, sign-up, empty state, first note"
        submitLabel="Start design"
        submitAriaLabel="Start design agent"
        buttonVariant="violet"
        onSubmit={handleStartDesign}
      />
    </>
  );
}

/** One design file: the code editor with save, save-as, version history and annotations. */
function DesignEditor({ flowName, designName, panel }: { flowName: string; designName: string; panel: ViewPanelHandle<DesignEditorParams> }) {
  const dashboard = useDashboardApi();
  const { openDesign } = useWebDesignNavigation();
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

  useEffect(() => {
    panel.setTitle(designBasename(designName));
  }, [designName, panel]);

  // Unsaved edits show as a dot on the tab; the draft itself survives closing the panel.
  useEffect(() => {
    setPanelBadge(panel.panelId, isDirty ? { tone: "warning", title: "Unsaved changes" } : null);
  }, [isDirty, panel.panelId]);
  useEffect(() => () => setPanelBadge(panel.panelId, null), [panel.panelId]);

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

  const handleSave = useCallback(async () => {
    if (!isReady || draft === null) return;
    setIsSaving(true);
    try {
      const { design } = await webDesignRPCClient.updateDesign({ flowName, name: designName, content: draft, encoding: document.encoding });
      setDesignDocument({
        flowName: design.flowName,
        name: design.name,
        content: design.content,
        encoding: design.encoding,
        mimeType: design.mimeType,
        updatedAt: design.updatedAt,
      });
      setDesignDraft(key, null);
      bumpPreviewRevision(key);
      // Keep an attached chip for this design in step with the saved content.
      refreshAttachedDesign(design);
      setLastSavedAt(Date.now());
      void flows.mutate();
      toastManager.success("Saved", { duration: 2000 });
    } catch (e: unknown) {
      toastManager.error(formatError(e), { duration: 4000 });
    } finally {
      setIsSaving(false);
    }
  }, [designName, document, draft, flowName, flows, isReady, key]);

  // Ctrl/⌘+S saves the design on screen.
  useKeyboardShortcuts([{ key: "s", allowInEditable: true, enabled: panel.isActive && isDirty, handler: () => void handleSave() }]);

  /** Save As writes a copy and this panel follows it, so the tab never points at stale params. */
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
        dashboard.updateViewParams(panel.panelId, { flowName: design.flowName, designName: design.name });
        void flows.mutate();
        openDesign(design.flowName, design.name);
        toastManager.success("Saved", { duration: 2000 });
      } catch (e: unknown) {
        toastManager.error(formatError(e), { duration: 4000 });
      }
    },
    [content, dashboard, document, flows, key, openDesign, panel.panelId],
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
          <button
            type="button"
            onClick={() => panel.close()}
            className="px-3 py-1.5 border border-primary text-muted hover:text-primary hover:bg-hover text-xs font-medium rounded-lg transition-colors focus-ring cursor-pointer"
          >
            Close panel
          </button>
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
        <SaveAsModal
          title="Save As"
          containerField={{
            label: "Flow",
            placeholder: "onboarding",
            initialValue: flowName,
            pattern: FLOW_NAME_PATTERN,
            validationError: "Use letters, numbers, hyphens, and underscores only, starting with a letter or number.",
            options: (flows.data?.flows ?? []).map(flow => ({ value: flow.name })),
          }}
          itemField={{
            label: "File name",
            placeholder: "index.html",
            initialValue: copyFileName(designName),
            pattern: FILE_NAME_PATTERN,
            validationError: "Use letters, numbers, dots, hyphens, and underscores only; subfolders are allowed (assets/logo.png).",
            options: [],
            autoFocus: true,
            selectOnFocus: true,
          }}
          onSave={handleSaveAs}
          onClose={() => setSaveAsOpen(false)}
        />
      )}
    </ViewShell>
  );
}

/**
 * One design file per panel. Without params the panel is the landing prompt,
 * which the next design opened from the navigator fills in place.
 */
export default function DesignEditorView({ params, panel }: ViewProps<DesignEditorParams>) {
  const { flowName, designName } = params;
  if (!flowName || !designName) return <DesignLanding panel={panel} />;
  // Keyed so a panel that follows a Save As reloads from scratch.
  return <DesignEditor key={designKey(flowName, designName)} flowName={flowName} designName={designName} panel={panel} />;
}
