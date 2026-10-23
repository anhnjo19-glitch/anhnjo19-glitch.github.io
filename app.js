import { FFmpeg } from "https://esm.sh/@ffmpeg/ffmpeg@0.12.10";
import { toBlobURL, fetchFile } from "https://esm.sh/@ffmpeg/util@0.12.1";

// Core vẫn có thể tải từ CDN và chuyển thành blob (tránh vấn đề CORS)
const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

const $ = (id) => document.getElementById(id);
const dropZone = $("dropZone"), fileInput = $("fileInput"), browseBtn = $("browseBtn");
const fileInfo = $("fileInfo"), convertBtn = $("convertBtn");
const progressWrap = $("progressWrap"), progressFill = $("progressFill"), progressText = $("progressText");
const logEl = $("log"), resultEl = $("result"), previewVideo = $("previewVideo"), downloadLink = $("downloadLink");

let selectedFile = null;
let ffmpeg = null;
let ffmpegLoaded = false;

function log(line) {
  logEl.hidden = false;
  logEl.textContent += line + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

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
  if (!file.type.startsWith("video/")) return alert("Vui lòng chọn file video!");
  if (file.size > 2 * 1024 * 1024 * 1024) return alert("File quá lớn (>2GB), không xử lý được.");

  selectedFile = file;
  fileInfo.textContent = `✅ ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  convertBtn.disabled = false;
  resultEl.hidden = true;
  logEl.textContent = "";
  logEl.hidden = true;
}

async function loadFFmpeg() {
  if (ffmpegLoaded) return;

  ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => log(message));
  ffmpeg.on("progress", ({ progress, time }) => {
    const pct = Math.max(0, Math.min(100, progress * 100));
    progressFill.style.width = pct + "%";
    progressText.textContent = `Đang xử lý... ${pct.toFixed(1)}% (${(time / 1e6).toFixed(1)}s)`;
  });

  progressWrap.hidden = false;
  progressText.textContent = "Đang tải FFmpeg core...";
  log("Đang tải FFmpeg...");

  const coreURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript");
  const wasmURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm");

  // ✅ Điểm sửa chữa quan trọng: worker.js phải cùng nguồn gốc với trang web.
  // Sử dụng location.origin để đảm bảo URL tuyệt đối, tránh bị phân giải thành đường dẫn file://
  const classWorkerURL = `${location.origin}/ffmpeg/worker.js`;

  await ffmpeg.load({
    coreURL,
    wasmURL,
    classWorkerURL,
  });

  ffmpegLoaded = true;
  log("✅ FFmpeg đã sẵn sàng.");
}

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
