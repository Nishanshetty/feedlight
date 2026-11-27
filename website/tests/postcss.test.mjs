// The website is a separate npm project on Tailwind 3; the app root is on
// Tailwind 4. Vite (under Astro) searches upward for a PostCSS config, so a
// missing website/postcss.config.cjs silently hands the site's CSS to the
// root's @tailwindcss/postcss — which does not expand @tailwind base, and
// every page then fails with "`@layer base` is used but no matching
// `@tailwind base` directive is present". This test runs the config that
// search actually finds, so it fails when the boundary is removed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import loadConfig from "postcss-load-config";
import postcss from "postcss";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(site, "src/styles/global.css");

test("the site's CSS is processed by the website's own PostCSS config", async () => {
  // rc(ctx, path, options): the second argument is the directory to start
  // searching from, and the search walks upward from there.
  const { plugins, file } = await loadConfig({}, site);

  assert.equal(
    path.resolve(file),
    path.join(site, "postcss.config.cjs"),
    "PostCSS search left website/ and found the app root's config",
  );

  const css = await readFile(entry, "utf8");
  const result = await postcss(plugins).process(css, { from: entry });

  // Tailwind 3 expanded the directives: the base layer reset is in the output
  // and no @tailwind directive survived.
  assert.match(result.css, /box-sizing:\s*border-box/);
  assert.doesNotMatch(result.css, /@tailwind\s+(base|components|utilities)/);
});
