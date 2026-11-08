chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== "offscreen") return;
  if (msg.action === "fetchBlob") {
    fetchBlob(msg.urls)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true;
  }
  if (msg.action === "revoke" && msg.blobUrl) {
    try { URL.revokeObjectURL(msg.blobUrl); } catch {}
    sendResponse({ ok: true });
    return;
  }
});

async function fetchBlob(urls) {
  if (!urls || !urls.length) throw new Error("下载地址为空");
  let lastError;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        credentials: "include",
        referrer: "https://www.bilibili.com/",
        referrerPolicy: "origin"
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("text/html")) throw new Error("服务器返回 HTML，Referer 未生效");
      const blob = await res.blob();
      if (!blob.size) throw new Error("文件为空");

      const blobUrl = URL.createObjectURL(blob);

      setTimeout(() => {
        try { URL.revokeObjectURL(blobUrl); } catch {}
      }, 5 * 60 * 1000);

      return { ok: true, blobUrl, size: blob.size };
    } catch (e) {
      console.warn("[Offscreen] 地址失败:", url, e);
      lastError = e;
    }
  }
  throw lastError || new Error("所有地址均下载失败");
}