"""Paikallinen puhepalvelu botille (vaihe 2a): Piper-puhesynteesi suomeksi.

Käynnistys:  speech\\.venv\\Scripts\\python speech\\server.py   (pm2 käynnistää tämän automaattisesti)

Rajapinta (vain localhost):
    GET  /health  -> {"ok": true, "voice": "...", "sample_rate": 22050}
    POST /tts     {"text": "...", "length_scale": 1.0, "pitch": 1.0}
                  -> audio/ogg (Opus, 48 kHz mono), jonka Discord toistaa sellaisenaan

Ääni tuotetaan prosessorilla, joten palvelu ei kilpaile näytönohjaimesta Whisperin kanssa.
Teksti käsitellään vain muistissa eikä sitä tallenneta tai lokiteta.
"""

from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Windows-konsoli ja pm2-lokit: tulosteet aina UTF-8:na (ääkköset).
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

from piper import PiperVoice, SynthesisConfig

HERE = Path(__file__).parent
VOICE_PATH = Path(os.environ.get("PIPER_VOICE", HERE / "voices" / "fi_FI-harri-medium.onnx"))
HOST = "127.0.0.1"
PORT = int(os.environ.get("SPEECH_PORT", "5005"))
MAX_CHARS = 1000

voice = PiperVoice.load(str(VOICE_PATH))
SAMPLE_RATE = voice.config.sample_rate
# Piperin ONNX-istunto ei ole varmasti säieturvallinen: yksi tuotto kerrallaan (kesto ~0,2 s).
synth_lock = threading.Lock()


def clamp(value: object, lo: float, hi: float, default: float) -> float:
    try:
        v = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return min(hi, max(lo, v))


def synthesize_ogg(text: str, length_scale: float, pitch: float) -> bytes:
    """Piper -> WAV (22,05 kHz) -> FFmpeg: sävelkorkeus + Ogg/Opus 48 kHz."""
    buf = io.BytesIO()
    with synth_lock, wave.open(buf, "wb") as w:
        voice.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=length_scale))
    # Sävelkorkeus: näytetaajuuden muutos nostaa/laskee ääntä, atempo palauttaa tempon ennalleen.
    af = f"asetrate={int(SAMPLE_RATE * pitch)},aresample=48000,atempo={1 / pitch:.4f}"
    result = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", "-af", af, "-ac", "1", "-c:a", "libopus", "-b:a", "48k", "-f", "ogg", "pipe:1"],
        input=buf.getvalue(),
        capture_output=True,
        check=True,
    )
    return result.stdout


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:  # ei lokiteta pyyntöjä (sisältäisi tekstiä)
        pass

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(200, {"ok": True, "voice": VOICE_PATH.stem, "sample_rate": SAMPLE_RATE})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/tts":
            self._json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(min(length, 64_000)) or b"{}")
            text = str(data.get("text", "")).strip()[:MAX_CHARS]
            if not text:
                self._json(400, {"error": "text puuttuu"})
                return
            started = time.perf_counter()
            audio = synthesize_ogg(
                text,
                clamp(data.get("length_scale"), 0.5, 2.0, 1.0),
                clamp(data.get("pitch"), 0.6, 1.6, 1.0),
            )
            took_ms = int((time.perf_counter() - started) * 1000)
        except subprocess.CalledProcessError as err:
            print(f"FFmpeg-virhe: {err.stderr.decode(errors='replace')[:300]}", file=sys.stderr)
            self._json(500, {"error": "ffmpeg"})
            return
        except Exception as err:  # noqa: BLE001 - palvelu ei saa kaatua yksittäiseen pyyntöön
            print(f"TTS-virhe: {type(err).__name__}: {err}", file=sys.stderr)
            self._json(500, {"error": type(err).__name__})
            return

        self.send_response(200)
        self.send_header("Content-Type", "audio/ogg")
        self.send_header("Content-Length", str(len(audio)))
        self.send_header("X-Synthesis-Ms", str(took_ms))
        self.end_headers()
        self.wfile.write(audio)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Puhepalvelu käynnissä: http://{HOST}:{PORT} (ääni {VOICE_PATH.stem}, {SAMPLE_RATE} Hz)", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
