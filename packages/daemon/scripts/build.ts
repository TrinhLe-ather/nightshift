import path from "path";
import tailwind from "bun-plugin-tailwind";

const rootDir = path.resolve(import.meta.dir, "..");
const outdir = path.resolve(rootDir, "dist");

// Clean output directory
await Bun.$`rm -rf ${outdir}`.quiet();

const result = await Bun.build({
  entrypoints: [path.join(rootDir, "src/index.ts")],
  outdir,
  minify: true,
  compile: true,
  sourcemap: "none",
  target: "bun",
  plugins: [tailwind],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`Build succeeded: ${result.outputs.length} files written to ${outdir}`);
