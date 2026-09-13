/**
 * Design annotations live inside the design HTML itself as HTML comments anchored
 * to elements, so they survive with the file and are visible to design agents via
 * design_read:
 *
 * ```
 * <!-- annotation ann-1: Make this button bigger -->
 * <button class="primary">Save</button>
 * ```
 *
 * Replies are appended as `>` lines inside the comment; resolution is marked with
 * a `[resolved]` flag after the id.
 */

export interface DesignAnnotation {
  id: string;
  text: string;
  replies: string[];
  resolved: boolean;
  /** 1-based source line of the comment start. */
  line: number;
}

/** Element identity reported by the preview bridge and matched back into the source. */
export interface ElementTarget {
  tag: string;
  id: string | null;
  classes: string[];
  /** Index among elements with the same tag/id/classes in document order (0-based). */
  nth: number;
}

const ANNOTATION_COMMENT_PATTERN = /<!--\s*annotation\s+([\w-]+)\s*(\[resolved\])?\s*:?\s*([\s\S]*?)-->/g;

/** Reads every annotation comment from a design HTML source, in document order. */
export function parseAnnotations(html: string): DesignAnnotation[] {
  const annotations: DesignAnnotation[] = [];
  for (const match of html.matchAll(ANNOTATION_COMMENT_PATTERN)) {
    const id = match[1] ?? "";
    const resolvedFlag = match[2];
    const bodyLines = (match[3] ?? "")
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);
    const text = bodyLines.find(line => !line.startsWith(">")) ?? "";
    const replies = bodyLines.filter(line => line.startsWith(">")).map(line => line.replace(/^>\s*/, ""));
    annotations.push({
      id,
      text,
      replies,
      resolved: Boolean(resolvedFlag),
      line: html.slice(0, match.index ?? 0).split("\n").length,
    });
  }
  return annotations;
}

function lineStartIndex(html: string, line: number): number {
  let index = 0;
  for (let current = 1; current < line && index < html.length; current++) {
    index = html.indexOf("\n", index) + 1;
    if (index === 0) return html.length;
  }
  return index;
}

function indentationOf(html: string, line: number): string {
  const start = lineStartIndex(html, line);
  const match = /^[ \t]*/.exec(html.slice(start));
  return match ? match[0] : "";
}

/**
 * Finds the 1-based line of an element's opening tag, matching the bridge's
 * descriptor semantics: same tag, same id, same class list, counted in document order.
 */
export function findElementLine(html: string, target: ElementTarget): number | null {
  const tagPattern = new RegExp(`<${escapeRegExp(target.tag)}(?=[\\s>])`, "gi");
  const wantedClasses = [...target.classes].sort().join(" ");
  let seen = 0;
  for (const match of html.matchAll(tagPattern)) {
    const attributes = readAttributes(html, match.index);
    const sameId = (attributes.id ?? null) === target.id;
    const sameClasses = [...attributes.classes].sort().join(" ") === wantedClasses;
    if (!sameId || !sameClasses) continue;
    if (seen === target.nth) {
      return html.slice(0, match.index).split("\n").length;
    }
    seen++;
  }
  return null;
}

/** Inserts an annotation comment on its own line immediately before the element's opening tag. */
export function insertAnnotation(html: string, target: ElementTarget, id: string, text: string): { html: string; line: number } | null {
  const elementLine = findElementLine(html, target);
  if (elementLine === null) return null;

  const comment = renderAnnotationComment(id, text, [], false);
  const indent = indentationOf(html, elementLine);
  const start = lineStartIndex(html, elementLine);
  return {
    html: `${html.slice(0, start)}${indent}${comment}\n${html.slice(start)}`,
    line: elementLine,
  };
}

/** Appends a reply line to an existing annotation comment. */
export function appendAnnotationReply(html: string, id: string, reply: string): string {
  return rewriteAnnotationComment(html, id, comment => ({ ...comment, replies: [...comment.replies, reply] }));
}

export function setAnnotationResolved(html: string, id: string, resolved: boolean): string {
  return rewriteAnnotationComment(html, id, comment => ({ ...comment, resolved }));
}

export function deleteAnnotation(html: string, id: string): string {
  const pattern = new RegExp(`[ \\t]*<!--\\s*annotation\\s+${escapeRegExp(id)}\\b[\\s\\S]*?-->\\n?`);
  return html.replace(pattern, "");
}

function renderAnnotationComment(id: string, text: string, replies: string[], resolved: boolean): string {
  if (replies.length === 0) {
    return `<!-- annotation ${id}${resolved ? " [resolved]" : ""}: ${text} -->`;
  }
  const lines = [`<!-- annotation ${id}${resolved ? " [resolved]" : ""}: ${text}`];
  for (const reply of replies) lines.push(`     > ${reply}`);
  lines.push("-->");
  return lines.join("\n");
}

function rewriteAnnotationComment(html: string, id: string, rewrite: (annotation: DesignAnnotation) => DesignAnnotation): string {
  const annotation = parseAnnotations(html).find(candidate => candidate.id === id);
  if (!annotation) return html;
  const updated = rewrite(annotation);
  const existingPattern = new RegExp(`<!--\\s*annotation\\s+${escapeRegExp(id)}\\b[\\s\\S]*?-->`);
  return html.replace(existingPattern, renderAnnotationComment(id, updated.text, updated.replies, updated.resolved));
}

/**
 * Derives the ElementTarget of the element a comment annotates: the annotation
 * comment sits immediately before the element's opening tag, so the next opening
 * tag in the source after the comment is the anchor.
 */
export function elementTargetAfterAnnotation(html: string, annotation: DesignAnnotation): ElementTarget | null {
  const commentPattern = new RegExp(`<!--\\s*annotation\\s+${escapeRegExp(annotation.id)}\\b[\\s\\S]*?-->`);
  const commentMatch = commentPattern.exec(html);
  if (!commentMatch) return null;

  const afterComment = html.slice(commentMatch.index + commentMatch[0].length);
  const tagMatch = /<([a-zA-Z][a-zA-Z0-9-]*)(?=[\s>])/.exec(afterComment);
  if (!tagMatch) return null;

  const tag = (tagMatch[1] ?? "").toLowerCase();
  const attributes = readAttributes(afterComment, tagMatch.index);
  const classes = [...attributes.classes].sort();

  // nth counts prior elements in the WHOLE document with the same identity,
  // matching the preview bridge's document-order counting.
  const globalPattern = new RegExp(`<${escapeRegExp(tag)}(?=[\\s>])`, "gi");
  const absoluteIndex = commentMatch.index + commentMatch[0].length + tagMatch.index;
  let nth = 0;
  for (const match of html.matchAll(globalPattern)) {
    if (match.index >= absoluteIndex) break;
    const candidate = readAttributes(html, match.index);
    if ((candidate.id ?? null) === attributes.id && [...candidate.classes].sort().join(" ") === classes.join(" ")) nth++;
  }

  return { tag, id: attributes.id, classes, nth };
}

function readAttributes(html: string, tagStart: number): { id: string | null; classes: string[] } {
  const tagEnd = html.indexOf(">", tagStart);
  const tagSource = html.slice(tagStart, tagEnd === -1 ? undefined : tagEnd + 1);
  const idMatch = /\bid\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/i.exec(tagSource);
  const classMatch = /\bclass\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/i.exec(tagSource);
  return {
    id: idMatch ? (idMatch[2] ?? idMatch[3] ?? idMatch[4] ?? null) : null,
    classes: classMatch ? (classMatch[2] ?? classMatch[3] ?? classMatch[4] ?? "").split(/\s+/).filter(Boolean) : [],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Injects a script into a full HTML document, before </body>/</html> or appended. */
export function injectScript(html: string, script: string): string {
  const element = `<script>${script}</script>`;
  if (/<\/body\s*>/i.test(html)) return html.replace(/<\/body\s*>/i, `${element}</body>`);
  if (/<\/html\s*>/i.test(html)) return html.replace(/<\/html\s*>/i, `${element}</html>`);
  return `${html}${element}`;
}
