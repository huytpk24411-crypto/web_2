const fs = require("node:fs");
const path = require("node:path");
const { root, checkNode, runNpm } = require("./workspace.cjs");
const { PORTALS, vercelConfig } = require("./deployment-routes.cjs");

function packagePortals(workspaceRoot, backendUrl) {
  const config = vercelConfig(backendUrl);
  const sources = PORTALS.map(({ name, base }) => ({
    name,
    base,
    directory: path.join(workspaceRoot, `my-app-${name}/dist/my-app-${name}/browser`),
  }));
  for (const { directory, base } of sources) {
    const html = fs.readFileSync(path.join(directory, "index.html"), "utf8");
    if (!html.includes(`<base href="${base}">`)) {
      throw new Error(`Incorrect Angular base href in ${directory}`);
    }
  }
  const output = path.resolve(workspaceRoot, ".vercel", "output");
  // Never remove .vercel itself: it can contain Vercel account/project settings.
  if (path.relative(path.resolve(workspaceRoot), output) !== path.join(".vercel", "output")) {
    throw new Error("Build output must stay inside the workspace");
  }
  fs.rmSync(output, { recursive: true, force: true });
  const staticDirectory = path.join(output, "static");
  fs.mkdirSync(staticDirectory, { recursive: true });
  for (const { directory, base } of sources) {
    fs.cpSync(directory, path.join(staticDirectory, base.slice(1)), { recursive: true });
  }
  fs.writeFileSync(path.join(output, "config.json"), JSON.stringify(config, null, 2) + "\n");
  return output;
}

async function build() {
  checkNode();
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) throw new Error("Set BACKEND_URL to the Render HTTPS address in Vercel");
  vercelConfig(backendUrl);
  // Vercel only builds the three frontends; backend dependencies stay on Render.
  for (const { name, base } of PORTALS) {
    const directory = path.join(root, `my-app-${name}`);
    await runNpm(directory, ["ci", "--include=dev"]);
    await runNpm(directory, ["run", "build", "--", "--base-href", base]);
  }
  packagePortals(root, backendUrl);
  console.log("Vercel frontend ready: /, /staff/, /management/");
}

module.exports = { build, packagePortals };
if (require.main === module) {
  build().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
