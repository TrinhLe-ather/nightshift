import path from "path";
import tailwind from "bun-plugin-tailwind";

const rootDir = path.resolve(import.meta.dir, "..");
const outdir = path.resolve(rootDir, "dist");

// Build metadata (injected into the bundle via `define`)
const daemonPkg = await Bun.file(path.join(rootDir, "package.json")).json();
const sharedPkg = await Bun.file(path.join(rootDir, "..", "shared", "package.json"))
  .json()
  .catch(() => null);

const versionFromPkg =
  (typeof daemonPkg?.version === "string" && daemonPkg.version) ||
  (typeof sharedPkg?.version === "string" && sharedPkg.version) ||
  "0.0.0";

const buildVersion = process.env.NIGHTSHIFT_BUILD_VERSION?.trim() || versionFromPkg;
let buildCommit = process.env.NIGHTSHIFT_BUILD_COMMIT?.trim() || "";
const buildDate = process.env.NIGHTSHIFT_BUILD_DATE?.trim() || new Date().toISOString();

if (!buildCommit) {
  try {
    const repoRootDir = path.resolve(rootDir, "..", "..");
    const gitResult = await Bun.$`git -C ${repoRootDir} rev-parse --short HEAD`.quiet().text();
    buildCommit = gitResult.trim();
  } catch {
    // Non-git environment (e.g., source archive) — leave empty.
  }
}

// Clean output directory
await Bun.$`rm -rf ${outdir}`.quiet();
await Bun.$`mkdir -p ${outdir}`.quiet();

const compileTargets: Bun.Build.Target[] = [
  "bun-darwin-arm64",
  "bun-linux-x64",
  "bun-windows-x64",
] as const;

for (const target of compileTargets) {
  const platform = target.replace("bun-", "");
  const tmpOutdir = path.join(outdir, `.tmp-${platform}`);
  await Bun.$`rm -rf ${tmpOutdir}`.quiet();

  const result = await Bun.build({
    entrypoints: [path.join(rootDir, "src/index.ts")],
    outdir: tmpOutdir,
    minify: true,
    compile: target,
    sourcemap: "none",
    target: "bun",
    plugins: [tailwind],
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      __NIGHTSHIFT_VERSION__: JSON.stringify(buildVersion),
      __NIGHTSHIFT_COMMIT__: JSON.stringify(buildCommit),
      __NIGHTSHIFT_BUILD_DATE__: JSON.stringify(buildDate),
    },
  });

  if (!result.success) {
    console.error("Build failed:");
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  // Pick the executable output deterministically.
  const candidates = result.outputs.map((o) => o.path).filter((p) => p && !p.endsWith(".map"));

  if (candidates.length === 0) {
    console.error("Build succeeded but produced no outputs.");
    process.exit(1);
  }

  const builtPath = candidates[0]!;
  const ext = platform.startsWith("windows-") ? ".exe" : "";
  const finalPath = path.join(outdir, `nightshift-${platform}${ext}`);

  await Bun.$`mv ${builtPath} ${finalPath}`.quiet();
  await Bun.$`rm -rf ${tmpOutdir}`.quiet();

  console.log(`Build succeeded: ${finalPath}`);
}
