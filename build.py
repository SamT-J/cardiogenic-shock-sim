"""Concatenate src/* and assets into a single self-contained cs-sim.html."""
import base64, pathlib, re, mimetypes

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
OUT = ROOT / "cs-sim.html"

def read(p):
    return p.read_text(encoding="utf-8")

def embed_assets():
    """Return a JS object literal mapping asset name -> data URI (echo clips, images)."""
    adir = ROOT / "assets"
    entries = []
    if adir.exists():
        for p in sorted(adir.rglob("*")):
            if p.is_file() and p.suffix.lower() in (".mp4", ".webm", ".gif", ".png", ".jpg", ".jpeg"):
                mime = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
                b64 = base64.b64encode(p.read_bytes()).decode("ascii")
                key = p.relative_to(adir).as_posix()
                entries.append(f'  "{key}": "data:{mime};base64,{b64}"')
    return "const ASSETS = {\n" + ",\n".join(entries) + "\n};\n"

def main():
    css = read(SRC / "style.css")
    body = read(SRC / "app.html")
    js_files = ["wave.js", "engine.js", "drugs.js", "scenarios.js", "views.js", "echo.js", "control.js", "main.js"]
    js = "\n\n".join(f"// ---- {n} ----\n" + read(SRC / n) for n in js_files)
    html = f"""<!doctype html>
<!--
  ============================================================================
  DO NOT USE FOR TRAINING

  Illustrative demonstration built for a single talk. The physiology is a
  simplified, unvalidated model. Drug doses, timings, responses, waveforms,
  echo findings and transfer logistics are illustrative and may be wrong.
  Do not use it to train or assess clinicians, and never to inform patient
  care. No warranty of any kind.
  ============================================================================
-->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cardiogenic Shock Sim</title>
<style>
{css}
</style>
</head>
<body>
{body}
<script>
{embed_assets()}
{js}
</script>
</body>
</html>
"""
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size/1024:.0f} KB)")

if __name__ == "__main__":
    main()
