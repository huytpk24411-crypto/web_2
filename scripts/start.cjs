const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const {
  root,
  loadEnvironment,
  checkNode,
  prepareMedia,
} = require("./workspace.cjs");
const children = [];
let stopping = false;
function listening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = code;
}
function launch(name, directory, args) {
  const child = spawn(process.execPath, args, {
    cwd: path.join(root, directory),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, IHOUZZ_MANAGED_START: "1" },
    windowsHide: true,
  });
  children.push(child);
  for (const [stream, out] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ])
    stream.on("data", (data) => out.write(`[${name}] ${data}`));
  child.once("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.once("exit", (code) => {
    if (!stopping) {
      console.error(`${name} stopped (${code})`);
      stop(code || 1);
    }
  });
  return child;
}
async function wait(port, child, timeout) {
  const end = Date.now() + timeout;
  while (Date.now() < end && child.exitCode === null && !stopping) {
    if (await listening(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `Service on port ${port} did not become ready. Check the log above.`,
  );
}
async function main() {
  checkNode();
  loadEnvironment();
  prepareMedia();
  const ports = {
    api: Number(process.env.API_PORT || 3002),
    upload: Number(process.env.UPLOAD_PORT || 3000),
    customer: Number(process.env.CUSTOMER_PORT || 4200),
    employee: Number(process.env.EMPLOYEE_PORT || 4201),
    admin: Number(process.env.ADMIN_PORT || 4202),
  };
  if (
    new Set(Object.values(ports)).size !== 5 ||
    Object.values(ports).some(
      (port) => !Number.isInteger(port) || port < 1 || port > 65535,
    )
  )
    throw new Error("Five distinct ports from 1 to 65535 are required.");
  for (const [name, port] of Object.entries(ports))
    if (await listening(port))
      throw new Error(
        `${name}: port ${port} is in use. Stop that service or change its port in .env. No existing process was stopped.`,
      );
  // No implicit seed: run setup first. The API may perform its normal journal recovery.
  const api = launch("api", "my-server-mongodb", ["index.js"]);
  await wait(ports.api, api, 30000);
  const upload = launch("upload", "my-server", ["index.js"]);
  await wait(ports.upload, upload, 15000);
  const frontends = [];
  for (const portal of ["customer", "employee", "admin"])
    frontends.push([
      portal,
      launch(portal, `my-app-${portal}`, [
        "node_modules/@angular/cli/bin/ng.js",
        "serve",
        "--host",
        "127.0.0.1",
        "--port",
        String(ports[portal]),
      ]),
    ]);
  for (const [portal, child] of frontends) {
    await wait(ports[portal], child, 180000);
    console.log(`${portal}: http://127.0.0.1:${ports[portal]}`);
  }
  console.log(
    "All five services are ready. Ctrl+C stops only services started by this command.",
  );
}
process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
main().catch((error) => {
  console.error(error.message);
  stop(1);
});
