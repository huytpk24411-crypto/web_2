const path = require("node:path");
const {
  root,
  projects,
  runNpm,
  checkNode,
  prepareMedia,
} = require("./workspace.cjs");

(async () => {
  checkNode();
  for (const project of projects)
    await runNpm(path.join(root, project), ["ci", "--include=dev"]);
  prepareMedia();
  for (const [portal, base] of [
    ["customer", "/"],
    ["employee", "/staff/"],
    ["admin", "/management/"],
  ])
    await runNpm(path.join(root, `my-app-${portal}`), [
      "run",
      "build",
      "--",
      "--base-href",
      base,
    ]);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
