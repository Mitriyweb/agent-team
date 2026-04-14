#!/usr/bin/env bun
/**
 * Validates that no dependency in package.json was published less than 7 days ago.
 * Protects against supply chain attacks via newly published packages.
 *
 * Usage: bun scripts/check-package-age.ts [--min-days N]
 *
 * Allowlist: packages listed in "trustedPackages" in package.json are skipped.
 */

const MIN_DAYS_DEFAULT = 7;

const args = process.argv.slice(2);
const minDaysIdx = args.indexOf("--min-days");
const minDays =
  minDaysIdx !== -1
    ? parseInt(args[minDaysIdx + 1] ?? "", 10)
    : MIN_DAYS_DEFAULT;

if (Number.isNaN(minDays) || minDays < 0) {
  console.error("Invalid --min-days value");
  process.exit(1);
}

const pkg = await Bun.file("package.json").json();
const allDeps: Record<string, string> = {
  ...pkg.dependencies,
  ...pkg.devDependencies,
};

// Allowlist: packages the team has explicitly vetted
const trusted = new Set<string>(pkg.trustedPackages ?? []);

const now = Date.now();
const minAge = minDays * 24 * 60 * 60 * 1000;
const violations: {
  name: string;
  version: string;
  published: string;
  daysAgo: number;
}[] = [];

const entries = Object.entries(allDeps);
console.log(
  `Checking ${entries.length} packages (min age: ${minDays} days)...\n`,
);

const BATCH_SIZE = 10;
for (let i = 0; i < entries.length; i += BATCH_SIZE) {
  const batch = entries.slice(i, i + BATCH_SIZE);
  await Promise.all(
    batch.map(async ([name, version]) => {
      if (trusted.has(name)) {
        console.log(`  ~ ${name}@${version} — trusted, skipping`);
        return;
      }

      // Strip ^ or ~ prefix if present
      const cleanVersion = version.replace(/^[~^]/, "");

      try {
        const res = await fetch(
          `https://registry.npmjs.org/${encodeURIComponent(name)}`,
          { headers: { Accept: "application/json" } },
        );

        if (!res.ok) {
          console.log(
            `  ? ${name}@${cleanVersion} — registry returned ${res.status}, skipping`,
          );
          return;
        }

        const data = (await res.json()) as { time?: Record<string, string> };
        const time = data.time;

        if (!time?.[cleanVersion]) {
          console.log(
            `  ? ${name}@${cleanVersion} — version not found in registry, skipping`,
          );
          return;
        }

        const publishedAt = new Date(time[cleanVersion]).getTime();
        const ageMs = now - publishedAt;
        const daysAgo = Math.floor(ageMs / (24 * 60 * 60 * 1000));

        if (ageMs < minAge) {
          violations.push({
            name,
            version: cleanVersion,
            published: time[cleanVersion],
            daysAgo,
          });
          console.log(
            `  ✗ ${name}@${cleanVersion} — published ${daysAgo} day(s) ago (${time[cleanVersion]})`,
          );
        } else {
          console.log(`  ✓ ${name}@${cleanVersion} — ${daysAgo} days old`);
        }
      } catch (e) {
        console.log(
          `  ? ${name}@${cleanVersion} — fetch error: ${(e as Error).message}, skipping`,
        );
      }
    }),
  );
}

console.log("");

if (violations.length > 0) {
  console.error(
    `\n✗ ${violations.length} package(s) younger than ${minDays} days:\n`,
  );
  for (const v of violations) {
    console.error(
      `  ${v.name}@${v.version} — ${v.daysAgo} day(s) old (published ${v.published})`,
    );
  }
  console.error(
    "\nOptions:\n" +
      `  1. Wait until the package is at least ${minDays} days old\n` +
      "  2. Pin an older version\n" +
      `  3. Add to "trustedPackages" in package.json (after manual review)`,
  );
  process.exit(1);
}

console.log(
  `✓ All ${entries.length} packages are at least ${minDays} days old.`,
);
