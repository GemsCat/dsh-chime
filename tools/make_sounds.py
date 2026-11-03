"""Generate the four bundled chimes (44.1kHz / 16bit / mono), stdlib only.

    python tools/make_sounds.py

Writes assets/done.wav, alert.wav, error.wav, stopped.wav
"""
import math
import os
import struct
import wave

RATE = 44100
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
ATTACK = 0.006


def tone(freq, seconds, amp, decay=6.0, harmonics=(1.0,)):
    n = int(RATE * seconds)
    out = []
    for i in range(n):
        t = i / RATE
        env = (1.0 - math.exp(-t / ATTACK)) * math.exp(-decay * t)
        v = 0.0
        for k, weight in enumerate(harmonics, start=1):
            if weight:
                v += weight * math.sin(2 * math.pi * freq * k * t)
        out.append(amp * env * v)
    return out


def silence(seconds):
    return [0.0] * int(RATE * seconds)


def join(*parts):
    samples = []
    for part in parts:
        samples.extend(part)
    return samples


def write(name, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    scale = 0.92 / peak if peak > 0.92 else 1.0
    data = b"".join(struct.pack("<h", int(max(-1.0, min(1.0, s * scale)) * 32767)) for s in samples)
    path = os.path.join(OUT, name)
    with wave.open(path, "wb") as fh:
        fh.setnchannels(1)
        fh.setsampwidth(2)
        fh.setframerate(RATE)
        fh.writeframes(data)
    print("%s: %.2fs, %d bytes" % (name, len(samples) / RATE, len(data) + 44))


def main():
    os.makedirs(OUT, exist_ok=True)
    # done: soft two-note rise - a turn just finished
    write("done.wav", join(
        tone(784, 0.10, 0.30, decay=14),
        tone(1046, 0.16, 0.26, decay=16),
        silence(0.03),
    ))
    # alert: three-note rise - you are needed
    write("alert.wav", join(
        tone(659, 0.07, 0.28, decay=16),
        tone(880, 0.07, 0.28, decay=16),
        tone(1175, 0.14, 0.26, decay=14),
        silence(0.03),
    ))
    # error: two-note fall with a second harmonic
    write("error.wav", join(
        tone(440, 0.14, 0.26, decay=10, harmonics=(1.0, 0.35)),
        tone(330, 0.20, 0.24, decay=9, harmonics=(1.0, 0.35)),
        silence(0.03),
    ))
    # stopped: low short tone
    write("stopped.wav", join(
        tone(220, 0.22, 0.32, decay=9, harmonics=(1.0, 0.2)),
        silence(0.02),
    ))


if __name__ == "__main__":
    main()
