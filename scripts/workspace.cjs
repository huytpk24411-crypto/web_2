const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const projects = [
  "my-server",
  "my-server-mongodb",
  "my-app-customer",
  "my-app-employee",
  "my-app-admin",
];
function loadEnvironment() {
  try {
    process.loadEnvFile(path.join(root, "my-server-mongodb", ".env"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
function checkNode() {
  const [major, minor, patch] = process.versions.node.split(".").map(Number);
  if (!(
    (major === 22 && (minor > 22 || (minor === 22 && patch >= 3))) ||
    (major === 24 && minor >= 15) ||
    major >= 26
  )) {
    throw new Error(
      "Use Node.js 24.15+ (24.x), 22.22.3+ (22.x), or 26+. Angular 22 requires this version.",
    );
  }
}
function runNpm(directory, args) {
  return new Promise((resolve, reject) => {
    // npm_execpath is supplied by npm on Windows and Unix; avoid a shell for path quoting.
    const npm = process.env.npm_execpath;
    const child = npm
      ? spawn(process.execPath, [npm, ...args], {
          cwd: directory,
          stdio: "inherit",
        })
      : spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, {
          cwd: directory,
          stdio: "inherit",
          shell: process.platform === "win32",
        });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(`npm ${args.join(" ")} failed (${code}) in ${directory}`),
          ),
    );
  });
}
function prepareMedia() {
  const publicDirectory = path.join(root, "my-server", "public");
  for (const [folder, filename] of [
    ["cccd", "demo-front.png"],
    ["cccd", "demo-back.png"],
    ["attendance", "demo-evidence.png"],
  ]) {
    const target = path.join(publicDirectory, "uploads", folder);
    fs.mkdirSync(target, { recursive: true });
    fs.copyFileSync(
      path.join(publicDirectory, "examples", filename),
      path.join(target, filename),
    );
  }
}
module.exports = {
  root,
  projects,
  loadEnvironment,
  checkNode,
  runNpm,
  prepareMedia,
};
