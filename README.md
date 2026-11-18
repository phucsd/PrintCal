---
title: PrintCal
emoji: 🖨️
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 3000
pinned: false
license: mit
short_description: Smart Offset & Digital Print Pricing Calculator
---

# 🖨️ PrintCal – Hệ Thống Tính Giá In Offset & In Nhanh Thông Minh

**PrintCal** là ứng dụng tính giá in ấn (In Offset & In Nhanh Kỹ Thuật Số), bình trang – cắt xả giấy tự động, so sánh điểm hòa vốn và quản lý báo giá / đơn hàng xưởng in trên nền **Next.js 16 + React 19 + Native SQLite (`node:sqlite`)**.

---

## ✨ Tính Năng Chính

### 1. ⚡ Máy Tính Giá In Tự Động
- **Mẫu ấn phẩm nhanh**: Tờ rơi A4/A5, Danh thiếp, Brochure gấp 3, Catalogue nhiều trang, Hộp mỹ phẩm…
- **Bình trang & Xả giấy mẹ (`src/lib/engine/imposition.ts`)**:
  - Xếp lưới thẳng, xoay 90° hoặc ghép hỗn hợp 2 khối (thẳng + xoay) để đạt số con/tờ tối đa.
  - Tự động ràng buộc số con chẵn khi in Offset **Tự trở / Trở nhíp**, hoặc tự chuyển sang **In 2 bài** khi không thể xếp chẵn.
  - Tự động chừa khoảng cách tràn lề giữa các con khi có công đoạn **Bế định hình (`die_cut`)**, hoặc xếp xén chung dao cho ấn phẩm phẳng.
  - Duyệt toàn bộ phương án chia khổ giấy mẹ (chia 1, 2, 3, 4, 6, 8, 9, 12, 16…) và chọn tổ hợp **máy in + khổ cắt** có tổng chi phí thấp nhất.
- **3 chế độ định giá chuẩn xưởng (`src/lib/engine/pricing.ts`)**:
  - **In Offset**: Gói mở máy trọn gói (kèm bộ kẽm CMYK), bước nhảy mỗi 1.000 lượt vượt gói, tính thêm kẽm màu pha (màu thứ 5+), bù hao canh màu + bù hao gia công.
  - **In Nhanh Kèm Giấy (INTC)**: Trọn gói công in + phôi giấy cắt sẵn (`325×430` / `325×355 mm`), không bù hao, tự khớp mã giấy hoặc chọn nhanh mã INTC, phụ phí số lượng ít (`< 50` tờ, `< 100` tờ).
  - **In Nhanh Gia Công (Konica C12000)**: 5 khổ in đến Banner `330×1200 mm`, 7 nhóm chất liệu (Giấy theo định lượng, Decal, Decal trong, Giấy nhựa, PVC), tuỳ chọn **Khách tự cấp giấy** và **In mực trắng**.
- **Catalogue / Sách nhiều trang**: Tự quy đổi số trang thành số tờ ruột mỗi cuốn, cảnh báo khi số trang không chia hết cho 4.

### 2. 📊 Biểu Đồ Hòa Vốn & Sơ Đồ Bình Trang 2D
- **Sơ đồ SVG trực quan**: Chuyển đổi giữa **Bình trang trên tờ in máy** (hiển thị lề nhíp, vùng in, tràn lề, hướng xoay từng con) và **Sơ đồ xả giấy mẹ** (đường dao xén & tỷ lệ hao hụt).
- **Phân tích điểm hòa vốn (Break-even)**: Dùng chung một engine định giá duy nhất giữa bảng so sánh và kết quả chính, nội suy nhị phân tìm chính xác mốc số lượng mà Offset bắt đầu rẻ hơn In nhanh.

### 3. 🗂️ Quản Lý Danh Mục & Đơn Hàng (SQLite Native)
- Lưu trữ tại `data/printcal.db` (hỗ trợ biến môi trường `PRINTCAL_DATA_DIR`), migration theo `PRAGMA user_version` **không bao giờ ghi đè dữ liệu người dùng đã chỉnh sửa**.
- **Đơn hàng & Báo giá**: Lưu trọn bộ thông số kỹ thuật (`spec_json`), theo dõi tiến độ sản xuất 6 bước (*Báo giá → Đã duyệt / cọc → Đang in → Gia công → Hoàn thành → Đã giao*), mở lại bất kỳ đơn cũ nào vào máy tính giá.
- **Kho giá giấy**: Tìm kiếm không dấu, lọc theo nhóm giấy / nhà cung cấp / khổ mẹ, quản lý giá sỉ (`≥ 500` tờ) và giá lẻ (`< 500` tờ).
- **Máy in & Bảng giá**: Quản lý máy Offset, bảng giá In gia công Konica và bảng giá In nhanh kèm giấy INTC.
- **Gia công sau in**: 5 kiểu tính (`per_m2`, `per_sheet`, `per_product`, `die_cut`, `fixed`), hỗ trợ chọn 1 hoặc 2 mặt, giá tối thiểu và phí khuôn.
- **Khách hàng & Cài đặt**: Tự động liên kết khách theo SĐT khi lưu đơn, thống kê doanh thu đơn chốt, cấu hình thông tin nhà in & tài khoản ngân hàng.

### 4. 🖨️ Xuất Phiếu Báo Giá & Lệnh Sản Xuất A4
- Tách riêng `#print-root` chuẩn `@media print` khổ A4 (không bị cắt trang bởi khung cuộn modal).
- Chuyển đổi 1 chạm giữa **Phiếu Báo Giá Khách Hàng** và **Lệnh Sản Xuất Nội Bộ Xưởng** (kèm sơ đồ bình trang).
- **Copy Zalo**: Định dạng sẵn tin nhắn báo giá gọn đẹp để gửi nhanh qua Zalo / Messenger.

---

## 🚀 Cài Đặt & Chạy Ứng Dụng

Yêu cầu **Node.js ≥ 22.18** (khuyên dùng Node.js 24 LTS để có sẵn `node:sqlite` và chạy test TypeScript trực tiếp):

```bash
npm install
npm run dev
```

Truy cập `http://localhost:3000`.

### Kiểm thử & Build Production

```bash
npm test          # Chạy bộ unit test & database migration test (node:test)
npm run lint      # Kiểm tra ESLint (Next.js + TypeScript + React Hooks)
npm run build     # Build production
npm run start     # Chạy server production ở cổng 3000
```

### Chạy bằng Docker

```bash
docker build -t printcal .
docker run -p 3000:3000 -v printcal_data:/app/data printcal
```
