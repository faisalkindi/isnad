// Downloads Itqan's narrator data (manifest + 8 shards) into data/itqan/.
// Run: npx tsx scripts/download-itqan.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://r3genesi5.github.io/Itqan/app/data/rijal/";
const OUT = join(process.cwd(), "data", "itqan");

async function fetchToFile(name: string): Promise<number> {
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(OUT, name), buf);
  return buf.length;
}

async function download() {
  mkdirSync(OUT, { recursive: true });

  const res = await fetch(BASE + "manifest.json");
  if (!res.ok) throw new Error(`manifest.json: HTTP ${res.status}`);
  const manifest = await res.json();
  writeFileSync(
    join(OUT, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`manifest.json — total_profiles: ${manifest.total_profiles}`);

  let totalBytes = 0;
  for (const f of manifest.files as Array<{ name: string }>) {
    const bytes = await fetchToFile(f.name);
    totalBytes += bytes;
    console.log(`  ${f.name.padEnd(34)} ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  }

  console.log(
    `Downloaded ${manifest.files.length + 1} files, ` +
      `${(totalBytes / 1024 / 1024).toFixed(1)} MB total.`,
  );

  if (manifest.total_profiles !== 115735) {
    throw new Error(
      `Expected 115735 profiles, manifest reports ${manifest.total_profiles}`,
    );
  }
  console.log("Profile count verified: 115,735");
}

download().catch((err) => {
  console.error("Download failed:", err);
  process.exitCode = 1;
});
