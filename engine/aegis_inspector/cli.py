import argparse
import json
import sys
from .engine import create_default_engine

def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect local text or supported files for sensitive data.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--text", help="Text to inspect; avoid putting real secrets in shell history.")
    group.add_argument("--file", help="Path to a supported local file.")
    args = parser.parse_args()
    engine = create_default_engine()
    result = engine.inspect_text(args.text) if args.text is not None else engine.inspect_file(args.file)
    print(json.dumps(result.to_dict(), indent=2))
    return 2 if not result.complete else (1 if result.findings else 0)

if __name__ == "__main__":
    sys.exit(main())
