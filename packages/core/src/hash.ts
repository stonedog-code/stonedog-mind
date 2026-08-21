/**
 * A content fingerprint, with no Node builtins.
 *
 * This deliberately does NOT use `node:crypto`. Item identity is computed while
 * planning a session, and session planning runs in the browser as well as on a
 * server — importing `node:crypto` here dragged a Node-only module into the
 * client bundle and broke the build, which is the barrel-export version of the
 * "core has zero I/O" rule being violated.
 *
 * A cryptographic digest is not needed: the job is to notice when the meaning
 * of an item changed, not to resist an adversary. FNV-1a over 64 bits, as two
 * 32-bit halves because JS bitwise operations are 32-bit.
 */
export function contentHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;

  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }

  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}
