import { Check, MessageSquarePlus, Send, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { BridgeRect } from "../lib/annotationBridge.ts";
import type { DesignAnnotation } from "../lib/designAnnotations.ts";

interface AnnotationOverlayProps {
  annotations: DesignAnnotation[];
  rects: Record<string, BridgeRect>;
  activeId: string | null;
  onActivate: (id: string | null) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onReply: (id: string, reply: string) => void;
  onDelete: (id: string) => void;
  onRevealInEditor: (annotation: DesignAnnotation) => void;
  onSendToAgent: (annotation: DesignAnnotation) => void;
}

/** Numbered pins over the preview, one per annotation, with a comment popover on the active pin. */
export function AnnotationPins({
  annotations,
  rects,
  activeId,
  onActivate,
  onResolve,
  onReply,
  onDelete,
  onRevealInEditor,
  onSendToAgent,
}: AnnotationOverlayProps) {
  const [replyDraft, setReplyDraft] = useState("");

  if (annotations.length === 0) return null;
  const active = annotations.find(annotation => annotation.id === activeId) ?? null;
  const activeRect = active ? rects[active.id] : null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" role="presentation">
      {annotations.map((annotation, index) => {
        const rect = rects[annotation.id];
        if (!rect) return null;
        return (
          <button
            key={annotation.id}
            type="button"
            onClick={event => {
              event.stopPropagation();
              onActivate(activeId === annotation.id ? null : annotation.id);
            }}
            title={annotation.text}
            aria-label={`Annotation ${index + 1}: ${annotation.text}`}
            className={`absolute pointer-events-auto w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full text-[10px] font-bold flex items-center justify-center shadow-card transition-transform cursor-pointer focus-ring ${
              annotation.resolved
                ? "bg-emerald-600 text-white opacity-60"
                : activeId === annotation.id
                  ? "bg-violet-600 text-white scale-110 z-10"
                  : "bg-violet-500 text-white"
            }`}
            style={{ left: rect.x, top: rect.y }}
          >
            {annotation.resolved ? <Check className="w-3 h-3" /> : index + 1}
          </button>
        );
      })}

      {active && activeRect && (
        <div
          role="dialog"
          aria-label={`Annotation comment`}
          className="absolute pointer-events-auto z-20 w-60 bg-primary border border-primary rounded-lg shadow-card p-3"
          style={{
            left: Math.max(8, activeRect.x - 120),
            top: activeRect.y + 28,
          }}
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-start gap-1.5">
            <p className="flex-1 min-w-0 text-xs text-primary whitespace-pre-wrap break-words">{active.text}</p>
            <button
              type="button"
              onClick={() => onActivate(null)}
              aria-label="Close annotation"
              className="p-0.5 text-muted hover:text-primary rounded transition-colors cursor-pointer focus-ring shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {active.replies.length > 0 && (
            <ul className="mt-2 pl-2 border-l-2 border-primary/40 space-y-1">
              {active.replies.map((reply, replyIndex) => (
                <li key={replyIndex} className="text-xs text-muted whitespace-pre-wrap break-words">
                  {reply}
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-1 mt-2">
            <input
              type="text"
              value={replyDraft}
              onChange={event => setReplyDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter" && replyDraft.trim()) {
                  onReply(active.id, replyDraft.trim());
                  setReplyDraft("");
                }
              }}
              placeholder="Reply…"
              aria-label="Reply to annotation"
              className="flex-1 min-w-0 px-2 py-1 bg-transparent border border-primary rounded text-xs text-primary focus-ring"
            />
            <button
              type="button"
              onClick={() => {
                if (!replyDraft.trim()) return;
                onReply(active.id, replyDraft.trim());
                setReplyDraft("");
              }}
              aria-label="Send reply"
              className="p-1 text-muted hover:text-primary rounded transition-colors cursor-pointer focus-ring shrink-0"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 mt-2.5">
            <button
              type="button"
              onClick={() => onResolve(active.id, !active.resolved)}
              className="flex items-center gap-1 px-2 py-0.5 text-xs border border-primary text-muted hover:text-primary hover:bg-hover rounded-lg transition-colors cursor-pointer focus-ring"
            >
              <Check className="w-3 h-3" />
              {active.resolved ? "Reopen" : "Resolve"}
            </button>
            <button
              type="button"
              onClick={() => onSendToAgent(active)}
              className="flex items-center gap-1 px-2 py-0.5 text-xs bg-accent-muted hover:bg-accent-muted-hover text-accent rounded-lg transition-colors cursor-pointer focus-ring"
            >
              <Send className="w-3 h-3" />
              To agent
            </button>
            <button
              type="button"
              onClick={() => {
                onRevealInEditor(active);
              }}
              className="px-2 py-0.5 text-xs border border-primary text-muted hover:text-primary hover:bg-hover rounded-lg transition-colors cursor-pointer focus-ring"
            >
              In code
            </button>
            <button
              type="button"
              onClick={() => onDelete(active.id)}
              aria-label="Delete annotation"
              className="ml-auto p-1 text-muted hover:text-error rounded transition-colors cursor-pointer focus-ring shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Collapsible strip listing all annotations for the open design. */
export function AnnotationList({
  annotations,
  activeId,
  onActivate,
  onRevealInEditor,
}: {
  annotations: DesignAnnotation[];
  activeId: string | null;
  onActivate: (id: string | null) => void;
  onRevealInEditor: (annotation: DesignAnnotation) => void;
}) {
  if (annotations.length === 0) return null;

  return (
    <div role="region" aria-label="Annotation list" className="shrink-0 max-h-32 overflow-y-auto border-t border-primary bg-secondary/40">
      <ul className="py-1">
        {annotations.map((annotation, index) => (
          <li key={annotation.id}>
            <button
              type="button"
              onClick={() => {
                onActivate(activeId === annotation.id ? null : annotation.id);
                if (!annotation.resolved) onRevealInEditor(annotation);
              }}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs transition-colors cursor-pointer focus-ring ${
                activeId === annotation.id ? "bg-accent-muted text-accent" : "text-primary hover:bg-hover"
              }`}
            >
              <span
                className={`w-4 h-4 shrink-0 rounded-full text-[9px] font-bold flex items-center justify-center ${
                  annotation.resolved ? "bg-emerald-600 text-white" : "bg-violet-500 text-white"
                }`}
              >
                {annotation.resolved ? <Check className="w-2.5 h-2.5" /> : index + 1}
              </span>
              <span className="flex-1 min-w-0 truncate">{annotation.text}</span>
              <span className="text-muted shrink-0 tabular-nums">L{annotation.line}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
