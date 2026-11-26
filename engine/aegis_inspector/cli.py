"""Command-line bridge used by the local Rust endpoint agent."""
import argparse
import json
import sys

from .engine import create_default_engine
from .extractors import MAX_FILE_BYTES

def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect local text or files for sensitive data.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--text", help="Text to inspect; avoid real secrets in shell history.")
    group.add_argument("--file", help="Path to a supported local file.")
    group.add_argument("--stdin-file", action="store_true", help="Read file bytes from stdin without creating a file.")
    parser.add_argument("--filename", help="Filename used to select a safe extractor for --stdin-file.")
    args = parser.parse_args()

    engine = create_default_engine()
    if args.stdin_file:
        if not args.filename:
            parser.error("--filename is required with --stdin-file")
        data = sys.stdin.buffer.read(MAX_FILE_BYTES + 1)
        result = engine.inspect_bytes(data, args.filename)
    elif args.text is not None:
        result = engine.inspect_text(args.text)
    else:
        result = engine.inspect_file(args.file)

    # Findings contain rule metadata and offsets only; matched values never leave this process.
    sys.stdout.write(json.dumps(result.to_dict(), separators=(",", ":")))
    sys.stdout.write("\n")
    return 2 if not result.complete else (1 if result.findings else 0)

if __name__ == "__main__":
    sys.exit(main())
