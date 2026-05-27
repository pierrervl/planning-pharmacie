"""Extrait CSS et JS du fichier HTML monolithique (si besoin de regénérer)."""
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent

# Pour regénérer : remettre le HTML monolithique puis lancer ce script.
# Le dépôt utilise déjà les fichiers séparés sous css/ et js/.

SECTION = re.compile(
    r"/\* =+\s*\n\s*(\d+\.[^\n]+)\n\s*=+ \*/",
    re.MULTILINE,
)


def split_sections(text: str) -> dict[str, str]:
    parts = SECTION.split(text)
    out = {}
    for i in range(1, len(parts), 2):
        title = parts[i].strip()
        body = parts[i + 1].strip() if i + 1 < len(parts) else ""
        out[title] = body
    return out


if __name__ == "__main__":
    html_path = BASE / "planning_personnel.html"
    if not html_path.read_text(encoding="utf-8").strip().startswith("<!DOCTYPE"):
        raise SystemExit("HTML déjà modulaire — rien à extraire.")

    html = html_path.read_text(encoding="utf-8")
    css = re.search(r"<style>(.*?)</style>", html, re.S).group(1).strip()
    (BASE / "css" / "planning.css").write_text(css, encoding="utf-8")
    print("Extraction depuis monolithe : non implémentée (fichiers déjà séparés).")
