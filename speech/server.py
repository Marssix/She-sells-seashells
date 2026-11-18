"""Paikallinen puhepalvelu botille: Piper-puhesynteesi (2a) ja Whisper-puheentunnistus (2b) suomeksi.

Käynnistys:  speech\\.venv\\Scripts\\python speech\\server.py   (pm2 käynnistää tämän automaattisesti)

Rajapinta (vain localhost):
    GET  /health  -> {"ok": true, "voice": "...", "sample_rate": 22050, "stt": "ready" | "loading" | "unavailable"}
    POST /tts     {"text": "...", "length_scale": 1.0, "pitch": 1.0}
                  -> audio/ogg (Opus, 48 kHz mono), jonka Discord toistaa sellaisenaan
    POST /stt     runko: raaka PCM s16le, 16 kHz, mono. Otsake X-Prompt (URL-koodattu): sanastovihje.
                  -> {"text": "...", "duration_s": 2.4, "took_ms": 180}

Piper toimii prosessorilla ja Whisper näytönohjaimella (tai prosessorilla, jos CUDA puuttuu),
joten ne eivät kilpaile samasta resurssista. Ääntä ja tekstiä käsitellään vain muistissa:
mitään ei tallenneta eikä lokiteta.
"""

from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import threading
import time
import urllib.parse
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Windows-konsoli ja pm2-lokit: tulosteet aina UTF-8:na (ääkköset).
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

# Windows: pip-asennettujen CUDA-kirjastojen DLL:t hakupolkuun ennen CTranslate2:n latausta.
_nvidia = Path(sys.prefix) / "Lib" / "site-packages" / "nvidia"
for _sub in ("cublas", "cudnn", "cuda_nvrtc"):
    _dll = _nvidia / _sub / "bin"
    if _dll.is_dir():
        os.add_dll_directory(str(_dll))
        os.environ["PATH"] = str(_dll) + os.pathsep + os.environ["PATH"]

from piper import PiperVoice, SynthesisConfig  # noqa: E402

HERE = Path(__file__).parent
VOICE_PATH = Path(os.environ.get("PIPER_VOICE", HERE / "voices" / "fi_FI-harri-medium.onnx"))
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
HOST = "127.0.0.1"
PORT = int(os.environ.get("SPEECH_PORT", "5005"))
MAX_CHARS = 1000
STT_RATE = 16_000
MAX_STT_BYTES = STT_RATE * 2 * 45  # enintään 45 s puhetta per pyyntö

voice = PiperVoice.load(str(VOICE_PATH))
SAMPLE_RATE = voice.config.sample_rate
# Piperin ONNX-istunto ei ole varmasti säieturvallinen: yksi tuotto kerrallaan (kesto ~0,2 s).
synth_lock = threading.Lock()

# --- Whisper ladataan taustalla, jotta puhesynteesi on käytössä heti käynnistyksessä. ---
whisper_model = None
stt_state = "loading"
stt_lock = threading.Lock()


def load_whisper() -> None:
    global whisper_model, stt_state
    try:
        import numpy as np
        from faster_whisper import WhisperModel

        try:
            model = WhisperModel(WHISPER_MODEL, device="cuda", compute_type="float16")
            device = "cuda"
        except Exception as err:  # noqa: BLE001 - ei näytönohjainta: prosessori riittää hitaammin
            print(f"Whisper: CUDA ei käytettävissä ({err}), käytetään prosessoria.", file=sys.stderr)
            model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
            device = "cpu"
        # Lämmittely oikealla puheella (Piperin tuottama), jotta ensimmäinen pelaajan puheenvuoro ei odota
        # näytönohjaimen alustusta (~4 s). Hiljaisuus ei lämmitä varsinaista tekstin tuottoa.
        try:
            warm = synthesize_pcm16k("Hei, myyn sinulle tämän tuotteen kymmenellä eurolla.")
            audio = np.frombuffer(warm, dtype=np.int16).astype(np.float32) / 32768.0
        except Exception:  # noqa: BLE001
            audio = np.zeros(STT_RATE * 2, dtype=np.float32)
        list(model.transcribe(audio, language="fi", beam_size=5, condition_on_previous_text=False)[0])
        whisper_model = model
        stt_state = "ready"
        print(f"Whisper {WHISPER_MODEL} valmis ({device}).", flush=True)
    except Exception as err:  # noqa: BLE001
        stt_state = "unavailable"
        print(f"Whisper ei käytettävissä: {type(err).__name__}: {err}", file=sys.stderr, flush=True)


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


def synthesize_pcm16k(text: str) -> bytes:
    """Piper -> PCM s16le 16 kHz mono (Whisperin lämmittelyyn)."""
    buf = io.BytesIO()
    with synth_lock, wave.open(buf, "wb") as w:
        voice.synthesize_wav(text, w)
    return subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", str(STT_RATE), "pipe:1"],
        input=buf.getvalue(),
        capture_output=True,
        check=True,
    ).stdout


def transcribe(pcm: bytes, prompt: str | None) -> str:
    """PCM s16le 16 kHz mono -> teksti. Hylkää jaksot, jotka Whisper itse arvioi epätodennäköiseksi puheeksi."""
    import numpy as np

    audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    with stt_lock:
        segments, _ = whisper_model.transcribe(  # type: ignore[union-attr]
            audio,
            language="fi",
            beam_size=5,
            initial_prompt=prompt or None,
            condition_on_previous_text=False,
            vad_filter=False,  # Discord rajaa puheen jo valmiiksi hiljaisuuden perusteella
        )
        kept = [s.text.strip() for s in segments if not (s.no_speech_prob > 0.6 and s.avg_logprob < -1.0)]
    return " ".join(t for t in kept if t).strip()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:  # ei lokiteta pyyntöjä (sisältäisi tekstiä)
        pass

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(200, {"ok": True, "voice": VOICE_PATH.stem, "sample_rate": SAMPLE_RATE, "stt": stt_state})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path == "/tts":
            self._tts()
        elif self.path == "/stt":
            self._stt()
        else:
            self._json(404, {"error": "not found"})

    def _tts(self) -> None:
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

    def _stt(self) -> None:
        if stt_state != "ready":
            self._json(503, {"error": f"stt {stt_state}"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_STT_BYTES or length % 2:
                self._json(400, {"error": "virheellinen äänen pituus"})
                return
            pcm = self.rfile.read(length)
            prompt = urllib.parse.unquote(self.headers.get("X-Prompt", ""))[:400]
            started = time.perf_counter()
            text = transcribe(pcm, prompt)
            took_ms = int((time.perf_counter() - started) * 1000)
        except Exception as err:  # noqa: BLE001
            print(f"STT-virhe: {type(err).__name__}: {err}", file=sys.stderr)
            self._json(500, {"error": type(err).__name__})
            return
        self._json(200, {"text": text, "duration_s": round(len(pcm) / (STT_RATE * 2), 2), "took_ms": took_ms})


def main() -> None:
    threading.Thread(target=load_whisper, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Puhepalvelu käynnissä: http://{HOST}:{PORT} (ääni {VOICE_PATH.stem}, {SAMPLE_RATE} Hz; Whisper latautuu...)", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
