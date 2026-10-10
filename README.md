# Cơm — OCR phụ đề cho Firefox

Bản 0.1.0 đọc **chữ đã ghép vào hình ảnh video**, không cần lấy file video hoặc audio.
OCR và dữ liệu 4 ngôn ngữ đã nằm trong bộ code: **không cần npm, API key hay backend để đọc chữ**.
Dịch AI là tùy chọn; cần chạy backend local và cấu hình một model phù hợp.

**Lọc nhiễu phụ đề** mặc định bật: lọc dòng/từ độ tin cậy thấp, giữ vùng chữ chính; với chế độ chữ trắng còn ưu tiên chữ có viền tối để hạn chế nhận nhầm da/quần áo sáng thành chữ. Nếu thiếu chữ thật, tắt lọc hoặc dùng Ảnh gốc. Vẫn nên chọn vùng sát 1–3 dòng phụ đề, tránh cả cảnh phim/logo. Bộ lọc chỉ giảm nhiễu, không đảm bảo loại hết ký tự sai.

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
10. Bấm **Bắt đầu** để quét liên tục. Khung tự thu gọn chỉ còn **bản dịch** nếu đã bật dịch AI, hoặc chữ OCR nếu chưa bật dịch. Kéo khung phụ đề để đổi vị trí.
11. Di chuột lên khung thu gọn để hiện nút **Cài đặt**, **Dừng**, **×**. Có thể dùng Tab để hiện các nút. **Cài đặt** mở lại giao diện đầy đủ và giữ nguyên vùng/ngôn ngữ; **Dừng** dừng quét và mở lại giao diện. Bấm biểu tượng extension cũng mở lại cài đặt.
12. Nếu có lỗi OCR/kết nối hoặc cần chọn lại vùng, khung tự mở để hiện thông báo. Khi chưa có kết quả, khung thu gọn hiện trạng thái chờ ngắn.

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
Nếu lỗi 503: chưa đặt model. Lỗi 502: kiểm tra URL, model, key hoặc nội dung bản dịch theo thông báo cụ thể trên extension. Lỗi 504: model quá chậm.

Backend đặt `temperature=0` và yêu cầu dịch toàn bộ nội dung sang ngôn ngữ đích, kể cả nguồn trộn nhiều ngôn ngữ; chỉ trả bản dịch, không kèm câu gốc hay giải thích. Đích tiếng Việt được yêu cầu có dấu và dịch cả tiếng Anh/Trung. Với đích Việt/Anh, nếu kết quả còn ký tự Trung/Nhật/Hàn, backend thử lại tối đa một lần với chỉ dẫn rõ hơn; nếu vẫn còn thì trả lỗi. Tổng thời gian hai lần gọi model giới hạn 40 giây. Kiểm tra ký tự chỉ phát hiện một số lỗi, không phát hiện được mọi trường hợp sai ngôn ngữ (ví dụ tiếng Anh còn sót trong bản dịch tiếng Việt).

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
- Ưu tiên crop trực tiếp từ `<video>` sẵn sàng khớp vùng OCR, có tính kích thước khung hình, vùng hiển thị, border/padding, `object-fit` và `object-position`. Chỉ ảnh crop được gửi tới background để xử lý ảnh/Tesseract. Popup không nằm trong ảnh này, nên có thể đè lên phụ đề gốc và kéo qua vùng OCR trong khi vẫn quét. Không sửa `src`/`crossOrigin` hay tải lại video đang phát.
- Nếu video chưa sẵn sàng, không tìm được video phù hợp, canvas bị CORS/SecurityError hoặc nội dung có bảo vệ, dùng chụp tab. Không vượt CORS/DRM; ảnh vẫn có thể đen. Phần cuối giao diện đầy đủ cho biết đường lấy ảnh và lý do dự phòng. Không đảm bảo hoạt động với mọi website/trình phát.
- Đọc video trực tiếp hiện chỉ hỗ trợ video trong trang chính và shadow DOM mở; **chưa đọc trực tiếp video trong iframe, kể cả iframe cùng origin**, hoặc shadow DOM đóng. Những trường hợp này dùng chụp tab. Layout xoay/3D, cú pháp object-position không hỗ trợ, nhiều video chồng nhau không xác định được video, hoặc vùng chọn bao gồm letterbox cũng dự phòng chụp tab. Đọc video chỉ lấy chữ đã ghép vào khung hình, không lấy phụ đề HTML/track hoặc logo phủ riêng trên trang.
- Ảnh video được giới hạn cạnh tối đa 2.400 px, tối đa 4 triệu pixel và data URL PNG tối đa 8 triệu ký tự. Background xác thực tab/frame/sender, định dạng và kích thước PNG trước decode; vùng OCR sau xử lý cũng được giới hạn kích thước.
- Fullscreen thật và Picture-in-Picture chưa hỗ trợ khung nổi. Dùng chế độ thường/theater.
- OCR có thể nhầm tên riêng, chữ nhỏ, chữ màu, nền nhiều chi tiết, và đọc cả chữ khác trong vùng đã chọn. Chọn sát phụ đề, tăng kích thước video hoặc thử xử lý ảnh gốc.
- Khoảng quét mặc định 1.200 ms là mục tiêu giữa các lần bắt đầu, không bảo đảm mỗi câu xử lý trong 1.200 ms. Chạy tuần tự để tránh xếp hàng ảnh cũ. Nếu OCR/dịch chậm, có thể bỏ lỡ câu ngắn; nên pause phim và dùng Đọc một lần khi cần.
- Kết quả không có timestamp chính xác theo video, nên có thể trễ so với lời thoại. Chỉ bỏ qua dịch lại khi đã có bản dịch hợp lệ cho cùng câu và cùng ngôn ngữ đích. Nếu chưa dịch thành công (lỗi hoặc đã dừng/đổi cấu hình khi đang chờ), cùng câu vẫn được phép dịch lại. Nếu không có chữ rõ, kết quả cũ được xóa sau khoảng 3,5 giây khi quét.
- Seek/pause chưa theo dõi trực tiếp trình phát. Chữ dịch cũ có thể còn một lúc sau khi tua; bấm Dừng/Bắt đầu để cập nhật.
- Khung luôn hiện khi OCR; chỉ ẩn khi đang chọn vùng. Với ảnh video trực tiếp, kéo/thả và che vùng OCR không ngưng quét. Với chụp tab, tạm bỏ qua lượt chụp mới khi kéo; nếu khung che vùng OCR thì giữ thu gọn và báo “Trang này cần đặt khung ngoài vùng OCR”. Kéo ra ngoài rồi thả sẽ tự tiếp tục ở lượt quét kế tiếp. Hủy kéo hoặc mất pointer capture cũng kết thúc trạng thái kéo. Không cần bấm Bắt đầu lại; Dừng/Đóng hoặc đổi cấu hình vẫn kết thúc phiên như trước.
- Giữ bản dịch cũ khi chờ dịch câu mới, trạng thái “Đang dịch…” chỉ nằm trong thông báo. Khi dừng hoặc đổi cấu hình, kết quả đang chờ bị bỏ qua; lượt quét mới chờ lượt OCR/dịch cũ kết thúc để tránh request chồng nhau.
- Khi dịch lỗi hoặc trả bản dịch rỗng/sai định dạng, quét dừng và hiển thị lý do cùng hướng dẫn thử lại. Bấm **Đọc một lần** hoặc **Bắt đầu** để dịch lại; không tự gọi backend liên tục khi lỗi. Khi mở rộng khung gần đáy màn hình, khung được kéo lên để thấy thông báo.

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

Kiểm tra backend bằng `python tests/backend.test.py` (hoặc `.\.venv\Scripts\python.exe` trong repo). `npm test` kiểm tra xử lý OCR, mapping video/crop/object-fit/object-position, giới hạn ảnh và sender, dự phòng CORS, giao vùng OCR, giữ bản dịch cũ, hủy kết quả sau dừng/đổi cấu hình, tuần tự request và thông báo lỗi backend. `node tests/browser-smoke.cjs` kiểm tra Firefox với video/canvas và OCR thật, API extension/dịch được mô phỏng; cần Playwright cùng Firefox và FFmpeg đi kèm cài riêng bằng `npx playwright install firefox`. Fixture video được tạo trong thư mục tạm rồi xóa. Các kiểm tra backend dùng provider giả, chưa chứng minh chất lượng hoặc tốc độ với Ollama thật.

`npm run pack` tạo ZIP **chưa ký** để gửi Mozilla. Không bao gồm backend. OCR dùng Tesseract.js 6.0.1, dữ liệu chi_sim/chi_tra/eng/vie đã đóng gói. Xem `licenses/` và `THIRD_PARTY.md`.

Tài liệu chính thức:
- https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/
- https://extensionworkshop.com/documentation/publish/self-distribution/
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/captureVisibleTab
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/object-fit
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/object-position
- https://github.com/naptha/tesseract.js
