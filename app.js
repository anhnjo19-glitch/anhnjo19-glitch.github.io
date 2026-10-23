import { FFmpeg } from "https://esm.sh/@ffmpeg/ffmpeg@0.12.10";
import { toBlobURL, fetchFile } from "https://esm.sh/@ffmpeg/util@0.12.1";

const CORE_VERSION = "0.12.6";
const BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

// --- DOM refs ---
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const browseBtn = document.getElementById("browseBtn");
const fileInfo = document.getElementById("fileInfo");
const convertBtn = document.getElementById("convertBtn");
const progressWrap = document.getElementById("progressWrap");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const logEl = document.getElementById("log");
const resultEl = document.getElementById("result");
const previewVideo = document.getElementById("previewVideo");
const downloadLink = document.getElementById("downloadLink");

// --- State ---
let selectedFile = null;
let ffmpeg = null;
let ffmpegLoaded = false;

// --- Logging ---
function log(line) {
  logEl.hidden = false;
  logEl.textContent += line + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

// --- Chọn file ---
browseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});
dropZone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

["dragenter", "dragover"].forEach((evt) =>
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((evt) =>
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  })
);
dropZone.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
});

function handleFile(file) {
  if (!file) return;
  if (!file.type.startsWith("video/")) {
    alert("Vui lòng chọn file video!");
    return;
  }
  if (file.size > 2 * 1024 * 1024 * 1024) {
    alert("File quá lớn (>2GB). FFmpeg.wasm không xử lý được.");
    return;
  }
  selectedFile = file;
  fileInfo.textContent = `✅ ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  convertBtn.disabled = false;
  resultEl.hidden = true;
  logEl.textContent = "";
  logEl.hidden = true;
}

// --- Load FFmpeg ---
async function loadFFmpeg() {
  if (ffmpegLoaded) return;

  if (typeof SharedArrayBuffer === "undefined") {
    throw new Error(
      "Trình duyệt thiếu SharedArrayBuffer. Hãy mở web qua HTTPS và đảm bảo coi-serviceworker.js hoạt động (kiểm tra console có 'crossOriginIsolated = true')."
    );
  }

  ffmpeg = new FFmpeg();

  ffmpeg.on("log", ({ message }) => log(message));
  ffmpeg.on("progress", ({ progress, time }) => {
    const pct = Math.max(0, Math.min(100, progress * 100));
    progressFill.style.width = pct + "%";
    progressText.textContent = `Đang xử lý... ${pct.toFixed(1)}% (${(time / 1e6).toFixed(1)}s)`;
  });

  progressText.textContent = "Đang tải FFmpeg core (~30MB)...";
  log("Loading FFmpeg core...");

  const coreURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, "text/javascript");
  const wasmURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, "application/wasm");

  await ffmpeg.load({ coreURL, wasmURL });
  ffmpegLoaded = true;
  log("✅ FFmpeg sẵn sàng.");
}

// --- Convert ---
convertBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  convertBtn.disabled = true;
  resultEl.hidden = true;
  progressWrap.hidden = false;
  progressFill.style.width = "0%";

  try {
    await loadFFmpeg();

    progressText.textContent = "Đang đọc file...";
    await ffmpeg.writeFile("input.mp4", await fetchFile(selectedFile));

    // Đọc tham số từ UI
    const width = parseInt(document.getElementById("pWidth").value, 10);
    const fps   = parseInt(document.getElementById("pFps").value, 10);
    const qv    = parseInt(document.getElementById("pQ").value, 10);
    const rate  = document.getElementById("pRate").value;
    const ch    = document.getElementById("pCh").value;

    // Đây chính là lệnh CLI của bạn, chuyển sang dạng mảng
    const args = [
      "-i", "input.mp4",
      "-vf", `scale=${width}:-2,fps=${fps}`,
      "-c:v", "mjpeg",
      "-q:v", String(qv),
      "-pix_fmt", "yuvj420p",
      "-c:a", "pcm_s16le",
      "-ar", String(rate),
      "-ac", String(ch),
      "output.avi",
    ];

    log("\n$ ffmpeg " + args.join(" ") + "\n");
    progressText.textContent = "Đang chuyển đổi...";
    await ffmpeg.exec(args);

    progressText.textContent = "Đang tạo file kết quả...";
    const data = await ffmpeg.readFile("output.avi");
    const blob = new Blob([data.buffer], { type: "video/x-msvideo" });
    const url = URL.createObjectURL(blob);

    downloadLink.href = url;
    downloadLink.download = selectedFile.name.replace(/\.[^.]+$/, "") + ".avi";
    downloadLink.textContent = `⬇️ Tải xuống AVI (${(blob.size / 1024 / 1024).toFixed(2)} MB)`;

    previewVideo.src = url;
    resultEl.hidden = false;

    progressFill.style.width = "100%";
    progressText.textContent = "✅ Hoàn tất!";

    // Dọn dẹp FS ảo
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
