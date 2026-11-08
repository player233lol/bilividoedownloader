const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const bvid = extractBvid(tab?.url || "");
  if (bvid) {
    $("bv-input").value = bvid;
    loadVideo(bvid);
  } else {
    setStatus("未识别到 B 站视频页面，可手动输入", "");
  }

  $("load-btn").addEventListener("click", async () => {
    const raw = $("bv-input").value.trim();
    if (!raw) return;
    let bvid = extractBvid(raw);
    if (!bvid && /b23\.tv/i.test(raw)) {
      const real = await resolveShort(raw);
      bvid = extractBvid(real || "");
    }
    if (!bvid) {
      setStatus("无法识别 BV 号", "error");
      return;
    }
    loadVideo(bvid);
  });
}

function extractBvid(text) {
  if (!text) return null;
  const m = text.match(/BV[0-9A-Za-z]{10}/);
  return m ? m[0] : null;
}

async function resolveShort(raw) {
  try {
    const res = await chrome.runtime.sendMessage({ action: "resolveUrl", url: raw });
    return res?.url || "";
  } catch {
    return "";
  }
}

async function loadVideo(bvid) {
  setStatus("加载中...", "");
  $("content").innerHTML = "";
  try {
    const res = await chrome.runtime.sendMessage({ action: "getVideoInfo", bvid });
    if (!res.ok) throw new Error(res.error);
    render(res.data);
    setStatus("识别成功", "success");
  } catch (e) {
    setStatus("加载失败：" + (e.message || e), "error");
  }
}

function render(data) {
  const { bvid, title, pic, owner, pages } = data;
  const cover = pic ? pic.replace(/^http:\/\//, "https://") : "";
  const container = $("content");
  container.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "video-info";

  const t = document.createElement("div");
  t.className = "video-title";
  t.textContent = title || "未知标题";
  wrap.appendChild(t);

  const m = document.createElement("div");
  m.className = "video-meta";
  m.textContent = `UP主：${owner?.name || "未知"} · 共 ${pages?.length || 1} P`;
  wrap.appendChild(m);

  if (cover) {
    const btn = document.createElement("button");
    btn.className = "cover-btn";
    btn.textContent = "下载封面";
    btn.addEventListener("click", () => downloadCover(cover, bvid, btn));
    wrap.appendChild(btn);
  }

  const list = pages && pages.length ? pages : [{ cid: 0, page: 1, part: "" }];
  list.forEach((page, i) => {
    const p = page.page || i + 1;
    const cid = page.cid;

    const block = document.createElement("div");
    block.className = "page-block";

    const pt = document.createElement("div");
    pt.className = "page-title";
    pt.textContent = `P${p}${page.part ? " · " + page.part : ""}`;
    block.appendChild(pt);

    const row = document.createElement("div");
    row.className = "btn-row";

    const vBtn = document.createElement("button");
    vBtn.textContent = `下载 P${p} 视频`;
    vBtn.addEventListener("click", () => downloadMedia(bvid, cid, p, "video", vBtn));

    const aBtn = document.createElement("button");
    aBtn.textContent = `下载 P${p} 音频`;
    aBtn.addEventListener("click", () => downloadMedia(bvid, cid, p, "audio", aBtn));

    row.appendChild(vBtn);
    row.appendChild(aBtn);
    block.appendChild(row);
    wrap.appendChild(block);
  });

  container.appendChild(wrap);
}

async function downloadCover(url, bvid, btn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "下载中...";
  try {
    const res = await chrome.runtime.sendMessage({
      action: "download",
      urls: [url],
      filename: `${bvid}_cover.jpg`
    });
    if (!res.ok) throw new Error(res.error);
    btn.textContent = "已开始";
    setStatus("封面开始下载", "success");
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1500);
  } catch (e) {
    console.error(e);
    btn.textContent = "失败";
    setStatus("封面下载失败：" + (e.message || e), "error");
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 3000);
  }
}

async function downloadMedia(bvid, cid, p, type, btn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "获取中...";
  try {
    const res = await chrome.runtime.sendMessage({ action: "getPlayUrl", bvid, cid });
    if (!res.ok) throw new Error(res.error);
    const urls = type === "video" ? res.data.videoUrls : res.data.audioUrls;
    if (!urls || !urls.length) throw new Error("无可用地址");

    const ext = type === "video" ? "mp4" : "m4a";
    const dl = await chrome.runtime.sendMessage({
      action: "download",
      urls,
      filename: `${bvid}_P${p}_${type}.${ext}`
    });
    if (!dl.ok) throw new Error(dl.error);

    btn.textContent = "已开始";
    setStatus(`P${p} ${type} 开始下载`, "success");
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1500);
  } catch (e) {
    console.error(e);
    btn.textContent = "失败";
    setStatus(`P${p} ${type} 下载失败：` + (e.message || e), "error");
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 3000);
  }
}

function setStatus(text, type) {
  const el = $("status");
  el.textContent = text;
  el.className = "status" + (type ? " " + type : "");
}