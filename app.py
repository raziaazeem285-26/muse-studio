"""Muse Studio — Razia ka AI Workstation (separate website).
Free backends only: Jina Reader, Pollinations AI, YouTube oEmbed, Google News RSS.
No API keys. No private-data scraping.
"""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import urllib.request
import urllib.parse
import urllib.error
import json
import re
import xml.etree.ElementTree as ET

app = FastAPI(title="Muse Studio")
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def home():
    return FileResponse("static/index.html")


@app.get("/api/health")
def health():
    return {"ok": True, "service": "muse-studio"}


def http_get(url: str, timeout: int = 20) -> str:
    req = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


# ---------- AI Assistant (free LLM, no key) ----------

@app.post("/api/ask")
async def ask(req: Request):
    data = await req.json()
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return JSONResponse({"error": "Prompt khali hai."}, status_code=400)
    if len(prompt) > 2000:
        return JSONResponse({"error": "Prompt bohat lamba hai (max 2000 characters)."}, status_code=400)
    try:
        answer = http_get(
            "https://text.pollinations.ai/" + urllib.parse.quote(prompt),
            timeout=50,
        ).strip()
        if not answer:
            raise ValueError("empty")
        return {"answer": answer}
    except Exception:
        return JSONResponse(
            {"error": "AI service abhi jawab nahi de rahi. Thori der baad dobara try karein."},
            status_code=502,
        )


@app.post("/api/summarize")
async def summarize(req: Request):
    data = await req.json()
    text = (data.get("text") or "").strip()
    mode = (data.get("mode") or "khulasa").strip()
    if not text:
        return JSONResponse({"error": "Text khali hai."}, status_code=400)
    text = text[:6000]  # keep request light
    if mode == "nuktaat":
        instruction = (
            "Read the following text and list its most important points as short bullet points. "
            "Reply in simple Roman Urdu.\n\nTEXT:\n" + text
        )
    elif mode == "ideas":
        instruction = (
            "Read the following text and suggest 5 practical content ideas (video/blog topics) based on it, "
            "for an Islamic education YouTube channel. Reply in simple Roman Urdu with short bullet points.\n\nTEXT:\n" + text
        )
    else:
        instruction = (
            "Summarize the following text in simple Roman Urdu in 5-8 short lines. "
            "Keep it clear and easy.\n\nTEXT:\n" + text
        )
    try:
        answer = http_get(
            "https://text.pollinations.ai/" + urllib.parse.quote(instruction),
            timeout=50,
        ).strip()
        if not answer:
            raise ValueError("empty")
        return {"answer": answer}
    except Exception:
        return JSONResponse(
            {"error": "AI service abhi jawab nahi de rahi. Thori der baad dobara try karein."},
            status_code=502,
        )


# ---------- Web Reader (public pages only) ----------

@app.post("/api/read-url")
async def read_url(req: Request):
    data = await req.json()
    url = (data.get("url") or "").strip()
    if not url:
        return JSONResponse({"error": "URL khali hai."}, status_code=400)
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        md = http_get("https://r.jina.ai/" + url, timeout=25)
        # Jina returns markdown with a header; extract title if present
        title = ""
        m = re.search(r"^Title:\s*(.+)$", md, re.M)
        if m:
            title = m.group(1).strip()
        # strip the Jina header block for cleaner display
        body = re.sub(r"^Title:.*$", "", md, flags=re.M)
        body = re.sub(r"^URL Source:.*$", "", body, flags=re.M)
        body = re.sub(r"^Markdown Content:\s*", "", body, flags=re.M).strip()
        if len(body) < 50:
            return JSONResponse(
                {"error": "Is page se text nahi nikal saka (shayad login ya block hai)."},
                status_code=502,
            )
        return {"title": title, "text": body[:15000]}
    except Exception:
        return JSONResponse(
            {"error": "Page nahi parh saka. URL check karein ya thori der baad try karein."},
            status_code=502,
        )


# ---------- YouTube: public video info (oEmbed, no key) ----------

YOUTUBE_RE = re.compile(
    r"(?:youtube\.com/(?:watch\?v=|shorts/)|youtu\.be/)([A-Za-z0-9_-]{6,})"
)

@app.post("/api/video-info")
async def video_info(req: Request):
    data = await req.json()
    url = (data.get("url") or "").strip()
    if not url:
        return JSONResponse({"error": "URL khali hai."}, status_code=400)
    if "youtube.com" not in url and "youtu.be" not in url:
        return JSONResponse({"error": "Ye YouTube ka link nahi lag raha."}, status_code=400)
    try:
        raw = http_get(
            "https://www.youtube.com/oembed?url="
            + urllib.parse.quote(url, safe="")
            + "&format=json",
            timeout=15,
        )
        info = json.loads(raw)
        m = YOUTUBE_RE.search(url)
        vid = m.group(1) if m else ""
        return {
            "title": info.get("title", ""),
            "author": info.get("author_name", ""),
            "author_url": info.get("author_url", ""),
            "thumbnail": info.get("thumbnail_url", ""),
            "video_id": vid,
            "watch_url": f"https://www.youtube.com/watch?v={vid}" if vid else url,
        }
    except urllib.error.HTTPError:
        return JSONResponse(
            {"error": "Video nahi mili. Link check karein (private/deleted to nahi?)."},
            status_code=502,
        )
    except Exception:
        return JSONResponse(
            {"error": "YouTube se info nahi mil saki. Thori der baad try karein."},
            status_code=502,
        )


# ---------- Trends: Google News RSS (free, no key) ----------

@app.get("/api/trends")
def trends(q: str = "Islamic"):
    q = (q or "Islamic").strip()[:80]
    try:
        rss = http_get(
            "https://news.google.com/rss/search?q="
            + urllib.parse.quote(q)
            + "&hl=en&gl=US&ceid=US:en",
            timeout=20,
        )
        root = ET.fromstring(rss)
        items = []
        for item in root.iter("item"):
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            pub = (item.findtext("pubDate") or "").strip()
            src_el = item.find("source")
            source = (src_el.text or "").strip() if src_el is not None else ""
            if title and link and not title.startswith('"'):
                items.append(
                    {"title": title, "link": link, "source": source, "date": pub}
                )
            if len(items) >= 12:
                break
        return {"query": q, "items": items}
    except Exception:
        return JSONResponse(
            {"error": "Trends abhi nahi mil sake. Thori der baad try karein."},
            status_code=502,
        )


# ---------- Islamic tools (free APIs, no key) ----------

@app.get("/api/prayer-times")
def prayer_times(city: str = "Karachi", country: str = "Pakistan"):
    city = (city or "Karachi").strip()[:60]
    country = (country or "Pakistan").strip()[:60]
    try:
        raw = http_get(
            "https://api.aladhan.com/v1/timingsByCity?city="
            + urllib.parse.quote(city)
            + "&country="
            + urllib.parse.quote(country)
            + "&method=1",  # University of Islamic Sciences, Karachi
            timeout=20,
        )
        data = json.loads(raw)
        t = data["data"]["timings"]
        date = data["data"]["date"]["readable"]
        hijri = data["data"]["date"]["hijri"]
        keys = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"]
        return {
            "city": city,
            "country": country,
            "date": date,
            "hijri": f"{hijri['day']} {hijri['month']['en']} {hijri['year']} AH",
            "times": {k: (t.get(k, "")[:5]) for k in keys},
        }
    except Exception:
        return JSONResponse(
            {"error": "Namaz timings nahi mil sakin. City/country check karein."},
            status_code=502,
        )


@app.get("/api/random-ayah")
def random_ayah():
    import random

    n = random.randint(1, 6236)
    try:
        raw = http_get(
            f"https://api.alquran.cloud/v1/ayah/{n}/editions/quran-uthmani,ur.jalandhry",
            timeout=20,
        )
        data = json.loads(raw)["data"]
        arabic, urdu, ref = "", "", ""
        for e in data:
            lang = e["edition"]["language"]
            if lang == "ar":
                arabic = e["text"]
                s = e["surah"]
                ref = f"{s['englishName']} ({s['number']}:{e['numberInSurah']})"
            elif lang == "ur":
                urdu = e["text"]
        if not arabic:
            raise ValueError("empty")
        return {"arabic": arabic, "urdu": urdu, "reference": ref}
    except Exception:
        return JSONResponse(
            {"error": "Ayah nahi mil saki. Dobara try karein."}, status_code=502
        )

