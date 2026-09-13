/**
 * Process-wide change counter for design content. Bumped whenever a file inside
 * the web-design directory is written (via the filesystem service's write
 * listener), read by the RPC stream pollers so they rescan the directory only
 * when something actually changed.
 */
let revision = 0;

export function bumpDesignRevision(): void {
  revision++;
}

export function getDesignRevision(): number {
  return revision;
}
