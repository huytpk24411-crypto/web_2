const path = require("node:path");
const { paymentReturnAppUrl } = require("../config/payment-return-url");

try {
  process.loadEnvFile(path.resolve(__dirname, "../.env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const names = ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY"];
const missing = names.filter((name) => !process.env[name]?.trim());
for (const name of names)
  console.log(
    `${name} ${missing.includes(name) ? "chưa cấu hình" : "đã có giá trị"}`,
  );

try {
  console.log(`Địa chỉ khách hàng ${paymentReturnAppUrl()}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

if (missing.length) {
  console.error(
    "Điền các biến còn thiếu trong my-server-mongodb/.env bằng thông tin kênh payOS của môi trường này, rồi khởi động lại API.",
  );
  process.exitCode = 1;
} else {
  console.log(
    "Đã có ba biến khóa. Cần dùng đúng kênh payOS và webhook của backend/database đang tạo đơn hàng.",
  );
}
