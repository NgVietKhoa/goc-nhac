# Góc Nhạc 🎵

Web nghe nhạc cá nhân (kiểu Spotify thu nhỏ), lấy nhạc từ YouTube Music qua [`youtubei.js`](https://ytjs.dev).
Chỉ một người dùng, bảo vệ bằng mật khẩu.

- **Backend**: Hono + TypeScript, chạy trên **Supabase Edge Function** (Deno). Cùng mã nguồn đó chạy được trên **Node** (dev local, tự host bằng Docker).
- **Database**: Postgres của Supabase (playlist, yêu thích, lịch sử, cache URL audio, rate limit).
- **Frontend**: React + Vite + Tailwind + Zustand, deploy lên **Vercel**.

```
Trình duyệt ──► Vercel (giao diện tĩnh)
     │  /api/*  (rewrite, cùng domain → cookie httpOnly hoạt động)
     ▼
Supabase Edge Function "api" ──► YouTube / YouTube Music (youtubei.js)
     │                         └► googlevideo (proxy audio, hỗ trợ Range)
     ▼
Supabase Postgres (schema goc_nhac)
```

## Tính năng

- Tìm kiếm (debounce 300 ms, gợi ý khi gõ, lọc Bài hát / Album / Nghệ sĩ / Playlist), trang chủ gợi ý và chip tâm trạng của YouTube Music.
- Trang album, nghệ sĩ, playlist YouTube (có nút lưu thành playlist của mình).
- Trình phát: phát/dừng, trước/sau, tua, âm lượng, trộn bài, lặp (tắt / tất cả / một bài), thích.
- Hàng đợi: kéo-thả sắp xếp, xóa bài, "Phát tiếp theo", "Thêm vào hàng đợi". Hết hàng đợi thì tự phát bài liên quan (tắt được).
- Màn hình Đang phát: nền theo màu chủ đạo của ảnh bìa, lời bài hát, tab Tiếp theo và Liên quan.
- Menu chuột phải / nút "…" trên mọi bài hát.
- Media Session (phím media, màn hình khóa điện thoại, ảnh bìa trên thông báo).
- Tải trước bài kế tiếp để chuyển bài không bị khựng.
- Nhớ trạng thái (bài đang phát, vị trí, hàng đợi, âm lượng) trong localStorage.
- Playlist của tôi, bài hát đã thích, lịch sử nghe (ghi khi nghe quá 30 giây).
- Responsive: trên điện thoại có thanh điều hướng dưới và mini player.
- Bài lỗi (chặn vùng, cần đăng nhập, đã bị xóa) → toast tiếng Việt rồi tự chuyển bài tiếp theo.

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

Yêu cầu: Node.js 20.19+ và một Postgres (Docker, hoặc dùng luôn Postgres của Supabase).

```bash
npm install
cp .env.example .env          # rồi điền APP_PASSWORD, SESSION_SECRET, DATABASE_URL

# Nếu chưa có Postgres: chạy tạm bằng Docker
docker run -d --name gocnhac-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17-alpine

npm run dev
```

- Giao diện: http://localhost:5173
- API (Node): http://localhost:3001/api. Server tự chạy migration trong `supabase/migrations` khi khởi động.

Tạo `SESSION_SECRET`: `openssl rand -hex 32`, hoặc `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### Kiểm tra backend bằng curl

```bash
# Đăng nhập, lưu cookie
curl -c jar.txt -X POST localhost:3001/api/auth/login -H 'content-type: application/json' -d '{"password":"<APP_PASSWORD>"}'

# Tìm kiếm
curl -b jar.txt "localhost:3001/api/search?q=noi%20nay%20co%20anh&type=song"

# Stream (206 + Content-Range), tua giữa bài
curl -b jar.txt -o bai.webm -D - -H 'Range: bytes=0-' localhost:3001/api/stream/qHpE45b4INk
curl -b jar.txt -o /dev/null -D - -H 'Range: bytes=2000000-' localhost:3001/api/stream/qHpE45b4INk
```

---

## 2. Deploy: backend lên Supabase

Cần [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm i -g supabase`, hoặc `npx supabase`).

1. **Tạo project** trên https://supabase.com. Ghi lại *Project ref* (chuỗi trong URL `https://<ref>.supabase.co`).

2. **Tạo bảng.** Chọn một trong hai cách:
   - Cách nhanh: mở Dashboard → SQL Editor, dán nội dung file `supabase/migrations/20260927000000_init.sql` rồi Run.
   - Dùng CLI:
     ```bash
     npx supabase login
     npx supabase link --project-ref <ref>
     npx supabase db push
     ```
   Mọi bảng nằm trong schema riêng `goc_nhac` (không public qua REST API) và đều bật RLS, nên anon key công khai không đọc được dữ liệu của bạn.

3. **Đặt secret** cho Edge Function:
   ```bash
   npx supabase secrets set APP_PASSWORD='mat-khau-cua-ban' SESSION_SECRET="$(openssl rand -hex 32)"
   ```
   `SUPABASE_DB_URL` do Supabase tự cấp, không cần đặt.

4. **Deploy function:**
   ```bash
   npx supabase functions deploy api --no-verify-jwt
   ```
   `--no-verify-jwt` (đã ghi sẵn trong `supabase/config.toml`) là bắt buộc. App dùng cookie riêng, còn thẻ `<audio>` không gửi được header JWT.

5. **Kiểm tra:** `curl https://<ref>.supabase.co/functions/v1/api/health` phải trả `{"ok":true}`.

## 3. Deploy: frontend lên Vercel

1. Sửa `client/vercel.json`: thay `YOUR_PROJECT_REF` bằng project ref của bạn.
2. Trên Vercel: **Add New → Project**, chọn repo, đặt **Root Directory = `client`**. Framework Vite được nhận tự động, không cần biến môi trường.
3. Deploy, rồi mở domain `*.vercel.app` và nhập mật khẩu.

Vì sao dùng rewrite `/api/*` thay vì gọi thẳng Supabase? Để API chạy **cùng domain** với giao diện. Khi đó cookie đăng nhập (httpOnly) là cookie "first-party", nên Safari/iPhone không chặn. Không cần cấu hình CORS.

> Muốn gọi API ở domain khác (không dùng rewrite) thì build frontend với `VITE_API_BASE=https://<ref>.supabase.co/functions/v1/api`, và đặt secret `CORS_ORIGIN=https://<domain-frontend>`. Cookie khi đó sẽ là `SameSite=None; Secure`, và Safari có thể chặn.

---

## 4. Tự host bằng Docker (phương án dự phòng)

Chạy cả API và giao diện trên một máy (VPS, máy ở nhà) kèm Postgres:

```bash
cp .env.example .env     # điền APP_PASSWORD, SESSION_SECRET
docker compose up -d --build
# mở http://localhost:3001
```

Dữ liệu nằm trong `./data` (Postgres và cache của youtubei.js). Có thể vẫn để giao diện trên Vercel và trỏ rewrite trong `vercel.json` về máy nhà (ví dụ qua Cloudflare Tunnel).

---

## 5. Giới hạn cần biết khi chạy trên Supabase

Các con số dưới đây lấy theo tài liệu Supabase lúc viết (09/2026); hãy đối chiếu với bảng giá hiện tại.

- **CPU 2 giây/request, thời gian chạy tối đa 150 giây (gói Free).** Lần đầu phát một bài, server phải phân tích player của YouTube để decipher URL. Việc này tốn CPU nên API trả `307` về chính nó. Request sau lấy URL đã lưu trong Postgres rồi mới stream, nên nhẹ. Tìm kiếm, album, nghệ sĩ… dùng instance không tải player.
- **Băng thông (egress):** audio đi qua Edge Function, khoảng 4–5 MB mỗi bài. Gói Free có 5 GB/tháng, tức khoảng 1.000 bài. Nghe nhiều thì nâng gói hoặc tự host bằng Docker.
- **IP datacenter:** YouTube có thể chặn IP của Supabase (lỗi *"YouTube đang chặn máy chủ vì nghi là bot"*). Khi đó xem mục 6, hoặc chuyển sang tự host ở nhà (IP dân dụng ít bị chặn hơn).

---

## 6. Khi YouTube thay đổi làm hỏng việc phát nhạc

Triệu chứng: mọi bài đều báo "Không phát được…", hoặc tìm kiếm được nhưng không nghe được. Làm lần lượt:

### 6.1. Cập nhật youtubei.js (sửa được đa số trường hợp)

Phiên bản được khai báo ở **hai nơi**, phải cập nhật cả hai:

```bash
npm install youtubei.js@latest -w server            # cho Node / Docker
# rồi sửa phiên bản trong supabase/functions/api/deno.json, ví dụ:
#   "youtubei.js": "npm:youtubei.js@18.2.0"
npx supabase functions deploy api --no-verify-jwt
```

Sau đó xóa cache URL cũ (SQL Editor): `delete from goc_nhac.stream_cache;`

### 6.2. Đổi thứ tự client InnerTube

Không có PO token thì YouTube chỉ cho tải khoảng 1 MB đầu với hầu hết client. Ở thời điểm viết (09/2026), `VISIONOS` vẫn tải được trọn bài nên được thử đầu tiên. Nếu nó hỏng, hãy đổi thứ tự:

```bash
npx supabase secrets set YT_CLIENTS=YTMUSIC,ANDROID_VR,IOS,MWEB,VISIONOS
```

Các giá trị hợp lệ nằm trong `InnerTubeClient` của youtubei.js (`IOS`, `WEB`, `MWEB`, `ANDROID`, `ANDROID_VR`, `VISIONOS`, `YTMUSIC`, `TV`, `TV_SIMPLY`, `WEB_EMBEDDED`…). Server tự thử lần lượt và kiểm tra thật sự tải được byte sau mốc 1 MB rồi mới dùng.

### 6.3. Đặt PO token

Khi gặp lỗi `BOT_CHECK` ("chặn vì nghi là bot") hoặc mọi client đều bị 403:

1. Mở https://music.youtube.com trong trình duyệt, **chưa đăng nhập**, rồi phát một bài bất kỳ.
2. DevTools → Network → lọc `player`. Mở request `youtubei/v1/player`, tab Payload (tên trường có thể thay đổi theo thời gian):
   - `serviceIntegrityDimensions.poToken` → giá trị cho `YT_PO_TOKEN`
   - `context.client.visitorData` → giá trị cho `YT_VISITOR_DATA`
3. Đặt secret rồi deploy lại:
   ```bash
   npx supabase secrets set YT_PO_TOKEN='...' YT_VISITOR_DATA='...'
   ```

PO token có hạn dùng (vài giờ đến vài ngày) và gắn với visitor data. Nếu cần chạy lâu dài, hãy dùng công cụ sinh token tự động (xem [hướng dẫn PO token của youtubei.js](https://ytjs.dev/guide/)).

### 6.4. Ghim `YT_PLAYER_ID`

Nếu player mới của YouTube làm hỏng việc decipher (log có "Failed to extract n/sig decipher function", hoặc URL bị 403 ngay từ đầu), hãy ghim một player cũ còn chạy:

```bash
npx supabase secrets set YT_PLAYER_ID=7460dd14
```

Mã player đang dùng được in trong log khi khởi động (Node: `YouTube sẵn sàng (player …)`). Hãy ghi lại một mã đang chạy tốt để dùng khi cần. Nhớ bỏ ghim sau khi đã cập nhật youtubei.js.

### Xem log

- Supabase: Dashboard → Edge Functions → `api` → Logs.
- Node / Docker: `docker compose logs -f app`.

---

## Cấu trúc thư mục

```
supabase/
  config.toml                     # verify_jwt = false cho function api
  migrations/…_init.sql           # schema goc_nhac (tracks, playlists, likes, history, stream_cache, rate_limits)
  functions/api/
    index.ts                      # điểm vào Deno (Supabase)
    deno.json                     # import map: hono, youtubei.js, postgres
    src/
      app.ts  routes.ts  middleware.ts  validate.ts  env.ts  errors.ts
      types.ts                    # type gọn dùng chung với frontend (Track, Album, Artist, Playlist…)
      youtube/client.ts           # Innertube dùng chung + trình thông dịch JS (Platform.shim.eval)
      youtube/service.ts          # mọi lời gọi youtubei.js cho tìm kiếm/album/nghệ sĩ/lời bài hát…
      youtube/normalize.ts        # chuyển node của youtubei.js → type của app
      youtube/stream.ts           # chọn định dạng, decipher, cache 5 giờ, proxy Range
      db/sql.ts  db/repos.ts      # postgres.js
server/
  node.ts  migrate.ts             # chạy cùng API trên Node (dev / Docker)
client/
  vercel.json                     # rewrite /api → Supabase
  src/
    audio/engine.ts               # 2 thẻ <audio> (phát + tải trước), autoplay, Media Session, lịch sử
    audio/shortcuts.ts
    store/                        # Zustand: player (persist), library, ui, toast
    components/  pages/
```

## Bảo mật

- Toàn bộ API (trừ `/api/auth/*` và `/api/health`) yêu cầu cookie `gn_session`: httpOnly, ký HMAC-SHA256, sống 30 ngày. Nút "Khóa ứng dụng" dùng để đăng xuất. Đổi `SESSION_SECRET` sẽ đăng xuất mọi thiết bị.
- Rate limit lưu trong Postgres, dùng chung giữa các instance: đăng nhập 5 lần/phút/IP và 20 lần/phút tổng; tìm kiếm 30 lần/phút; stream 120 request/phút.
- Proxy ảnh chỉ nhận ảnh từ `googleusercontent.com`, `ytimg.com`, `ggpht.com`.
