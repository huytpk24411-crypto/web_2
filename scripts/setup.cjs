const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  root,
  projects,
  loadEnvironment,
  checkNode,
  runNpm,
  prepareMedia,
} = require("./workspace.cjs");
async function main() {
  checkNode();
  for (const project of projects) {
    console.log(`Installing locked dependencies: ${project}`);
    await runNpm(path.join(root, project), ["ci", "--no-audit", "--no-fund"]);
  }
  const file = path.join(root, "my-server-mongodb", ".env");
  if (!fs.existsSync(file)) fs.copyFileSync(file + ".example", file);
  loadEnvironment();
  if (!process.env.SESSION_SECRET) {
    const secret = crypto.randomBytes(48).toString("base64url");
    const content = fs
      .readFileSync(file, "utf8")
      .replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${secret}`);
    fs.writeFileSync(
      file,
      content.includes("SESSION_SECRET=")
        ? content
        : content + `\nSESSION_SECRET=${secret}\n`,
    );
    process.env.SESSION_SECRET = secret;
  }
  prepareMedia();
  const { restore } = require("../my-server-mongodb/scripts/restore-data.cjs");
  console.log(JSON.stringify(await restore(), null, 2));
  console.log(
    "Setup complete. Run npm start. Existing database data is preserved.",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
