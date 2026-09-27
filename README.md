# Góc Nhạc 🎵

Web nghe nhạc cá nhân (kiểu Spotify thu nhỏ), lấy nhạc từ YouTube Music qua [`youtubei.js`](https://ytjs.dev).
Chạy **hoàn toàn trên Vercel**, không cần database.

- **Frontend**: React + Vite + Tailwind + Zustand (file tĩnh trên Vercel).
- **Backend**: Hono + youtubei.js, chạy trong **một Vercel Function** (Node) ở `/api/*`. Mọi lời gọi YouTube nằm ở backend.
- **Dữ liệu cá nhân** (playlist, bài đã thích, lịch sử): lưu trong **localStorage** của trình duyệt, có nút xuất/nhập file sao lưu.

```
Trình duyệt ──► Vercel
                 ├─ /           giao diện tĩnh
                 └─ /api/*      Vercel Function ──► YouTube / YouTube Music
                                                  └► googlevideo (proxy audio, hỗ trợ Range)
localStorage: playlist, yêu thích, lịch sử, hàng đợi, âm lượng…
```

## Tính năng

- Tìm kiếm (debounce 300 ms, gợi ý khi gõ, lọc Bài hát / Album / Nghệ sĩ / Playlist), trang chủ gợi ý và chip tâm trạng của YouTube Music.
- Trang album, nghệ sĩ, playlist YouTube (có nút lưu thành playlist của mình).
- Trình phát: phát/dừng, trước/sau, tua, âm lượng, trộn bài, lặp (tắt / tất cả / một bài), thích.
- Hàng đợi: kéo-thả sắp xếp, xóa, "Phát tiếp theo", "Thêm vào hàng đợi"; hết hàng đợi tự phát bài liên quan (tắt được).
- Màn hình Đang phát: nền theo màu chủ đạo của ảnh bìa, lời bài hát, tab Tiếp theo / Liên quan.
- Menu chuột phải / nút "…" trên mọi bài hát.
- Media Session (phím media, màn hình khóa điện thoại, ảnh bìa trên thông báo).
- Tải trước bài kế tiếp để chuyển bài không bị khựng.
- Nhớ trạng thái (bài đang phát, vị trí, hàng đợi, âm lượng) trong localStorage.
- Responsive: điện thoại có thanh điều hướng dưới và mini player.
- Bài lỗi (chặn vùng, cần đăng nhập, đã bị xóa) → toast tiếng Việt rồi tự chuyển bài tiếp theo.
- Không cần đăng nhập. Muốn khóa app thì đặt biến `APP_PASSWORD` (mục 4).

### Phím tắt

| Phím | Tác dụng |
| --- | --- |
| Space | Phát / tạm dừng |
| ← / → | Tua lùi / tới 10 giây |
| Shift + ← / → | Bài trước / bài sau |
| ↑ / ↓ | Tăng / giảm âm lượng |
| L | Thích / bỏ thích bài đang phát |
| Esc | Đóng menu, hộp thoại, màn hình Đang phát |

---

## 1. Chạy trên máy (dev)

Yêu cầu: Node.js 20.19+.

```bash
npm install
cp .env.example .env     # mọi biến đều tùy chọn
npm run dev
```

- Giao diện: http://localhost:5173
- API (Node): http://localhost:3001/api

Kiểm tra backend bằng curl:

```bash
curl "localhost:3001/api/search?q=noi%20nay%20co%20anh&type=song"
curl -o bai.webm -D - -H 'Range: bytes=0-' localhost:3001/api/stream/qHpE45b4INk        # 206 + Content-Range
curl -o /dev/null -D - -H 'Range: bytes=2000000-' localhost:3001/api/stream/qHpE45b4INk  # tua giữa bài
```

## 2. Deploy lên Vercel

1. Vercel → **Add New → Project** → chọn repo này.
2. **Root Directory: để trống** (gốc repo). Framework Preset: **Other**. Lệnh build/cài đặt đã khai báo trong `vercel.json`, không cần sửa.
3. (Tùy chọn) Environment Variables: `APP_PASSWORD` + `SESSION_SECRET` nếu muốn khóa app; `YT_PROXY` nếu YouTube chặn IP của Vercel.
4. Deploy. Mở `https://<domain>.vercel.app/api/health` phải thấy `{"ok":true}`.
5. Nên đổi **Function Region** sang Singapore (`sin1`) cho gần Việt Nam: Project Settings → Functions → Function Region.

Cách build: `scripts/build-vercel.mjs` build giao diện rồi dùng esbuild đóng gói backend (`server/vercel.ts`) thành
`.vercel/output/functions/api.func` theo [Build Output API](https://vercel.com/docs/build-output-api/v3). Thử build trên máy: `node scripts/build-vercel.mjs`.

Giới hạn cần biết của Vercel:
- Mỗi response tối đa ~4,5 MB → với Range mở (`bytes=N-`) API chỉ trả tối đa 4 MB mỗi lần; trình duyệt tự xin tiếp phần còn lại.
- Audio đi qua function: ~4–5 MB mỗi bài, tính vào băng thông của Vercel (gói Hobby có hạn mức hằng tháng, xem bảng giá hiện tại).

## 3. Dữ liệu cá nhân

Playlist, bài đã thích, lịch sử nằm trong localStorage của **từng trình duyệt**: không đồng bộ giữa máy tính và điện thoại, và mất nếu xóa dữ liệu trang web.
Vào **Thư viện → Sao lưu dữ liệu → Xuất file** để giữ lại; **Nhập từ file** để khôi phục hoặc chuyển sang máy khác.

## 4. Khóa app bằng mật khẩu (tùy chọn)

Đặt 2 biến môi trường (Vercel hoặc `.env`):

```
APP_PASSWORD=mat-khau-cua-ban
SESSION_SECRET=<chuỗi ngẫu nhiên ≥ 32 ký tự>
```

Tạo `SESSION_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Khi có `APP_PASSWORD`, app hiện màn đăng nhập (cookie httpOnly, ký HMAC, nhớ 30 ngày) và nút "Khóa ứng dụng". Đổi `SESSION_SECRET` sẽ đăng xuất mọi thiết bị.

## 5. Tự host bằng Docker (dự phòng)

```bash
docker compose up -d --build     # mở http://localhost:3001
```

---

## 6. Khi YouTube thay đổi làm hỏng việc phát nhạc

Triệu chứng: mọi bài đều báo "Không phát được…", hoặc tìm kiếm được nhưng không nghe được. Xem log ở Vercel → Project → **Logs**.

### 6.1. Cập nhật youtubei.js (sửa được đa số trường hợp)

```bash
npm install youtubei.js@latest -w server
git commit -am "Cập nhật youtubei.js" && git push     # Vercel tự deploy lại
```

### 6.2. YouTube chặn IP máy chủ → dùng proxy

Nếu log báo `/youtubei/v1/player` bị 403 hoặc "nghi là bot" (`BOT_CHECK`), cho request lấy link và tải audio đi qua proxy (nên là proxy dân dụng / Việt Nam):

```
YT_PROXY=http://user:pass@host:port
YT_PROXY_ALL=1        # tùy chọn: cả tìm kiếm/album… cũng qua proxy
```

Đặt trong Vercel → Environment Variables rồi **Redeploy**. Mỗi bài tốn ~4–5 MB băng thông proxy.

### 6.3. Đổi thứ tự client InnerTube

Không có PO token, YouTube chỉ cho tải ~1 MB đầu với hầu hết client; hiện (09/2026) `VISIONOS` vẫn tải được trọn bài nên được thử đầu tiên. Nếu hỏng, đổi thứ tự, ví dụ `YT_CLIENTS=YTMUSIC,ANDROID_VR,IOS,MWEB,VISIONOS`. Server tự thử lần lượt và kiểm tra thật sự tải được byte sau mốc 1 MB rồi mới dùng.

### 6.4. Đặt PO token

Khi mọi client đều bị 403 / "nghi là bot":
1. Mở https://music.youtube.com (chưa đăng nhập), phát một bài.
2. DevTools → Network → request `youtubei/v1/player` → Payload (tên trường có thể thay đổi theo thời gian):
   `serviceIntegrityDimensions.poToken` → `YT_PO_TOKEN`, `context.client.visitorData` → `YT_VISITOR_DATA`.

PO token hết hạn sau vài giờ đến vài ngày; cần chạy lâu dài thì dùng công cụ sinh token tự động (xem [ytjs.dev](https://ytjs.dev/guide/)).

### 6.5. Ghim `YT_PLAYER_ID`

Khi player mới của YouTube làm hỏng decipher (log có "Failed to extract n/sig decipher function"), ghim một player cũ còn chạy, ví dụ `YT_PLAYER_ID=7460dd14` (mã player in trong log khi server Node khởi động: `YouTube sẵn sàng (player …)`). Bỏ ghim sau khi cập nhật youtubei.js.

---

## Cấu trúc thư mục

```
vercel.json                  # build bằng scripts/build-vercel.mjs
scripts/build-vercel.mjs     # giao diện → .vercel/output/static, backend → .vercel/output/functions/api.func
server/
  vercel.ts                  # điểm vào Vercel Function
  node.ts                    # chạy API bằng Node (dev / Docker)
  src/
    app.ts  routes.ts  middleware.ts  validate.ts  env.ts  errors.ts
    types.ts                 # type gọn dùng chung với frontend (Track, Album, Artist, Playlist…)
    youtube/client.ts        # Innertube dùng chung + trình thông dịch JS (Platform.shim.eval, node:vm)
    youtube/service.ts       # mọi lời gọi youtubei.js cho tìm kiếm/album/nghệ sĩ/lời bài hát…
    youtube/normalize.ts     # chuyển node của youtubei.js → type của app
    youtube/stream.ts        # chọn định dạng, decipher, cache 5 giờ, proxy Range, tự làm mới khi 403/chậm
    lib/proxyFetch.ts        # YT_PROXY
client/
  src/
    audio/engine.ts          # 2 thẻ <audio> (phát + tải trước), autoplay, Media Session, lịch sử
    store/                   # Zustand: player, library (localStorage), ui, toast
    components/  pages/
```

## Bảo mật

- Không đặt `APP_PASSWORD` thì ai có link cũng dùng được (kể cả băng thông proxy nếu có). Đặt `APP_PASSWORD` nếu chia sẻ link công khai.
- Rate limit trong bộ nhớ của mỗi instance: tìm kiếm 30 lần/phút/IP, stream 120 request/phút/IP, đăng nhập 5 lần/phút/IP.
- Proxy ảnh chỉ nhận ảnh từ `googleusercontent.com`, `ytimg.com`, `ggpht.com` và không đi theo redirect.
