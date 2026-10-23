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

  // core vẫn tải từ CDN qua toBlobURL (tránh CORS)
  const coreURL = await toBlobURL(
    "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js",
    "text/javascript"
  );
  const wasmURL = await toBlobURL(
    "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm",
    "application/wasm"
  );

  // ✅ Worker phải cùng origin với trang — trỏ đến file local
  const classWorkerURL = `${location.origin}/ffmpeg/worker.js`;

  await ffmpeg.load({ coreURL, wasmURL, classWorkerURL });

  ffmpegLoaded = true;
  log("✅ FFmpeg đã sẵn sàng.");
}
