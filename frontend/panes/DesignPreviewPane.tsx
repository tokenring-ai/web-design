import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import ViewHeader from "@tokenring-ai/one-frontend/components/ui/ViewHeader.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { useDebounce } from "@tokenring-ai/one-frontend/hooks/useDebounce.ts";
import { useLocalStorageState } from "@tokenring-ai/one-frontend/hooks/useLocalStorageState.ts";
import { useRefSync } from "@tokenring-ai/one-frontend/hooks/useRefSync.ts";
import type { ViewProps } from "@tokenring-ai/one-frontend/layout/define.ts";
import { usePanel } from "@tokenring-ai/one-frontend/layout/hooks.ts";
import { useDesigns, webDesignRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { Button, Checkbox, TextArea } from "@tokenring-ai/one-frontend/ui";
import formatError from "@tokenring-ai/utility/error/formatError";
import { Camera, ExternalLink, ImageDown, Loader2, Monitor, PenLine, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnnotationList, AnnotationPins } from "../components/AnnotationOverlay.tsx";
import DeviceToolbar, { effectivePreviewWidth, useDeviceSelection } from "../components/DeviceToolbar.tsx";
import { BRIDGE_ANNOTATE, BRIDGE_PICK, BRIDGE_RECTS, BRIDGE_TRACK, type BridgeRect, buildAnnotationBridgeScript } from "../lib/annotationBridge.ts";
import {
  appendAnnotationReply,
  type DesignAnnotation,
  deleteAnnotation as deleteAnnotationFromSource,
  type ElementTarget,
  elementTargetAfterAnnotation,
  injectScript,
  insertAnnotation,
  parseAnnotations,
  setAnnotationResolved,
} from "../lib/designAnnotations.ts";
import { useDesignLoad, useWebDesignHosting } from "../lib/designData.ts";
import { designBlob, downloadBlob } from "../lib/downloadDesign.ts";
import { designBasename, designKey, previewFlowPath, previewPath } from "../lib/paths.ts";
import { requestRevealLine, setDesignDraft, useDesignDraft, usePreviewRevision, useWebDesignAgentSession } from "../lib/webDesignStore.ts";

const DESIGN_IFRAME_SANDBOX = "allow-scripts allow-forms allow-popups allow-modals";
/**
 * Hosted binary assets (images, fonts, other non-text files) are shown as the
 * browser's own media document, which needs no scripts, forms or same-origin
 * access, so they get the most restrictive sandbox. Non-renderable types
 * (fonts, octet-stream) no longer auto-download from the preview; the editor's
 * Download action covers that.
 */
const HOSTED_ASSET_SANDBOX = "";

/** Live preview of one design: the editor's content mirrored into a sandboxed iframe. */
function DesignPreview({ flowName, designName }: { flowName: string; designName: string }) {
  const panel = usePanel();
  const key = designKey(flowName, designName);
  const { document, error, reload } = useDesignLoad(flowName, designName);
  const draft = useDesignDraft(key);
  const previewRevision = usePreviewRevision(key);
  const { serveDirectory } = useWebDesignHosting();
  const session = useWebDesignAgentSession();

  // The flow's file list changes whenever an agent writes a sibling asset, so the
  // hosted preview URL carries it and reloads when styles or images are rewritten.
  const flowFiles = useDesigns(flowName);
  const flowRevision = flowFiles.data?.designs.map(file => `${file.name}:${file.updatedAt}`).join("|") ?? "";

  const content = draft ?? document?.content ?? "";
  const isReady = document !== null;
  const isTextFile = document?.encoding !== "base64";
  const isHtmlFile = isTextFile && document?.mimeType === "text/html";

  const [autoPreview, setAutoPreview] = useLocalStorageState<boolean>("webdesign:auto-preview", true);
  const [previewSource, setPreviewSource] = useState(content);
  const [device, setDevice] = useDeviceSelection();
  const [annotateMode, setAnnotateMode] = useState(false);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [annotationRects, setAnnotationRects] = useState<Record<string, BridgeRect>>({});
  const [pendingPick, setPendingPick] = useState<{ target: ElementTarget; rect: BridgeRect } | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState("");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [capturing, setCapturing] = useState(false);
  const [lastScreenshot, setLastScreenshot] = useState<{ fileName: string; content: string } | null>(null);
  const frameLoadedRef = useRef(false);

  // Debounced auto-preview: a ref so turning it off mid-debounce is honoured and a
  // stale debounced value is not re-applied when it is turned back on.
  const debouncedContent = useDebounce(content, 400);
  const autoPreviewRef = useRefSync(autoPreview);
  useEffect(() => {
    if (autoPreviewRef.current) setPreviewSource(debouncedContent);
  }, [autoPreviewRef, debouncedContent]);

  // The design's content lands in the preview as soon as it loads, whatever auto-preview says.
  const contentRef = useRefSync(content);
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !isReady) return;
    seededRef.current = true;
    setPreviewSource(contentRef.current);
  }, [contentRef, isReady]);

  /** Applies an annotation-driven source edit (insert / reply / resolve / delete). */
  const applyAnnotationEdit = useCallback(
    (nextHtml: string) => {
      setDesignDraft(key, nextHtml);
      // Annotation edits always refresh the preview immediately, even with auto-preview off.
      if (!autoPreviewRef.current) setPreviewSource(nextHtml);
    },
    [autoPreviewRef, key],
  );

  const annotations = useMemo(() => (isHtmlFile ? parseAnnotations(content) : []), [content, isHtmlFile]);
  const annotationTargets = useMemo(
    () =>
      annotations
        .map(annotation => ({ id: annotation.id, target: elementTargetAfterAnnotation(content, annotation) }))
        .filter((entry): entry is { id: string; target: ElementTarget } => entry.target !== null),
    [annotations, content],
  );

  const postToFrame = useCallback((message: Record<string, unknown>) => {
    frameRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  // Keep the bridge in sync with annotate mode, tracked elements, and iframe reloads.
  useEffect(() => {
    if (!frameLoadedRef.current) return;
    postToFrame({ type: BRIDGE_ANNOTATE, enabled: annotateMode });
  }, [annotateMode, postToFrame]);

  useEffect(() => {
    if (!frameLoadedRef.current) return;
    postToFrame({ type: BRIDGE_TRACK, targets: annotationTargets });
  }, [annotationTargets, postToFrame]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: string; rects?: Record<string, BridgeRect>; target?: ElementTarget; rect?: BridgeRect } | null;
      if (!data || typeof data.type !== "string") return;
      if (data.type === BRIDGE_RECTS && data.rects) {
        setAnnotationRects(data.rects);
      } else if (data.type === BRIDGE_PICK && data.target && data.rect) {
        setPendingPick({ target: data.target, rect: data.rect });
        setAnnotationDraft("");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const handleFrameLoad = useCallback(() => {
    frameLoadedRef.current = true;
    postToFrame({ type: BRIDGE_ANNOTATE, enabled: annotateMode });
    postToFrame({ type: BRIDGE_TRACK, targets: annotationTargets });
  }, [annotateMode, annotationTargets, postToFrame]);

  const submitPendingAnnotation = useCallback(() => {
    if (!pendingPick || !annotationDraft.trim()) return;
    const id = `ann-${Date.now().toString(36)}`;
    const result = insertAnnotation(content, pendingPick.target, id, annotationDraft.trim());
    if (!result) {
      toastManager.error("Could not locate that element in the source", { duration: 4000 });
      return;
    }
    applyAnnotationEdit(result.html);
    setPendingPick(null);
    setAnnotationDraft("");
  }, [annotationDraft, applyAnnotationEdit, content, pendingPick]);

  /** Sends one annotation as feedback to the design agent the navigator is attached to. */
  const sendAnnotationToAgent = useCallback(
    async (annotation: DesignAnnotation) => {
      if (!session) {
        toastManager.error("Open the Design flows panel to start a design agent", { duration: 5000 });
        return;
      }
      const sent = await session.send(
        `Design annotation on "${flowName}/${designName}" (line ${annotation.line}): "${annotation.text}" — please apply this feedback to the design and save it.`,
      );
      if (sent) toastManager.success("Annotation sent to the agent", { duration: 2500 });
    },
    [designName, flowName, session],
  );

  const hostedPreviewUrl = `${previewPath(serveDirectory, flowName, designName)}?v=${encodeURIComponent(`${previewRevision}:${flowRevision}`)}`;
  // Binary assets preview from the hosted URL; text and HTML always mirror the editor.
  const useHostedPreview = !isTextFile;

  // Design HTML renders exactly as authored; isolation comes from the sandboxed
  // iframe (opaque origin), not from rewriting the content. A <base> tag keeps
  // sibling links (styles.css, other pages) resolving against the hosted flow.
  const previewHtml = useMemo(() => {
    const baseTag = `<base href="${previewFlowPath(serveDirectory, flowName)}">`;
    return /<head(\s[^>]*)?>/i.test(previewSource) ? previewSource.replace(/<head(\s[^>]*)?>/i, match => `${match}${baseTag}`) : `${baseTag}${previewSource}`;
  }, [flowName, previewSource, serveDirectory]);

  // The bridge script rides along with HTML previews (srcDoc), powering annotation
  // picking and live pin positions; it stays idle until the parent sends a message.
  const frameHtml = useMemo(() => (isHtmlFile ? injectScript(previewHtml, buildAnnotationBridgeScript()) : previewHtml), [isHtmlFile, previewHtml]);

  if (!isReady) {
    if (error) {
      return (
        <EmptyState
          variant="page"
          className="h-full"
          icon={Monitor}
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
    }
    return <LoadingState message={`Loading ${flowName} / ${designName}…`} className="h-full" />;
  }

  const previewWidth = effectivePreviewWidth(device);

  /**
   * Screenshots the saved design server-side (the design_screenshot tool's
   * capture) at the size the preview pane shows, stores the PNG in the flow and
   * offers it for download.
   */
  const captureScreenshot = async () => {
    const frame = frameRef.current;
    const width = previewWidth ?? (frame && frame.clientWidth > 0 ? frame.clientWidth : undefined);
    const height = frame && frame.clientHeight > 0 ? frame.clientHeight : undefined;
    setCapturing(true);
    try {
      const shot = await webDesignRPCClient.captureDesignScreenshot({
        flowName,
        name: designName,
        ...(width !== undefined && height !== undefined ? { width, height } : {}),
        save: true,
      });
      const fileName = (shot.savedAs ?? `${designBasename(designName).replace(/\.[^.]+$/, "")}.png`).split("/").pop() ?? "screenshot.png";
      setLastScreenshot({ fileName, content: shot.content });
      const unsavedNote = draft !== null && draft !== document.content ? " (of the saved version; unsaved edits are not included)" : "";
      toastManager.success(shot.savedAs ? `Screenshot saved to ${flowName}/${shot.savedAs}${unsavedNote}` : `Screenshot captured${unsavedNote}`, {
        duration: 4000,
      });
    } catch (e: unknown) {
      toastManager.error(`Screenshot failed: ${formatError(e)}`, { duration: 5000 });
    } finally {
      setCapturing(false);
    }
  };

  return (
    <ViewShell
      scroll={false}
      header={
        <ViewHeader
          variant="navigator"
          title={
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="text-xs font-mono font-semibold text-muted uppercase tracking-wider">Preview</span>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 shrink-0" />
              {isTextFile && <DeviceToolbar value={device} onChange={setDevice} />}
              {isTextFile && (
                <Checkbox
                  checked={autoPreview}
                  className="shrink-0"
                  label={<span className="text-muted select-none">Auto-preview</span>}
                  onChange={enabled => {
                    setAutoPreview(enabled);
                    // Catch up the preview when re-enabling after manual edits.
                    if (enabled) setPreviewSource(content);
                  }}
                />
              )}
              {isTextFile && !autoPreview && (
                <Button variant="secondary" icon={Play} title="Run preview" onClick={() => setPreviewSource(content)} className="shrink-0">
                  Run
                </Button>
              )}
              {isHtmlFile && (
                <button
                  type="button"
                  onClick={() => setAnnotateMode(previous => !previous)}
                  title="Annotate: click an element to leave a comment in the code"
                  aria-pressed={annotateMode}
                  className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-lg transition-colors cursor-pointer focus-ring shrink-0 ${
                    annotateMode ? "bg-violet-600 text-white" : "border border-primary text-muted hover:text-primary hover:bg-hover"
                  }`}
                >
                  <PenLine className="w-3 h-3" />
                  Annotate
                </button>
              )}
              {isHtmlFile && (
                <button
                  type="button"
                  onClick={() => void captureScreenshot()}
                  disabled={capturing}
                  title="Capture a screenshot of the saved design and save it to the flow"
                  className="flex items-center gap-1 px-2 py-0.5 border border-primary text-muted hover:text-primary hover:bg-hover text-xs font-medium rounded-lg transition-colors cursor-pointer focus-ring shrink-0 disabled:opacity-50"
                >
                  {capturing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                  Capture screenshot
                </button>
              )}
              {lastScreenshot && (
                <button
                  type="button"
                  onClick={() =>
                    downloadBlob(
                      designBlob({ name: lastScreenshot.fileName, content: lastScreenshot.content, encoding: "base64", mimeType: "image/png" }),
                      lastScreenshot.fileName,
                    )
                  }
                  title={`Download ${lastScreenshot.fileName}`}
                  aria-label="Download screenshot"
                  className="p-1.5 text-muted hover:text-primary hover:bg-hover rounded-lg transition-colors focus-ring shrink-0"
                >
                  <ImageDown className="w-3.5 h-3.5" />
                </button>
              )}
              <a
                href={hostedPreviewUrl}
                target="_blank"
                rel="noreferrer"
                title="Open hosted preview in a new tab"
                className="p-1.5 text-muted hover:text-primary hover:bg-hover rounded-lg transition-colors focus-ring shrink-0 ml-auto"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="sr-only">Open hosted preview in a new tab</span>
              </a>
            </div>
          }
        />
      }
    >
      <div className="flex-1 min-h-0 overflow-auto bg-tertiary/40 flex justify-center">
        <div className="relative flex flex-col w-full" style={previewWidth !== null ? { width: previewWidth, maxWidth: "100%", flex: "none" } : undefined}>
          {useHostedPreview ? (
            <iframe
              key={`hosted:${hostedPreviewUrl}`}
              ref={frameRef}
              className="flex-1 w-full bg-white border-0"
              src={hostedPreviewUrl}
              sandbox={HOSTED_ASSET_SANDBOX}
              referrerPolicy="no-referrer"
              title="Design preview"
            />
          ) : (
            <iframe
              key={`srcdoc:${previewRevision}`}
              ref={frameRef}
              className="flex-1 w-full bg-white border-0"
              srcDoc={frameHtml}
              sandbox={DESIGN_IFRAME_SANDBOX}
              referrerPolicy="no-referrer"
              title="Design preview"
              onLoad={handleFrameLoad}
            />
          )}
          {!useHostedPreview && (
            <>
              <AnnotationPins
                annotations={annotations}
                rects={annotationRects}
                activeId={activeAnnotationId}
                onActivate={setActiveAnnotationId}
                onResolve={(id, resolved) => applyAnnotationEdit(setAnnotationResolved(content, id, resolved))}
                onReply={(id, reply) => applyAnnotationEdit(appendAnnotationReply(content, id, reply))}
                onDelete={id => {
                  applyAnnotationEdit(deleteAnnotationFromSource(content, id));
                  setAnnotationRects(previous => {
                    const next = { ...previous };
                    delete next[id];
                    return next;
                  });
                }}
                onRevealInEditor={annotation => {
                  setActiveAnnotationId(null);
                  requestRevealLine(key, annotation.line);
                }}
                onSendToAgent={annotation => void sendAnnotationToAgent(annotation)}
              />
              {pendingPick?.rect && (
                <div
                  className="absolute z-30 w-64 bg-primary border border-primary rounded-lg shadow-card p-3"
                  style={{ left: Math.max(8, pendingPick.rect.x - 128), top: pendingPick.rect.y + 24 }}
                >
                  <div className="text-xs text-muted mb-2 truncate">
                    {pendingPick.target.tag}
                    {pendingPick.target.id ? `#${pendingPick.target.id}` : ""}
                    {pendingPick.target.classes.length > 0 ? `.${pendingPick.target.classes.join(".")}` : ""}
                  </div>
                  <TextArea
                    autoFocus
                    value={annotationDraft}
                    onChange={setAnnotationDraft}
                    onKeyDown={event => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        submitPendingAnnotation();
                      }
                      if (event.key === "Escape") setPendingPick(null);
                    }}
                    placeholder="Leave a comment on this element…"
                    aria-label="Annotation comment"
                    rows={3}
                  />
                  <div className="flex items-center gap-1.5 mt-2">
                    <Button onClick={submitPendingAnnotation} disabled={!annotationDraft.trim()}>
                      Add annotation
                    </Button>
                    <Button variant="secondary" onClick={() => setPendingPick(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {!useHostedPreview && (
        <AnnotationList
          annotations={annotations}
          activeId={activeAnnotationId}
          onActivate={setActiveAnnotationId}
          onRevealInEditor={annotation => {
            setActiveAnnotationId(null);
            requestRevealLine(key, annotation.line);
          }}
        />
      )}
    </ViewShell>
  );
}

/** One design's live preview per panel, docked in the previews column beside the editors. */
export default function DesignPreviewPane({ params }: ViewProps) {
  return <DesignPreview flowName={params.flowName ?? ""} designName={params.designName ?? ""} />;
}
