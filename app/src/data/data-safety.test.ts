import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getStore } from "@/mock/store";

/**
 * `references/testing-acceptance.md` → "Data safety checks": no sample, fixture,
 * or seed anywhere contains a real credential, a real identity, a real IP
 * belonging to a real organisation, card data, or a real production endpoint;
 * every seeded response action is dry-run only. This test makes that a
 * standing guard rather than a one-time review.
 */

const SCAN_DIRS = ["src/data", "../examples", "../schemas"];

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(p));
    else if (/\.(ts|tsx|json)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(p);
  }
  return out;
}

const FILES = SCAN_DIRS.flatMap(collectFiles);
const TEXT = new Map(FILES.map((f) => [f, readFileSync(f, "utf8")]));

// RFC 5737 documentation ranges + RFC 1918 private + loopback/link-local/multicast
function isNonRoutableOrDoc(a: number, b: number, c: number): boolean {
  const doc = (a === 203 && b === 0 && c === 113) || (a === 198 && b === 51 && c === 100) || (a === 192 && b === 0 && c === 2);
  const priv = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  const other = a === 127 || a === 0 || (a === 169 && b === 254) || a >= 224 || a === 255;
  return doc || priv || other;
}

describe("data safety — the seed corpus is synthetic", () => {
  it("scans a non-trivial number of files", () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  it("contains no IPv4 address outside the documentation / private ranges", () => {
    const offenders: string[] = [];
    const re = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g;
    for (const [file, text] of TEXT) {
      for (const m of text.matchAll(re)) {
        const [a, b, c, d] = m.slice(1).map(Number);
        if (a > 255 || b > 255 || c > 255 || d > 255) continue;
        if (!isNonRoutableOrDoc(a, b, c)) offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every email address is under an .example / .test domain", () => {
    const offenders: string[] = [];
    const re = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
    for (const [file, text] of TEXT) {
      for (const m of text.matchAll(re)) {
        const addr = m[0].toLowerCase();
        if (!/@([a-z0-9-]+\.)*(example|test)$/.test(addr)) offenders.push(`${file}: ${addr}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every http(s) URL is a synthetic host or a standards / framework reference", () => {
    // spec + framework URLs that legitimately appear in schema `$schema` keys and
    // ATT&CK / D3FEND reference data — never a customer or production endpoint
    const KNOWN_SAFE = /(^|\.)(json-schema\.org|schema\.org|w3\.org|ietf\.org|rfc-editor\.org|mitre\.org|spdx\.org)$/;
    const offenders: string[] = [];
    const re = /https?:\/\/([a-z0-9.-]+)/gi;
    for (const [file, text] of TEXT) {
      for (const m of text.matchAll(re)) {
        const host = m[1].toLowerCase();
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) continue; // an IP — covered by the IP check
        const ok = /(^|\.)(example|test|localhost|invalid)$/.test(host) || KNOWN_SAFE.test(host);
        if (!ok) offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("holds no credential / private-key / cloud-key literals", () => {
    // "password"/"token" appear legitimately in ATT&CK names and synthetic log
    // lines, so we look only for the shapes of real secrets.
    const re =
      /(-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{10,}|ghp_[0-9A-Za-z]{36}|sk-[A-Za-z0-9]{32,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)/;
    const offenders: string[] = [];
    for (const [file, text] of TEXT) if (re.test(text)) offenders.push(file);
    expect(offenders).toEqual([]);
  });
});

describe("data safety — every seeded response action is dry-run", () => {
  const store = getStore();

  it("every seeded action request carries dry_run = true", () => {
    expect(store.actionRequests.length).toBeGreaterThan(0);
    for (const r of store.actionRequests) {
      expect(r.dry_run, `${r.action_request_id} is not dry-run`).toBe(true);
    }
  });

  it("every seeded execution / verification is explicitly marked a dry run", () => {
    const executed = store.actionRequests.filter((r) => r.execution);
    expect(executed.length).toBeGreaterThan(0);
    for (const r of executed) {
      expect(r.execution?.result_note ?? "").toMatch(/DRY RUN/i);
      expect(r.verification?.notes ?? "").toMatch(/DRY RUN/i);
    }
  });
});
