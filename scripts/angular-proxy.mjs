import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(path.join(root, "my-server-mongodb", ".env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const apiPort = Number(process.env.API_PORT || 3002);
const uploadPort = Number(process.env.UPLOAD_PORT || 3000);
function listening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}
async function ensureLocalServers() {
  if (process.env.IHOUZZ_MANAGED_START === "1") return;
  const children = [];
  process.once("exit", () =>
    children.forEach((child) => child.exitCode === null && child.kill()),
  );
  for (const [directory, port] of [
    ["my-server-mongodb", apiPort],
    ["my-server", uploadPort],
  ]) {
    if (await listening(port)) continue;
    const child = spawn(process.execPath, ["index.js"], {
      cwd: path.join(root, directory),
      stdio: "inherit",
      windowsHide: true,
    });
    children.push(child);
    const end = Date.now() + 30000;
    while (
      child.exitCode === null &&
      Date.now() < end &&
      !(await listening(port))
    )
      await new Promise((resolve) => setTimeout(resolve, 300));
    if (!(await listening(port)))
      throw new Error(
        `${directory} failed to start on ${port}. Run npm run setup and check MongoDB.`,
      );
  }
}
export async function createPortalProxy(portal) {
  if (!["customer", "employee", "admin"].includes(portal))
    throw new Error("Invalid portal");
  await ensureLocalServers();
  const upload = {
    target: `http://127.0.0.1:${uploadPort}`,
    secure: false,
    changeOrigin: true,
  };
  return [
    { context: ["/api"], ...upload },
    { context: ["/uploads"], ...upload },
    {
      context: [
        "/data",
        "/user-login",
        "/user-register",
        "/auth",
        "/viewing-cart",
        "/favorites/",
        "/contact-requests",
        "^/viewings(?:\\?|$)",
        "/viewings/mine",
        "^/viewings/[^/]+/(cancel|assign|status)(?:\\?|$)",
        "^/viewings/(?!new(?:[/?#]|$))[^/?]+(?:\\?|$)",
        "/viewing-details",
        "/notifications",
        "/audit-logs",
      ],
      target: `http://127.0.0.1:${apiPort}`,
      headers: { "X-iHouzz-Portal": portal },
      secure: false,
      changeOrigin: true,
    },
  ];
}
