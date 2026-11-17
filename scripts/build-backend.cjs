const path = require("node:path");
const { root, checkNode, runNpm, prepareMedia } = require("./workspace.cjs");

(async () => {
  checkNode();
  for (const project of ["my-server", "my-server-mongodb"]) {
    await runNpm(path.join(root, project), ["ci", "--include=dev"]);
  }
  prepareMedia();
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
