import argparse
import sys
import soundfile as sf
import os
import math

try:
    from kittentts import KittenTTS
except ImportError:
    print("Error: kittentts not installed. Run pip install -r requirements.txt")
    sys.exit(1)

try:
    from faster_whisper import WhisperModel
except ImportError:
    print("Error: faster-whisper not installed. Run pip install -r requirements.txt")
    sys.exit(1)

def format_timestamp(seconds: float):
    # Convert float seconds to SRT timestamp format (HH:MM:SS,mmm)
    hours = math.floor(seconds / 3600)
    seconds %= 3600
    minutes = math.floor(seconds / 60)
    seconds %= 60
    milliseconds = round((seconds - math.floor(seconds)) * 1000)
    seconds = math.floor(seconds)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"

def generate_srt(segments, output_file):
    with open(output_file, 'w', encoding='utf-8') as f:
        for i, segment in enumerate(segments, start=1):
            start = format_timestamp(segment.start)
            end = format_timestamp(segment.end)
            f.write(f"{i}\n")
            f.write(f"{start} --> {end}\n")
            f.write(f"{segment.text.strip()}\n\n")

def main():
    parser = argparse.ArgumentParser(description="Generate audio and captions for README Radio")
    parser.add_argument("--input", type=str, required=True, help="Path to input text file")
    parser.add_argument("--output-audio", type=str, default="episode.wav", help="Output audio file")
    parser.add_argument("--output-srt", type=str, default="captions.srt", help="Output SRT file")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: Input file {args.input} not found.")
        sys.exit(1)

    with open(args.input, 'r', encoding='utf-8') as f:
        text = f.read()

    print("Initializing KittenTTS...")
    try:
        model = KittenTTS("KittenML/kitten-tts-mini-0.8")
    except Exception as e:
        print(f"Failed to load KittenTTS: {e}")
        sys.exit(1)
    
    print("Generating audio...")
    try:
        # Generate to a file directly, or get the numpy array and save it.
        # KittenTTS generate_to_file has arguments: text, output_path, voice, speed, sample_rate, clean_text
        model.generate_to_file(text, args.output_audio, voice="Jasper", speed=1.0, sample_rate=24000, clean_text=True)
    except Exception as e:
        print(f"Error generating audio: {e}")
        sys.exit(1)

    print(f"Audio saved to {args.output_audio}")

    print("Initializing faster-whisper...")
    try:
        # We use a small model optimized for CPU
        whisper_model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
    except Exception as e:
        print(f"Failed to load faster-whisper: {e}")
        sys.exit(1)
    
    print("Generating captions...")
    try:
        segments, info = whisper_model.transcribe(args.output_audio, beam_size=5, word_timestamps=False)
        # Convert segments generator to a list to iterate and create SRT
        segments_list = list(segments)
        generate_srt(segments_list, args.output_srt)
    except Exception as e:
        print(f"Error generating captions: {e}")
        sys.exit(1)

    print(f"Captions saved to {args.output_srt}")
    print("DONE")

if __name__ == "__main__":
    main()
