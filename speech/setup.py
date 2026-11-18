"""Asentaa paikallisen puhepalvelun: virtuaaliympäristö speech/.venv, Piper ja suomenkielinen ääni.

Käyttö:  npm run speech:setup   (tai: python speech/setup.py)
Ääni: fi_FI-harri-medium (rhasspy/piper-voices, Hugging Face). Äänen koulutusdata: CC0.
"""

from __future__ import annotations

import subprocess
import sys
import urllib.request
import venv
from pathlib import Path

# Windows-konsoli ja pm2-lokit: tulosteet aina UTF-8:na (ääkköset).
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

HERE = Path(__file__).parent
VENV = HERE / ".venv"
VOICES = HERE / "voices"
VOICE_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/fi/fi_FI/harri/medium/"
VOICE_FILES = ["fi_FI-harri-medium.onnx", "fi_FI-harri-medium.onnx.json"]


def main() -> None:
    python = VENV / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    if not python.exists():
        print(f"Luodaan virtuaaliympäristö {VENV} ...")
        venv.create(VENV, with_pip=True)
    print("Asennetaan riippuvuudet ...")
    subprocess.run([str(python), "-m", "pip", "install", "-q", "--upgrade", "pip"], check=True)
    subprocess.run([str(python), "-m", "pip", "install", "-q", "-r", str(HERE / "requirements.txt")], check=True)

    VOICES.mkdir(exist_ok=True)
    for name in VOICE_FILES:
        target = VOICES / name
        if target.exists():
            print(f"Ääni löytyy jo: {name}")
            continue
        print(f"Ladataan {name} ...")
        urllib.request.urlretrieve(VOICE_BASE + name, target)

    print("Valmis. Käynnistä palvelu: npm run bot:start (pm2) tai speech\\.venv\\Scripts\\python speech\\server.py")


if __name__ == "__main__":
    main()
