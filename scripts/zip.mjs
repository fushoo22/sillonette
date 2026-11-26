// Trial zip: dist-zip/sillonette-<version>.zip
// (extension-chrome/, overlay/, LISEZMOI.txt and its English summary README-EN.txt, Windows line endings). Needs bsdtar (libarchive).
// Entries get a fixed date and no owner, so the zip says nothing about the machine that built it.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const dist = join(root, "dist");
execFileSync(process.execPath, [join(root, "scripts/build.mjs")], { env: { ...process.env, SILLONETTE_E2E_MATCH: "", SILLONETTE_OUT: dist }, stdio: "inherit" });
const m = JSON.parse(readFileSync(join(dist, "chrome/manifest.json"), "utf8"));
if (m.content_scripts[0].matches.length !== 1) throw new Error("test build: refusing to zip");

const stage = join(dist, "zip");
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(join(dist, "chrome"), join(stage, "extension-chrome"), { recursive: true });
cpSync(join(dist, "overlay"), join(stage, "overlay"), { recursive: true });
for (const f of ["LISEZMOI.txt", "README-EN.txt"]) writeFileSync(join(stage, f), readFileSync(join(root, f), "utf8").replace(/\r?\n/g, "\r\n"));
// fixed date (2026-01-01 00:00 UTC) on every entry
execFileSync("find", [stage, "-exec", "touch", "-h", "-d", "2026-01-01T00:00:00Z", "{}", "+"]);
const outDir = join(root, "dist-zip");
mkdirSync(outDir, { recursive: true });
const zip = join(outDir, `sillonette-${version}.zip`);
rmSync(zip, { force: true });
execFileSync("bsdtar", ["--format", "zip", "--uid", "0", "--gid", "0", "--uname", "", "--gname", "", "-cf", zip, "-C", stage, "LISEZMOI.txt", "README-EN.txt", "extension-chrome", "overlay"]);
console.log("zip:", zip);
