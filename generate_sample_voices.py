"""
generate_sample_voices.py
--------------------------
Generates placeholder reference WAV files in the voices/ folder
using gTTS (Google TTS — needs internet, one-time use only).

These are just STARTER voices. For best quality:
  → Record a real human speaking 10-20 seconds in each accent
  → Save as voices/american_en.wav, voices/indian_en.wav, etc.
  → XTTS-v2 will clone that voice for all agent responses

Usage:
    pip install gTTS pydub
    python generate_sample_voices.py
"""

import os
from pathlib import Path

try:
    from gtts import gTTS
    import soundfile as sf
    import numpy as np
except ImportError:
    print("Run: pip install gTTS soundfile")
    exit(1)

VOICES_DIR = Path("voices")
VOICES_DIR.mkdir(exist_ok=True)

SAMPLE_TEXT = {
    "american_en": ("Hello, I'm your interviewer today. It's great to meet you.", "en", "us"),
    "british_en":  ("Hello, I'm your interviewer today. It's great to meet you.", "en", "co.uk"),
    "indian_en":   ("Hello, I'm your interviewer today. It's great to meet you.", "en", "co.in"),
    "australian_en": ("Hello, I'm your interviewer today. It's great to meet you.", "en", "com.au"),
    "hindi":       ("नमस्ते, मैं आज आपका इंटरव्यूअर हूं। आपसे मिलकर अच्छा लगा।", "hi", None),
    "spanish":     ("Hola, soy tu entrevistador hoy. Es un placer conocerte.", "es", None),
    "french":      ("Bonjour, je suis votre intervieweur aujourd'hui. Ravi de vous rencontrer.", "fr", None),
    "german":      ("Hallo, ich bin heute Ihr Interviewer. Es ist schön, Sie kennenzulernen.", "de", None),
    "arabic":      ("مرحباً، أنا المحاور اليوم. يسعدني لقاؤك.", "ar", None),
}

print("Generating sample voice reference files...\n")
for filename, (text, lang, tld) in SAMPLE_TEXT.items():
    out_path = VOICES_DIR / f"{filename}.wav"
    if out_path.exists():
        print(f"  ✓ Already exists: {out_path}")
        continue
    try:
        kwargs = {"lang": lang, "slow": False}
        if tld:
            kwargs["tld"] = tld
        tts = gTTS(text=text, **kwargs)
        mp3_path = VOICES_DIR / f"{filename}.mp3"
        tts.save(str(mp3_path))

        # Convert MP3 → WAV using ffmpeg
        wav_path = VOICES_DIR / f"{filename}.wav"
        os.system(f'ffmpeg -y -i "{mp3_path}" -ar 22050 -ac 1 "{wav_path}" -loglevel quiet')
        mp3_path.unlink(missing_ok=True)
        print(f"  ✓ Generated: {wav_path}")
    except Exception as e:
        print(f"  ✗ Failed {filename}: {e}")

print("\n✅ Done! Voice files saved to voices/")
print("\n💡 TIP: For much better quality, replace these with real human")
print("   recordings (10-20 seconds each). XTTS-v2 will clone that voice.")
