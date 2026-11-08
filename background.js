const BILI_API = "https://api.bilibili.com";
const OFFSCREEN_URL = "offscreen.html";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.target === "offscreen") return;
  handleMessage(msg)
    .then(sendResponse)
    .catch((e) => {
      console.error("[BG] 处理消息失败:", e);
      sendResponse({ ok: false, error: e.message || String(e) });
    });
  return true;
});

async function handleMessage(msg) {
  switch (msg.action) {
    case "getVideoInfo":
      return { ok: true, data: await getVideoInfo(msg.bvid) };
    case "getPlayUrl":
      return { ok: true, data: await getPlayUrl(msg.bvid, msg.cid) };
    case "download":
      return { ok: true, id: await downloadMedia(msg.urls, msg.filename) };
    case "resolveUrl":
      return { ok: true, url: await resolveUrl(msg.url) };
    default:
      return { ok: false, error: "未知操作" };
  }
}

async function getVideoInfo(bvid) {
  const url = `${BILI_API}/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code !== 0) throw new Error(data.message || `API 错误 ${data.code}`);
  return data.data;
}

async function getPlayUrl(bvid, cid) {
  const url =
    `${BILI_API}/x/player/playurl?bvid=${encodeURIComponent(bvid)}` +
    `&cid=${cid}&qn=80&fnval=16&fnver=0&fourk=1`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code !== 0) throw new Error(data.message || `API 错误 ${data.code}`);
  const dash = data.data.dash;
  if (!dash) throw new Error("无 DASH 流，可能需要登录");
  const v = (dash.video || []).slice().sort((a, b) => b.id - a.id)[0];
  const a = (dash.audio || []).slice().sort((x, y) => y.bandwidth - x.bandwidth)[0];
  if (!v) throw new Error("无视频流");
  return {
    videoUrls: [v.baseUrl || v.base_url, ...(v.backupUrl || v.backup_url || [])].filter(Boolean),
    audioUrls: a
      ? [a.baseUrl || a.base_url, ...(a.backupUrl || a.backup_url || [])].filter(Boolean)
      : []
  };
}

async function resolveUrl(url) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    return res.url;
  } catch {
    return url;
  }
}

async function ensureOffscreen() {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"]
    });
    if (contexts.length > 0) return;
  }
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ["BLOBS"],
      justification: "下载需要自定义 Referer 的媒体文件"
    });
  } catch (e) {
    if (!String(e.message || e).includes("Only a single")) {
      console.error("[BG] 创建 Offscreen 失败:", e);
      throw e;
    }
  }
}

async function downloadMedia(urls, filename) {
  if (typeof chrome.downloads === "undefined") {
    throw new Error("chrome.downloads 不可用，请重新加载扩展");
  }

  await ensureOffscreen();

  const resp = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { target: "offscreen", action: "fetchBlob", urls },
      (r) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(r);
      }
    );
  });

  if (!resp || !resp.ok) throw new Error((resp && resp.error) || "获取 Blob 失败");

  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url: resp.blobUrl,
        filename,
        conflictAction: "uniquify",
        saveAs: false
      },
      (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(id);
      }
    );
  });
}