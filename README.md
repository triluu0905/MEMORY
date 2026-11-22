# MEMORY

MEMORY là không gian làm việc phòng thí nghiệm bằng tiếng Việt: quản lý dự án/mẫu thử, ghi quy trình, tính toán, biểu đồ, xuất báo cáo, tài khoản thật và lưu dữ liệu bằng PostgreSQL.

## Chạy trên máy cá nhân — không cần biết code

Bạn cần cài hai phần mềm miễn phí:

1. [Node.js 22 LTS](https://nodejs.org/) (chọn bản **LTS**).
2. [Docker Desktop](https://www.docker.com/products/docker-desktop/) và mở ứng dụng này trước khi làm bước 3.

Mở Terminal (macOS) hoặc PowerShell (Windows), sau đó chạy lần lượt các lệnh sau. Thay `YOUR_FOLDER` bằng nơi bạn muốn lưu project.

```sh
git clone https://github.com/triluu0905/MEMORY.git YOUR_FOLDER
cd YOUR_FOLDER
npm ci
cp .env.example .env
docker compose up -d db
npm run build
npm start
```

Truy cập **http://127.0.0.1:3000** trên trình duyệt. Tạo tài khoản mới với mật khẩu ít nhất 12 ký tự; tài khoản đầu tiên sẽ có workspace trống.

Trên Windows PowerShell, nếu `cp` không hoạt động, dùng:

```powershell
Copy-Item .env.example .env
```

Để dừng app: nhấn `Ctrl + C` trong Terminal đang chạy `npm start`. Database vẫn được giữ lại. Để mở lại vào lần sau:

```sh
cd YOUR_FOLDER
docker compose up -d db
npm start
```

## Dùng cùng AI coding agent

Sau khi đã `git clone`, mở thư mục `YOUR_FOLDER` bằng Codex, Cursor, Claude Code hoặc công cụ AI khác và gửi:

> Hãy đọc README.md, kiểm tra Docker Desktop đã chạy, sau đó chạy MEMORY local. Không thay đổi source, không xóa Docker volume hay dữ liệu. Báo lại URL để tôi mở app.

AI vẫn cần Docker Desktop đang mở. Nếu `npm`, `git` hoặc `docker` không được nhận diện, hãy cài đúng công cụ ở phần trên rồi mở lại Terminal.

## Các lệnh hữu ích

| Việc cần làm | Lệnh |
|---|---|
| Kiểm tra Docker database | `docker compose ps` |
| Xem log database | `docker compose logs -f db` |
| Dừng database, giữ dữ liệu | `docker compose stop db` |
| Kiểm tra kiểu TypeScript | `npm run typecheck` |
| Build bản chạy production | `npm run build` |
| Kiểm tra app/database | mở `http://127.0.0.1:3000/api/health` |

`docker compose down -v` **xóa toàn bộ dữ liệu database local**. Chỉ dùng khi bạn chắc chắn muốn làm mới dữ liệu.

## Cấu hình local

`.env.example` dùng tài khoản database local mặc định cho Docker Compose. Đây chỉ là tiện lợi cho máy cá nhân; không dùng mật khẩu đó trên server thật. File `.env` bị Git bỏ qua và không được upload.

Nếu bạn đã có PostgreSQL riêng, đổi `DATABASE_URL` trong `.env`, rồi tạo bảng bằng:

```sh
psql "$DATABASE_URL" -f server/schema.sql
```

## Kiểm thử

```sh
npm run typecheck
npm run build
TEST_DATABASE_URL=postgres://.../memory_test npm run test:integration
```

Integration test cần một database PostgreSQL thử nghiệm riêng và sẽ xóa dữ liệu test của chính nó.

## Đưa lên server

Server cần Node.js, PostgreSQL, `.env` với mật khẩu mạnh, thư mục upload bền vững, và reverse proxy HTTPS. Chạy `npm run build`, sau đó `npm start`; chỉ mở HTTPS qua reverse proxy, không public trực tiếp port Node.js hoặc PostgreSQL.
