import base64
import hashlib
import os


VERSION = "v1"
_MATERIAL_PARTS = (
    b"novel-screenplay",
    b"soft-ui-runtime",
    b"bundled-api-key",
)


def encode_secret(secret, nonce=None):
    plain = str(secret or "").encode("utf-8")
    if not plain:
        raise ValueError("API key cannot be empty.")

    nonce_bytes = nonce or os.urandom(16)
    stream = _build_stream(nonce_bytes, len(plain))
    cipher = bytes(value ^ stream[index] for index, value in enumerate(plain))
    checksum = hashlib.sha256(plain + nonce_bytes + _material()).digest()[:8]

    return ".".join(
        [
            VERSION,
            _encode(nonce_bytes),
            _encode(cipher),
            _encode(checksum),
        ]
    )


def decode_secret(payload):
    parts = str(payload or "").strip().split(".")
    if len(parts) != 4 or parts[0] != VERSION:
        raise ValueError("Unsupported or malformed API secret.")

    nonce = _decode(parts[1])
    cipher = _decode(parts[2])
    checksum = _decode(parts[3])
    stream = _build_stream(nonce, len(cipher))
    plain = bytes(value ^ stream[index] for index, value in enumerate(cipher))
    expected = hashlib.sha256(plain + nonce + _material()).digest()[:8]

    if checksum != expected:
        raise ValueError("API secret integrity check failed.")

    return plain.decode("utf-8")


def _build_stream(nonce, length):
    stream = bytearray()
    counter = 0

    while len(stream) < length:
        stream.extend(
            hashlib.sha256(
                _material() + nonce + counter.to_bytes(4, "big")
            ).digest()
        )
        counter += 1

    return bytes(stream[:length])


def _material():
    return b"|".join(_MATERIAL_PARTS)


def _encode(value):
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode(value):
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)
