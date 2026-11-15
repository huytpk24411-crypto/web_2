// Proxy của ng serve. Mỗi khi dev server khởi động (npm start, VS Code, công cụ preview…),
// file này bật my-server-mongodb (3002) và my-server (3000) nếu chúng chưa chạy, vì giao diện
// lấy toàn bộ dữ liệu qua API và sẽ báo "Không kết nối được máy chủ" khi thiếu server.
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const servers = [
  { name: 'api-mongodb', port: 3002, dir: path.join(root, 'my-server-mongodb') },
  { name: 'api-upload', port: 3000, dir: path.join(root, 'my-server') },
];

function isListening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(800);
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('timeout', () => (socket.destroy(), resolve(false)));
    socket.once('error', () => resolve(false));
  });
}

async function waitFor(port, ms) {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await isListening(port)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

const children = [];
process.once('exit', () => children.forEach((child) => child.exitCode === null && child.kill()));

if (!(await isListening(27017))) {
  console.warn(
    '[api] Chưa thấy MongoDB ở cổng 27017. Hãy bật dịch vụ MongoDB (services.msc → MongoDB Server).',
  );
}
for (const server of servers) {
  if (await isListening(server.port)) continue;
  const child = spawn(process.execPath, ['index.js'], {
    cwd: server.dir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const [stream, out] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    stream.on('data', (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/))
        if (line) out.write(`[${server.name}] ${line}\n`);
    });
  }
  children.push(child);
  if (!(await waitFor(server.port, 15000))) {
    console.error(
      `[api] ${server.name} không khởi động được ở cổng ${server.port}. Xem log phía trên.`,
    );
  }
}

// Tên cổng gửi kèm mỗi request tới API để server dùng cookie phiên riêng của cổng này.
const portal = { 'X-iHouzz-Portal': 'admin' };
const upload = { target: 'http://localhost:3000', secure: false, changeOrigin: true };
export default [
  { context: ['/api'], ...upload },
  { context: ['/uploads'], ...upload },
  {
    context: [
      '/data',
      '/user-login',
      '/user-register',
      '/auth',
      '/viewing-cart',
      '/favorites/',
      '/contact-requests',
      '^/viewings(?:\\?|$)',
      '/viewings/mine',
      '^/viewings/[^/]+/(cancel|assign|status)(?:\\?|$)',
      '/viewing-details',
      '/notifications',
      '/audit-logs',
    ],
    target: 'http://localhost:3002',
    headers: portal,
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
  },
];
