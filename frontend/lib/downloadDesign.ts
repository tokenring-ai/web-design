/** Browser download of one design file, from content the editor already holds. */

export interface DownloadableDesign {
  name: string;
  content: string;
  encoding: "utf8" | "base64";
  mimeType: string;
}

/** The file's bytes: base64 content (binary assets) is decoded, text is written as-is. */
export function designBlob(design: DownloadableDesign): Blob {
  if (design.encoding === "base64") {
    const binary = atob(design.content);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: design.mimeType });
  }
  return new Blob([design.content], { type: design.mimeType });
}

/** Saves the design under its basename (a design may live in a subfolder such as assets/). */
export function downloadDesign(design: DownloadableDesign): void {
  downloadBlob(designBlob(design), design.name.split("/").pop() || design.name);
}

/** Hands the browser a file to save. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
