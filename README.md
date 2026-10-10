# Cơm — OCR phụ đề cho Firefox

Bản 0.1.0 đọc **chữ đã ghép vào hình ảnh video**, không cần lấy file video hoặc audio.
OCR và dữ liệu 4 ngôn ngữ đã nằm trong bộ code: **không cần npm, API key hay backend để đọc chữ**.
Dịch AI là tùy chọn; cần chạy backend local và cấu hình một model phù hợp.

## Cài và dùng ngay trên Firefox máy tính

1. Giải nén ZIP vào một thư mục cố định, ví dụ `D:\ComSubtitleOCR`.
2. Mở Firefox 128 trở lên, nhập `about:debugging`.
3. Chọn **This Firefox → Load Temporary Add-on…**.
4. Chọn **`extension/manifest.json`** trong thư mục đã giải nén.
5. Mở trang phim. Bấm nút Extensions (hình mảnh ghép) trên thanh công cụ, rồi chọn **Cơm — OCR phụ đề**. Có thể ghim vào thanh công cụ.
6. Nếu phim tự chuyển sang fullscreen, thoát fullscreen; bản đầu dùng trong chế độ thường hoặc rạp phim/theater.
7. Trong khung nổi, chọn **ngôn ngữ của chữ gốc**. Mặc định Trung giản thể.
8. Bấm **Chọn vùng**, kéo hình chữ nhật sát vùng phụ đề. Không chọn cả video nếu chữ chỉ ở bên dưới.
9. Bấm **Đọc một lần** để kiểm tra. Nếu chữ sai, thử **Ảnh gốc** thay vì **Chữ trắng trên video**.
10. Bấm **Bắt đầu** để quét liên tục, **Dừng** để dừng. Kéo tiêu đề khung để đổi vị trí; bấm × để đóng.

Đóng/mở lại Firefox sẽ mất add-on cài tạm. Làm lại bước 2–4. Sửa code thì bấm **Reload** trong `about:debugging`, rồi tải lại trang phim.
Muốn cài lâu dài vào Firefox thông thường: gửi gói extension lên Mozilla theo kênh **Unlisted / self-distributed**, tải `.xpi` đã ký về, cài qua `about:addons → bánh răng → Install Add-on From File…`.
Không thể cài lâu dài chỉ bằng đổi đuôi ZIP thành XPI; chữ ký vẫn cần thiết.

## Thử không cần website phim

Mở terminal trong thư mục code, chạy:

```console
python -m http.server 8000
```

Mở `http://127.0.0.1:8000/demo.html` trong Firefox. Chọn OCR **English**, xử lý **Chữ trắng trên video**, kéo vùng chữ trắng phía dưới màn hình demo. Bấm **Đọc một lần**, hoặc bật tự đổi câu trong demo rồi bấm **Bắt đầu**.
Trang demo chỉ mô phỏng chữ ghép vào khung hình, không phải trình phát phim thật.

## Tùy chọn: dịch AI sang tiếng Việt

Không bật checkbox dịch nếu Cơm chỉ muốn kiểm tra OCR.

Backend tương thích API chat completions kiểu OpenAI. Có thể dùng model local qua Ollama hoặc dịch vụ API mình đã có. Chất lượng/tốc độ phụ thuộc model; chỉ trả chi phí API nếu chọn nhà cung cấp trả phí.

### Windows PowerShell

Chạy trong thư mục code:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
# Điền tên chính xác của model đã có trong Ollama (xem bằng: ollama list).
$env:TRANSLATION_MODEL = "TEN_MODEL_DA_CAI"
$env:LLM_BASE_URL = "http://127.0.0.1:11434/v1"
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8787
```

Ollama và model phải được cài riêng; extension không cài chúng. Nếu dùng nhà cung cấp API, trước khi chạy uvicorn hãy đặt `LLM_BASE_URL` là base URL API tương thích (thường kết thúc `/v1`), `LLM_API_KEY` là API key, và `TRANSLATION_MODEL` là model ID của nhà cung cấp. Không ghi key trong extension hoặc commit vào git.

Mở `http://127.0.0.1:8787/health` để kiểm tra server. `model_configured: true` chỉ xác nhận có tên model, không đảm bảo model/provider gọi được.
Trên khung extension, bật **Dịch AI qua backend local**, chọn ngôn ngữ đích, rồi Bắt đầu.
Nếu lỗi 503: chưa đặt model. Lỗi 502: kiểm tra URL, model, key. Lỗi 504: model quá chậm.

### Linux/macOS

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
export TRANSLATION_MODEL="TEN_MODEL_DA_CAI"
export LLM_BASE_URL="http://127.0.0.1:11434/v1"
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8787
```

## Giới hạn và cách dùng tốt hơn

- Đây là prototype đọc chữ; **chưa có nhận diện âm thanh**, chưa tự nhận diện ngôn ngữ OCR. Cơm chọn ngôn ngữ chữ gốc. Model dịch được yêu cầu tự nhận diện ngôn ngữ của văn bản OCR.
- Chỉ quét **vùng nhìn thấy trên tab đang mở**. Chuyển tab thì dừng. Cuộn trang, thay đổi kích thước/zoom hoặc fullscreen thì cần chọn lại vùng.
- Chụp screenshot của tab tránh việc đọc canvas từ nguồn video khác domain. Nội dung có bảo vệ vẫn có thể ra khung đen. Không đảm bảo hoạt động với mọi website/trình phát.
- Fullscreen thật và Picture-in-Picture chưa hỗ trợ khung nổi. Dùng chế độ thường/theater.
- OCR có thể nhầm tên riêng, chữ nhỏ, chữ màu, nền nhiều chi tiết, và đọc cả chữ khác trong vùng đã chọn. Chọn sát phụ đề, tăng kích thước video hoặc thử xử lý ảnh gốc.
- Khoảng quét mặc định 1.200 ms là mục tiêu giữa các lần bắt đầu, không bảo đảm mỗi câu xử lý trong 1.200 ms. Chạy tuần tự để tránh xếp hàng ảnh cũ. Nếu OCR/dịch chậm, có thể bỏ lỡ câu ngắn; nên pause phim và dùng Đọc một lần khi cần.
- Kết quả không có timestamp chính xác theo video, nên có thể trễ so với lời thoại. Chữ giống hệt liên tiếp không dịch lại. Nếu không có chữ rõ, kết quả cũ được xóa sau khoảng 3,5 giây khi quét.
- Seek/pause chưa theo dõi trực tiếp trình phát. Chữ dịch cũ có thể còn một lúc sau khi tua; bấm Dừng/Bắt đầu để cập nhật.
- Panel ẩn ngắn lúc chụp, rồi hiện ngay khi chụp xong. Vị trí khung không che chữ gốc sẽ dễ xem hơn.

## Quyền và dữ liệu

- `activeTab`: chụp tab sau khi Cơm bấm extension. Không tự quét mọi tab.
- `storage`: nhớ lựa chọn ngôn ngữ, xử lý ảnh, khoảng quét.
- `http://127.0.0.1:8787/*`: kết nối server dịch tùy chọn.
- Ảnh được xử lý trong extension, không được gửi tới backend. OCR không cần mạng và không lưu lịch sử ảnh/phụ đề.
- Khi bật dịch, **văn bản OCR và ngôn ngữ đích** được gửi tới backend; nếu backend cấu hình API cloud, văn bản tiếp tục được gửi đến nhà cung cấp đó. Checkbox dịch mặc định tắt mỗi khi mở trang mới.
- Bộ nhớ cache dịch chỉ ở RAM, tối đa 200 câu; không ghi vào storage.

## Phát triển

`extension/` là bản dùng được ngay. `backend/` là server dịch tùy chọn. `scripts/build.mjs` copy runtime OCR và mô hình vào extension. `package-lock.json` khóa phiên bản dependency.

Nếu muốn rebuild, cài Node.js 22 trở lên:

```console
npm ci
npm run build
npm test
npm run lint
npm run pack
```

`npm run pack` tạo ZIP **chưa ký** để gửi Mozilla. Không bao gồm backend. OCR dùng Tesseract.js 6.0.1, dữ liệu chi_sim/chi_tra/eng/vie đã đóng gói. Xem `licenses/` và `THIRD_PARTY.md`.

Tài liệu chính thức:
- https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/
- https://extensionworkshop.com/documentation/publish/self-distribution/
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/captureVisibleTab
- https://github.com/naptha/tesseract.js
