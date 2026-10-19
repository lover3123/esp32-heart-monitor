"""Download candidate component photos from Wikimedia Commons (freely licensed).

Saves ~800px thumbnails to presentation/assets_raw/ and prints title + license
so the best candidates can be picked for the slide deck.
Standard library only.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "assets_raw")
os.makedirs(OUT, exist_ok=True)

API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "PulseMonitorClassProject/1.0 (educational use, local machine)"}

QUERIES = {
    "esp32": "ESP32 development board",
    "max30102": "MAX30102 pulse oximeter sensor",
    "max30100": "MAX30100 pulse oximeter",
    "pulseox": "pulse oximeter module sensor",
    "oled": "SSD1306 OLED display module",
    "pot": "potentiometer",
}


def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download(url, path):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as resp, open(path, "wb") as fh:
        fh.write(resp.read())


results = {}
for slug, query in QUERIES.items():
    try:
        data = api({
            "action": "query",
            "format": "json",
            "generator": "search",
            "gsrsearch": f"{query} filetype:bitmap",
            "gsrnamespace": "6",
            "gsrlimit": "8",
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiurlwidth": "800",
        })
    except Exception as exc:
        print(f"[{slug}] search failed: {exc}")
        continue

    pages = (data.get("query") or {}).get("pages", {})
    print(f"=== {slug}: {query} ===")
    items = []
    for page in sorted(pages.values(), key=lambda p: p.get("index", 999)):
        info = (page.get("imageinfo") or [{}])[0]
        thumb = info.get("thumburl")
        if not thumb:
            continue
        meta = info.get("extmetadata") or {}
        artist = (meta.get("Artist", {}) or {}).get("value", "?")
        artist = re.sub("<[^>]+>", "", artist).strip()[:70]
        lic = (meta.get("LicenseShortName", {}) or {}).get("value", "?")
        ext = os.path.splitext(urllib.parse.urlparse(thumb).path)[1] or ".jpg"
        fname = f"{slug}_{len(items) + 1}{ext}"
        path = os.path.join(OUT, fname)
        try:
            download(thumb, path)
        except Exception as exc:
            print(f"  download failed for {page.get('title')}: {exc}")
            continue
        items.append({"file": fname, "title": page.get("title"), "license": lic, "artist": artist})
        print(f"  [{len(items)}] {page.get('title')}")
        print(f"      file={fname} | license={lic} | artist={artist}")
    results[slug] = items

with open(os.path.join(OUT, "credits.json"), "w", encoding="utf-8") as fh:
    json.dump(results, fh, indent=2, ensure_ascii=False)
print("done")
