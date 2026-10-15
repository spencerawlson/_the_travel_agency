#!/usr/bin/env python3
"""Generate Farelune brand icon/splash sets for the Capacitor native projects.
Source: mobile-assets/icon-1024.png (coral disc + white plane, from src/app/icon.svg).
Runs from global-travel-platform/apps/web."""
from PIL import Image, ImageDraw
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(HERE, "mobile-assets", "icon-1024.png")
RES = os.path.join(HERE, "android", "app", "src", "main", "res")
IOS_ICON = os.path.join(HERE, "ios", "App", "App", "Assets.xcassets",
                        "AppIcon.appiconset", "AppIcon-512@2x.png")

BG_COLOR = (236, 111, 75, 255)       # coral midpoint #EC6F4B
SPLASH_BG = (255, 247, 241, 255)     # warm light #FFF7F1

icon = Image.open(SRC).convert("RGBA")
assert icon.size == (1024, 1024)

DENS = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FG = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
SPLASH = {
    "drawable-port-mdpi": (320, 480), "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280), "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
    "drawable-land-mdpi": (480, 320), "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720), "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
    "drawable": (480, 320),
}


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG")
    print("wrote", os.path.relpath(path, HERE), img.size)


for d, px in DENS.items():
    save(icon.resize((px, px), Image.LANCZOS),
         os.path.join(RES, f"mipmap-{d}", "ic_launcher.png"))
    # round variant: circular mask
    circ = Image.new("L", (px, px), 0)
    ImageDraw.Draw(circ).ellipse((0, 0, px, px), fill=255)
    save(Image.composite(icon.resize((px, px), Image.LANCZOS),
                         Image.new("RGBA", (px, px), (0, 0, 0, 0)), circ),
         os.path.join(RES, f"mipmap-{d}", "ic_launcher_round.png"))

for d, px in FG.items():
    # adaptive foreground: full-bleed disc; the launcher applies the mask
    save(icon.resize((px, px), Image.LANCZOS),
         os.path.join(RES, f"mipmap-{d}", "ic_launcher_foreground.png"))

for d, (w, h) in SPLASH.items():
    splash = Image.new("RGBA", (w, h), SPLASH_BG)
    mark_px = int(min(w, h) * 0.38)
    mark = icon.resize((mark_px, mark_px), Image.LANCZOS)
    splash.alpha_composite(mark, ((w - mark_px) // 2, (h - mark_px) // 2))
    save(splash, os.path.join(RES, d, "splash.png"))

save(icon, IOS_ICON)

# adaptive-icon background color -> brand coral
bg_path = os.path.join(RES, "values", "ic_launcher_background.xml")
with open(bg_path, "w") as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
            '    <color name="ic_launcher_background">#EC6F4B</color>\n</resources>\n')
print("wrote values/ic_launcher_background.xml (#EC6F4B)")
print("done")
