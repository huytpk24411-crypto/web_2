const path = require("node:path");
const { root, runNpm, checkNode } = require("./workspace.cjs");
async function main() {
  checkNode();
  const action = process.argv[2];
  if (!["build", "test"].includes(action))
    throw new Error("Choose build or test.");
  for (const portal of ["customer", "employee", "admin"])
    await runNpm(path.join(root, `my-app-${portal}`), [
      "run",
      action === "test" ? "test:unit" : "build",
    ]);
  if (action === "test") {
    await runNpm(path.join(root, "my-server-mongodb"), ["run", "test"]);
    await runNpm(root, ["run", "test:deploy"]);
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
