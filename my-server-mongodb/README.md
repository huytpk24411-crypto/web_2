# iHOUZZ MongoDB API

Xem [hướng dẫn cài đặt và cấu trúc](../README.md). API dùng Express, CommonJS và MongoDB native driver. index.js chỉ khởi chạy; app.js ghép config, middleware, services và routes.

Lệnh: npm start, npm run dev, npm test, node scripts/check-data.cjs, node scripts/restore-data.cjs. Dữ liệu hiện tại trong data có manifest v2 và checksum; seed.js gọi cùng trình khôi phục an toàn, không ghi đè database có dữ liệu theo mặc định.
