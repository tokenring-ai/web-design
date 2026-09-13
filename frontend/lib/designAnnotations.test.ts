import { describe, expect, test } from "bun:test";
import {
  appendAnnotationReply,
  deleteAnnotation,
  elementTargetAfterAnnotation,
  findElementLine,
  injectScript,
  insertAnnotation,
  parseAnnotations,
  setAnnotationResolved,
} from "./designAnnotations.ts";

const SOURCE = `<!DOCTYPE html>
<html>
<body>
  <div class="card">
    <h1>Title</h1>
    <button class="btn primary" id="save">Save</button>
    <button class="btn secondary">Cancel</button>
  </div>
</body>
</html>`;

describe("parseAnnotations", () => {
  test("reads id, text, replies, resolution, and source line", () => {
    const html = `<!DOCTYPE html>
<html>
<body>
  <!-- annotation ann-1: Make this button bigger -->
  <button id="save">Save</button>
  <!-- annotation ann-2 [resolved]: Wrong color
       > Could you try #22c55e?
  -->
  <p>Text</p>
</body>
</html>`;

    const annotations = parseAnnotations(html);
    expect(annotations).toHaveLength(2);

    expect(annotations[0]).toMatchObject({ id: "ann-1", text: "Make this button bigger", resolved: false, replies: [] });
    expect(annotations[0]?.line).toBe(4);

    expect(annotations[1]).toMatchObject({ id: "ann-2", text: "Wrong color", resolved: true, replies: ["Could you try #22c55e?"] });
  });

  test("returns an empty list for designs without annotations", () => {
    expect(parseAnnotations(SOURCE)).toEqual([]);
  });
});

describe("insertAnnotation", () => {
  test("inserts the comment on its own line before the anchored element", () => {
    const target = { tag: "button", id: "save", classes: ["btn", "primary"], nth: 0 };
    const result = insertAnnotation(SOURCE, target, "ann-1", "Make this bigger");

    expect(result).not.toBeNull();
    expect(result!.line).toBe(6);
    expect(result!.html).toContain("<!-- annotation ann-1: Make this bigger -->");
    expect(result!.html).toContain(`<!-- annotation ann-1: Make this bigger -->\n    <button class="btn primary" id="save">`);
  });

  test("returns null when the element cannot be found", () => {
    const target = { tag: "aside", id: null, classes: [], nth: 0 };
    expect(insertAnnotation(SOURCE, target, "ann-1", "nope")).toBeNull();
  });
});

describe("elementTargetAfterAnnotation and findElementLine", () => {
  test("round-trips: the target derived from a comment maps back to the element line", () => {
    const target = { tag: "button", id: "save", classes: ["btn", "primary"], nth: 0 };
    const inserted = insertAnnotation(SOURCE, target, "ann-1", "Fix spacing");
    expect(inserted).not.toBeNull();

    const annotation = parseAnnotations(inserted!.html).find(entry => entry.id === "ann-1");
    expect(annotation).toBeDefined();

    const recovered = elementTargetAfterAnnotation(inserted!.html, annotation!);
    expect(recovered).toEqual(target);

    // The comment sits directly above the element, so both resolve to adjacent lines.
    const elementLine = findElementLine(inserted!.html, recovered!);
    expect(elementLine).toBe(inserted!.line + 1);
  });

  test("distinguishes same-tag elements by id and classes", () => {
    const cancelTarget = { tag: "button", id: null, classes: ["btn", "secondary"], nth: 0 };
    expect(findElementLine(SOURCE, cancelTarget)).toBe(7);
    expect(findElementLine(SOURCE, { tag: "button", id: "save", classes: ["btn", "primary"], nth: 0 })).toBe(6);
  });
});

describe("annotation mutations", () => {
  test("appendAnnotationReply adds a quoted line inside the comment", () => {
    const inserted = insertAnnotation(SOURCE, { tag: "button", id: "save", classes: ["btn", "primary"], nth: 0 }, "ann-1", "Spacing");
    const withReply = appendAnnotationReply(inserted!.html, "ann-1", "Use the 4px grid");

    const annotation = parseAnnotations(withReply).find(entry => entry.id === "ann-1");
    expect(annotation?.replies).toEqual(["Use the 4px grid"]);
    expect(annotation?.text).toBe("Spacing");
  });

  test("setAnnotationResolved toggles the resolved flag", () => {
    const inserted = insertAnnotation(SOURCE, { tag: "button", id: "save", classes: ["btn", "primary"], nth: 0 }, "ann-1", "Spacing");
    const resolved = setAnnotationResolved(inserted!.html, "ann-1", true);
    expect(parseAnnotations(resolved)[0]?.resolved).toBe(true);

    const reopened = setAnnotationResolved(resolved, "ann-1", false);
    expect(parseAnnotations(reopened)[0]?.resolved).toBe(false);
  });

  test("deleteAnnotation removes the whole comment block", () => {
    const inserted = insertAnnotation(SOURCE, { tag: "button", id: "save", classes: ["btn", "primary"], nth: 0 }, "ann-1", "Spacing");
    const cleaned = deleteAnnotation(inserted!.html, "ann-1");
    expect(parseAnnotations(cleaned)).toEqual([]);
    expect(cleaned).toContain('id="save"');
  });
});

describe("injectScript", () => {
  test("wraps the script and injects before the closing body tag", () => {
    const output = injectScript("<html><body><p>Hi</p></body></html>", "x();");
    expect(output).toBe("<html><body><p>Hi</p><script>x();</script></body></html>");
  });

  test("falls back to before </html>, then appends", () => {
    expect(injectScript("<html><head></head></html>", "x();")).toBe("<html><head></head><script>x();</script></html>");
    expect(injectScript("plain text", "x();")).toBe("plain text<script>x();</script>");
  });
});
