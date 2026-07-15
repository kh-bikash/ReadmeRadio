import argparse
import sys
import math
import os
import re
import json

import numpy as np
import soundfile as sf

try:
    import torch
    import torchaudio
    from torchaudio.functional import forced_align
except ImportError:
    print("Error: torch/torchaudio not installed. Run pip install -r requirements.txt")
    sys.exit(1)

try:
    from kokoro import KPipeline
except ImportError:
    print("Error: kokoro not installed. Run pip install -r requirements.txt")
    sys.exit(1)


def format_timestamp(seconds: float):
    hours = math.floor(seconds / 3600)
    seconds %= 3600
    minutes = math.floor(seconds / 60)
    seconds %= 60
    milliseconds = round((seconds - math.floor(seconds)) * 1000)
    seconds = math.floor(seconds)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"


def synthesize(text: str, output_audio: str, voice: str, speed: float, sample_rate: int):
    print("Initializing Kokoro TTS...")
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    chunks = []
    for gs, ps, audio in pipeline(text, voice=voice, speed=speed):
        chunks.append(audio.cpu().numpy().reshape(-1))
    audio_np = np.concatenate(chunks) if chunks else np.zeros(0, dtype="float32")
    sf.write(output_audio, audio_np, sample_rate)
    print(f"Audio saved to {output_audio} ({len(audio_np)/sample_rate:.2f}s)")
    return audio_np, sample_rate


def align_words(audio_np: np.ndarray, sample_rate: int, transcript: str):
    print("Running forced alignment (torchaudio MMS_FA)...")
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model()
    aligner = bundle.get_aligner()
    tokenizer = bundle.get_tokenizer()
    dictionary = bundle.get_dict()
    allowed = set(dictionary.keys())
    model_sr = bundle.sample_rate

    data = audio_np.astype("float32")
    waveform = torch.from_numpy(data).unsqueeze(0)
    if sample_rate != model_sr:
        waveform = torchaudio.functional.resample(waveform, sample_rate, model_sr)

    with torch.inference_mode():
        emission, _ = model(waveform)

    words = transcript.split()
    clean = [re.sub(r"[^a-z']", "", w.lower()) for w in words]
    token_lists = [[dictionary[c] for c in cw if c in allowed and dictionary[c] != 0] for cw in clean]

    spans = aligner(emission[0], token_lists)
    ratio = waveform.shape[1] / emission.shape[1] / model_sr

    word_timings = []
    prev_end = 0.0
    for w, char_spans in zip(words, spans):
        if char_spans:
            start_t = char_spans[0].start * ratio
            end_t = char_spans[-1].end * ratio
        else:
            start_t = prev_end
            end_t = prev_end
        word_timings.append({"word": w, "start": round(start_t, 3), "end": round(end_t, 3)})
        prev_end = end_t

    print(f"Aligned {len(word_timings)} words")
    return word_timings


def group_captions(word_timings, max_words: int = 8):
    captions = []
    current = []
    for wt in word_timings:
        w = wt["word"]
        current.append(wt)
        ends_sentence = bool(re.search(r"[.!?]$", w))
        if ends_sentence or len(current) >= max_words:
            captions.append(_finalize_caption(current, len(captions) + 1))
            current = []
    if current:
        captions.append(_finalize_caption(current, len(captions) + 1))
    return captions


def _finalize_caption(group, index):
    text = " ".join(wt["word"] for wt in group)
    return {
        "index": index,
        "start": group[0]["start"],
        "end": group[-1]["end"],
        "text": text,
    }


def generate_srt(captions, output_file):
    with open(output_file, "w", encoding="utf-8") as f:
        for c in captions:
            f.write(f"{c['index']}\n")
            f.write(f"{format_timestamp(c['start'])} --> {format_timestamp(c['end'])}\n")
            f.write(f"{c['text']}\n\n")


def main():
    parser = argparse.ArgumentParser(description="Generate audio and captions for README Radio")
    parser.add_argument("--input", type=str, required=True, help="Path to input text file")
    parser.add_argument("--output-audio", type=str, default="episode.wav", help="Output audio file")
    parser.add_argument("--output-srt", type=str, default="captions.srt", help="Output SRT file")
    parser.add_argument("--output-words", type=str, default=None, help="Optional word-level timings JSON")
    parser.add_argument("--voice", type=str, default="af_heart", help="Kokoro voice name")
    parser.add_argument("--speed", type=float, default=1.0, help="Narration speed multiplier")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: Input file {args.input} not found.")
        sys.exit(1)

    with open(args.input, "r", encoding="utf-8") as f:
        text = f.read().strip()

    audio_np, sr = synthesize(text, args.output_audio, args.voice, args.speed, 24000)
    word_timings = align_words(audio_np, sr, text)

    captions = group_captions(word_timings)
    generate_srt(captions, args.output_srt)
    print(f"Captions saved to {args.output_srt}")

    if args.output_words:
        with open(args.output_words, "w", encoding="utf-8") as f:
            json.dump(word_timings, f, indent=2)
        print(f"Word timings saved to {args.output_words}")

    print("DONE")


if __name__ == "__main__":
    main()
