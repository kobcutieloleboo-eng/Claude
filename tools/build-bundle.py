#!/usr/bin/env python3
"""Build the standalone single-file football-gm.html from the split sources.
Emits UTF-8 with <meta charset> FIRST so emojis/accents survive a local download."""
import re, sys, io

BASE = "/home/user/Claude"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/football-gm.html"

html = io.open(f"{BASE}/index.html", encoding="utf-8").read()
body = re.search(r"<body>\n(.*?)\n<script", html, re.S).group(1)
css = io.open(f"{BASE}/css/style.css", encoding="utf-8").read()
files = ["names.js","players.js","leagues1.js","leagues2.js","world.js",
         "legends.js","awards.js","crests.js","engine.js","app.js"]
js = "\n".join(io.open(f"{BASE}/js/{f}", encoding="utf-8").read() for f in files)

# charset MUST come first (within the first 1024 bytes, before any non-ASCII)
page = (
    '<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n'
    '<title>Football GM</title>\n'
    f"<style>\n{css}\n</style>\n"
    f"{body}\n"
    f"<script>\n{js}\n</script>\n"
)
# Write UTF-8 (no BOM) — the meta tag is the authoritative declaration.
with io.open(OUT, "w", encoding="utf-8") as f:
    f.write(page)
print(f"built {OUT} ({len(page.encode('utf-8'))} bytes, utf-8, charset-first)")
