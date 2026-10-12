"""Download curated, freely licensed photos from Wikimedia Commons, optimise them
to WebP, and write attribution data used by the site (photo credits page and
per-photo captions).

Input:  scripts/photos.manifest.json  {"<key>": {"file": "File:....jpg", "alt_en": ..., "alt_fr": ...,
                                                  "focus": "50% 50%"}}
Output: apps/web/public/photos/<key>-1600.webp, <key>-800.webp
        apps/web/src/content/photos.json  (credits: author, license, source URL)

Only CC0 / Public domain / CC BY / CC BY-SA licences are accepted. CC BY-SA images
are used unmodified apart from resizing and re-encoding, with attribution.

Usage (needs network + Pillow):
    python -m pip install pillow
    python scripts/fetch_photos.py
"""

from __future__ import annotations

import html
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "scripts" / "photos.manifest.json"
OUT_DIR = ROOT / "apps" / "web" / "public" / "photos"
CREDITS = ROOT / "apps" / "web" / "src" / "content" / "photos.json"
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "global-travel-platform-photo-pipeline/1.0 (https://github.com/spencerawlson/_the_travel_agency)"}
ALLOWED = ("CC0", "Public domain", "CC BY ", "CC BY-SA ")
SIZES = (1600, 800)


def fetch(url: str) -> bytes:
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as resp:  # noqa: S310 - fixed https host
                return resp.read()
        except Exception:
            if attempt == 4:
                raise
            time.sleep(10 * (attempt + 1))
    raise RuntimeError("unreachable")


def strip_tags(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value or "")).strip()


def file_info(title: str) -> dict:
    params = {
        "action": "query", "format": "json", "titles": title, "prop": "imageinfo",
        "iiprop": "url|extmetadata|size", "iiurlwidth": str(SIZES[0]),
    }
    data = json.loads(fetch(f"{API}?{urllib.parse.urlencode(params)}"))
    page = next(iter(data["query"]["pages"].values()))
    if "imageinfo" not in page:
        raise SystemExit(f"not found on Commons: {title}")
    info = page["imageinfo"][0]
    meta = info.get("extmetadata", {})
    license_name = strip_tags(meta.get("LicenseShortName", {}).get("value", ""))
    if not (license_name + " ").startswith(ALLOWED) and not license_name.startswith(ALLOWED):
        raise SystemExit(f"licence not allowed for {title}: {license_name!r}")
    return {
        "thumb": info["thumburl"],
        "source": info["descriptionurl"],
        "author": strip_tags(meta.get("Artist", {}).get("value", "")) or "Unknown",
        "license": license_name,
        "license_url": meta.get("LicenseUrl", {}).get("value"),
    }


def main() -> int:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    credits: dict[str, dict] = {}
    for key, entry in manifest.items():
        info = file_info(entry["file"])
        image = Image.open(io.BytesIO(fetch(info["thumb"]))).convert("RGB")
        for width in SIZES:
            img = image.copy()
            img.thumbnail((width, width * 2), Image.Resampling.LANCZOS)
            img.save(OUT_DIR / f"{key}-{width}.webp", "WEBP", quality=78, method=6)
        w, h = image.size
        credits[key] = {
            "src": f"/photos/{key}-1600.webp",
            "srcSmall": f"/photos/{key}-800.webp",
            "width": w,
            "height": h,
            "focus": entry.get("focus", "50% 50%"),
            "alt": {"en": entry["alt_en"], "fr": entry["alt_fr"]},
            "title": entry["file"].removeprefix("File:"),
            "author": info["author"][:200],
            "license": info["license"],
            "licenseUrl": info["license_url"],
            "source": info["source"],
        }
        print(f"{key:12} {info['license']:14} {info['author'][:40]}")
        time.sleep(2)  # be polite to Wikimedia
    CREDITS.write_text(json.dumps(credits, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(credits)} photos -> {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
