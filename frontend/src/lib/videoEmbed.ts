export type VideoEmbedInfo = {
  src: string;
  provider: "youtube" | "vimeo";
};

/**
 * แปลงลิงก์ YouTube / Vimeo เป็น URL ฝังที่เล่นได้ (เฉพาะ https)
 */
export function getVideoEmbedInfo(raw: string): VideoEmbedInfo | null {
  const t = raw.trim();
  if (!t) return null;
  let url: URL;
  try {
    url = new URL(/\w+:\/\//.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.replace(/^www\./i, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id) return { src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`, provider: "youtube" };
  }

  if (host === "m.youtube.com" || host === "youtube.com" || host.endsWith(".youtube.com")) {
    if (url.pathname.startsWith("/embed/")) {
      const rest = url.pathname.slice("/embed/".length);
      const id = rest.split("/")[0];
      if (id)
        return {
          src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}${url.search}`,
          provider: "youtube",
        };
    }
    if (url.pathname.startsWith("/shorts/")) {
      const id = url.pathname.split("/").filter(Boolean)[1];
      if (id) return { src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`, provider: "youtube" };
    }
    const v = url.searchParams.get("v");
    if (v) return { src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}`, provider: "youtube" };
  }

  if (host === "youtube-nocookie.com" && url.pathname.startsWith("/embed/")) {
    return { src: url.toString(), provider: "youtube" };
  }

  if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const vid = parts[0] === "video" ? parts[1] : parts[0];
    if (vid && /^\d+$/.test(vid)) return { src: `https://player.vimeo.com/video/${vid}`, provider: "vimeo" };
  }

  if (host === "player.vimeo.com" && url.pathname.startsWith("/video/")) {
    return { src: url.toString(), provider: "vimeo" };
  }

  return null;
}
