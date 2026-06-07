import argparse
import getpass
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api_secret import encode_secret


def main():
    parser = argparse.ArgumentParser(
        description="Generate an obfuscated bundled API key file."
    )
    parser.add_argument("--key", help="API key. Omit to enter it without echo.")
    parser.add_argument(
        "--output",
        default=str(ROOT / "api-secret.enc"),
        help="Output path. Defaults to api-secret.enc in the project root.",
    )
    args = parser.parse_args()
    key = args.key or getpass.getpass("Default API key: ")
    output = Path(args.output)
    output.write_text(encode_secret(key) + "\n", encoding="utf-8")
    print(f"Wrote obfuscated API key to {output}")


if __name__ == "__main__":
    main()
