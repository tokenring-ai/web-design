/**
 * Script injected into design preview iframes. It powers the annotation feature:
 * - hover highlight + element picking in annotate mode (reports a stable element
 *   identity the editor side can match back into the HTML source)
 * - live position reports for elements that carry annotation pins
 *
 * Communication is postMessage in both directions; all messages are prefixed
 * with `web-design:`. The script stays idle (two passive listeners) until the
 * parent enables annotate mode or starts tracking pinned elements.
 */

export const BRIDGE_PICK = "web-design:pick";
export const BRIDGE_RECTS = "web-design:rects";
export const BRIDGE_ANNOTATE = "web-design:annotate";
export const BRIDGE_TRACK = "web-design:track";

export interface BridgeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function buildAnnotationBridgeScript(): string {
  return `
(function () {
  if (window.__webDesignBridge) return;
  window.__webDesignBridge = true;

  var PARENT = window.parent;
  var annotateMode = false;
  var highlight = null;
  var tracked = []; // { annotationId, element }
  var reportScheduled = false;

  function matchesIdentity(el, tag, id, classes) {
    if (el.tagName.toLowerCase() !== tag) return false;
    if ((el.id || null) !== (id || null)) return false;
    return Array.prototype.slice.call(el.classList).sort().join(" ") === classes.slice().sort().join(" ");
  }

  function elementTarget(el) {
    var tag = el.tagName.toLowerCase();
    var id = el.id || null;
    var classes = Array.prototype.slice.call(el.classList).sort();
    var nth = 0;
    var nodes = document.getElementsByTagName(tag);
    for (var i = 0; i < nodes.length; i++) {
      if (!matchesIdentity(nodes[i], tag, id, classes)) continue;
      if (nodes[i] === el) break;
      nth++;
    }
    return { tag: tag, id: id, classes: classes, nth: nth };
  }

  function resolveTarget(target) {
    var nodes = document.getElementsByTagName(target.tag);
    var nth = 0;
    for (var i = 0; i < nodes.length; i++) {
      if (!matchesIdentity(nodes[i], target.tag, target.id, target.classes)) continue;
      if (nth === target.nth) return nodes[i];
      nth++;
    }
    return null;
  }

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }

  function scheduleRectReport() {
    if (reportScheduled || tracked.length === 0) return;
    reportScheduled = true;
    requestAnimationFrame(function () {
      reportScheduled = false;
      var rects = {};
      tracked.forEach(function (entry) {
        if (entry.element && entry.element.isConnected) rects[entry.annotationId] = rectOf(entry.element);
      });
      PARENT.postMessage({ type: ${JSON.stringify(BRIDGE_RECTS)}, rects: rects }, "*");
    });
  }

  function setHighlight(el) {
    if (highlight) {
      highlight.remove();
      highlight = null;
    }
    if (!el) return;
    highlight = document.createElement("div");
    highlight.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #7c3aed;background:rgba(124,58,237,0.08);border-radius:4px;";
    document.documentElement.appendChild(highlight);
    moveHighlight(el);
  }

  function moveHighlight(el) {
    if (!highlight || !el) return;
    var r = el.getBoundingClientRect();
    highlight.style.left = r.x + "px";
    highlight.style.top = r.y + "px";
    highlight.style.width = r.width + "px";
    highlight.style.height = r.height + "px";
  }

  function setAnnotateMode(enabled) {
    annotateMode = enabled;
    document.documentElement.style.cursor = enabled ? "crosshair" : "";
    if (!enabled) setHighlight(null);
  }

  document.addEventListener(
    "mousemove",
    function (event) {
      if (!annotateMode) return;
      var el = event.target;
      if (!(el instanceof Element) || el === highlight || el === document.documentElement || el === document.body) {
        setHighlight(null);
        return;
      }
      setHighlight(el);
      moveHighlight(el);
    },
    true
  );

  document.addEventListener(
    "click",
    function (event) {
      if (!annotateMode) return;
      event.preventDefault();
      event.stopPropagation();
      var el = event.target;
      if (!(el instanceof Element) || el === document.documentElement || el === document.body || el === highlight) return;
      PARENT.postMessage({ type: ${JSON.stringify(BRIDGE_PICK)}, target: elementTarget(el), rect: rectOf(el) }, "*");
      setAnnotateMode(false);
    },
    true
  );

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || typeof data.type !== "string" || data.type.indexOf("web-design:") !== 0) return;
    if (data.type === ${JSON.stringify(BRIDGE_ANNOTATE)}) {
      setAnnotateMode(Boolean(data.enabled));
    } else if (data.type === ${JSON.stringify(BRIDGE_TRACK)}) {
      tracked = [];
      (data.targets || []).forEach(function (entry) {
        var element = resolveTarget(entry.target);
        if (element) tracked.push({ annotationId: entry.id, element: element });
      });
      scheduleRectReport();
    }
  });

  window.addEventListener("scroll", scheduleRectReport, true);
  window.addEventListener("resize", scheduleRectReport);
  window.addEventListener("load", function () {
    setTimeout(scheduleRectReport, 250);
  });
})();
`.trim();
}
