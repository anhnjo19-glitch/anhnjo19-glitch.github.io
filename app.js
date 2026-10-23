import { FFmpeg } from "https://esm.sh/@ffmpeg/ffmpeg@0.12.10";
import { toBlobURL, fetchFile } from "https://esm.sh/@ffmpeg/util@0.12.1";

const CORE_VERSION = "0.12.6";
const BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

const $ = (id) => document.getElementById(id);
const dropZone = $("dropZone"), fileInput = $("fileInput"), browseBtn = $("browseBtn");
const fileInfo = $("fileInfo"), convertBtn = $("convertBtn");
const progressWrap = $("progressWrap"), progressFill = $("progressFill"), progressText = $("progressText");
const logEl = $("log"), resultEl = $("result"), previewVideo = $("previewVideo"), downloadLink = $("downloadLink");
const envWarning = $("envWarning");

let selectedFile = null;
let ffmpeg = null;
let ffmpegLoaded = false;

function log(line) {
  logEl.hidden = false;
  logEl.textContent += line + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

// ============================================================
// KIỂM TRA MÔI TRƯỜNG NGAY KHI TẢI TRANG
// ============================================================
async function checkEnvironment() {
  // 1. Secure context?
  if (!window.isSecureContext) {
    showWarning(
      "⚠️ Trang đang chạy ở chế độ <b>không bảo mật</b>. " +
      "Hãy mở qua <code>http://localhost</code> hoặc <code>https://</code>, " +
      "KHÔNG mở trực tiếp file HTML."
    );
    return;
  }

  // 2. SharedArrayBuffer?
  if (typeof SharedArrayBuffer !== "undefined" && window.crossOriginIsolated) {
    log("✅ Môi trường OK: crossOriginIsolated = true");
    return;
  }

  // 3. Thử chờ service worker kiểm soát trang
  progressText.textContent = "Đang thiết lập cross-origin isolation...";
  progressWrap.hidden = false;

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.ready;
      const reg = await navigator.serviceWorker.getRegistration();

      if (!reg) {
        showWarning(
          "⚠️ Service Worker chưa được đăng ký. " +
          "<button onclick='location.reload()' class='link-btn'>Tải lại trang</button> " +
          "hoặc kiểm tra Console xem có lỗi tải <code>coi-serviceworker.js</code> không."
        );
        return;
      }

      // Đợi 1 nhịp để header có hiệu lực
      await new Promise((r) => setTimeout(r, 500));

      if (window.crossOriginIsolated) {
        log("✅ Service Worker đã kích hoạt isolation.");
        return;
      }

      // Chưa isolated → gợi ý reload
      showWarning(
        "⚠️ Service Worker đã chạy nhưng trang chưa được cô lập. " +
        "<button onclick='location.reload()' class='link-btn'>Tải lại</button> " +
        "(có thể cần 1-2 lần).<br>" +
        "<small>Nếu vẫn lỗi, mở DevTools → Network, click 1 request bất kỳ, " +
        "xem Response Headers có <code>Cross-Origin-Opener-Policy</code> chưa.</small>"
      );
    } catch (e) {
      showWarning("⚠️ Lỗi Service Worker: " + e.message);
    }
  } else {
    showWarning("⚠️ Trình duyệt không hỗ trợ Service Worker.");
  }
}

function showWarning(html) {
  envWarning.hidden = false;
  envWarning.innerHTML = html;
  progressWrap.hidden = true;
}

// Chạy kiểm tra ngay
checkEnvironment();

// ============================================================
// CHỌN FILE
// ============================================================
browseBtn.addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });
dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

["dragenter", "dragover"].forEach((evt) =>
  dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add("dragover"); })
);
["dragleave", "drop"].forEach((evt) =>
  dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove("dragover"); })
);
dropZone.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
});

function handleFile(file) {
  if (!file) return;
  if (!file.type.startsWith("video/")) return alert("Chọn file video!");
  if (file.size > 2 * 1024 * 1024 * 1024) return alert("File > 2GB không xử lý được.");

  selectedFile = file;
  fileInfo.textContent = `✅ ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  convertBtn.disabled = false;
  resultEl.hidden = true;
  logEl.textContent = "";
  logEl.hidden = true;
}

// ============================================================
// LOAD FFMPEG
// ============================================================
async function loadFFmpeg() {
  if (ffmpegLoaded) return;

  // Kiểm tra lại lần cuối trước khi load
  if (typeof SharedArrayBuffer === "undefined" || !window.crossOriginIsolated) {
    throw new Error(
      "SharedArrayBuffer không khả dụng. Đảm bảo bạn đã tải lại trang ít nhất 1 lần sau khi service worker đăng ký."
    );
  }

  ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => log(message));
  ffmpeg.on("progress", ({ progress, time }) => {
    const pct = Math.max(0, Math.min(100, progress * 100));
    progressFill.style.width = pct + "%";
    progressText.textContent = `Đang xử lý... ${pct.toFixed(1)}% (${(time / 1e6).toFixed(1)}s)`;
  });

  progressWrap.hidden = false;
  progressText.textContent = "Đang tải FFmpeg core (~30MB)...";
  log("Loading FFmpeg core...");

  const coreURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, "text/javascript");
  const wasmURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, "application/wasm");

  await ffmpeg.load({ coreURL, wasmURL });
  ffmpegLoaded = true;
  log("✅ FFmpeg sẵn sàng.");
}

// ============================================================
// CHUYỂN ĐỔI
// ============================================================
convertBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  convertBtn.disabled = true;
  resultEl.hidden = true;
  progressWrap.hidden = false;
  progressFill.style.width = "0%";
  envWarning.hidden = true;

  try {
    await loadFFmpeg();

    progressText.textContent = "Đang đọc file...";
    await ffmpeg.writeFile("input.mp4", await fetchFile(selectedFile));

    const args = [
      "-i", "input.mp4",
      "-vf", `scale=${$("pWidth").value}:-2,fps=${$("pFps").value}`,
      "-c:v", "mjpeg",
      "-q:v", $("pQ").value,
      "-pix_fmt", "yuvj420p",
      "-c:a", "pcm_s16le",
      "-ar", $("pRate").value,
      "-ac", $("pCh").value,
      "output.avi",
    ];

    log("\n$ ffmpeg " + args.join(" ") + "\n");
    progressText.textContent = "Đang chuyển đổi...";
    await ffmpeg.exec(args);

    progressText.textContent = "Đang tạo file...";
    const data = await ffmpeg.readFile("output.avi");
    const blob = new Blob([data.buffer], { type: "video/x-msvideo" });
    const url = URL.createObjectURL(blob);

    downloadLink.href = url;
    downloadLink.download = selectedFile.name.replace(/\.[^.]+$/, "") + ".avi";
    downloadLink.textContent = `⬇️ Tải AVI (${(blob.size / 1024 / 1024).toFixed(2)} MB)`;

    previewVideo.src = url;
    resultEl.hidden = false;

    progressFill.style.width = "100%";
    progressText.textContent = "✅ Hoàn tất!";

    await ffmpeg.deleteFile("input.mp4").catch(() => {});
    await ffmpeg.deleteFile("output.avi").catch(() => {});
  } catch (err) {
    console.error(err);
    progressText.textContent = "❌ Lỗi: " + err.message;
    log("ERROR: " + err.message);
  } finally {
    convertBtn.disabled = false;
  }
});
