import json
import tempfile
import unittest
from pathlib import Path

import server
from api_secret import decode_secret, encode_secret


class ApiConfigTests(unittest.TestCase):
    def test_protects_secret_and_configuration_paths_from_static_serving(self):
        self.assertTrue(server.is_protected_path("/api-config.json"))
        self.assertTrue(server.is_protected_path("/api-secret.enc?download=1"))
        self.assertFalse(server.is_protected_path("/index.html"))

    def test_obfuscated_secret_round_trip(self):
        encoded = encode_secret("default-secret-key", nonce=b"test-nonce-12345")

        self.assertNotIn("default-secret-key", encoded)
        self.assertEqual(decode_secret(encoded), "default-secret-key")

    def test_loads_api_config_from_json_file(self):
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "api-config.json"
            secret_path = Path(directory) / "api-secret.enc"
            secret_path.write_text(encode_secret("bundled-key"), encoding="utf-8")
            config_path.write_text(
                json.dumps(
                    {
                        "baseUrl": "https://api.example.com/v1",
                        "apiKey": "test-key",
                        "model": "test-model",
                        "authHeader": "api-key",
                        "maxChapters": 3,
                        "requestBody": {
                            "stream": False,
                            "response_format": {"type": "json_object"},
                        },
                    }
                ),
                encoding="utf-8",
            )

            config = server.load_api_config(config_path, secret_path)

        self.assertEqual(config["baseUrl"], "https://api.example.com/v1")
        self.assertEqual(config["apiKey"], "test-key")
        self.assertEqual(config["keySource"], "user-config")
        self.assertEqual(config["authHeader"], "api-key")
        self.assertEqual(config["maxChapters"], 3)
        self.assertEqual(config["requestBody"]["stream"], False)

    def test_uses_bundled_key_when_user_key_is_empty(self):
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "api-config.json"
            secret_path = Path(directory) / "api-secret.enc"
            secret_path.write_text(encode_secret("bundled-key"), encoding="utf-8")
            config_path.write_text(
                json.dumps(
                    {
                        "baseUrl": "https://api.example.com/v1",
                        "apiKey": "",
                        "model": "test-model",
                        "authHeader": "api-key",
                        "requestBody": {},
                    }
                ),
                encoding="utf-8",
            )

            config = server.load_api_config(config_path, secret_path)

        self.assertEqual(config["apiKey"], "bundled-key")
        self.assertEqual(config["keySource"], "bundled-default")

    def test_missing_user_and_bundled_key_is_not_configured(self):
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "api-config.json"
            secret_path = Path(directory) / "missing-secret.enc"
            config_path.write_text(
                json.dumps(
                    {
                        "baseUrl": "https://api.example.com/v1",
                        "apiKey": "",
                        "model": "test-model",
                        "requestBody": {},
                    }
                ),
                encoding="utf-8",
            )

            config = server.load_api_config(config_path, secret_path)
            status = server.public_api_config_status(config)

        self.assertEqual(config["apiKey"], "")
        self.assertEqual(config["keySource"], "missing")
        self.assertFalse(status["configured"])

    def test_public_status_never_exposes_api_key(self):
        status = server.public_api_config_status(
            {
                "baseUrl": "https://api.example.com/v1",
                "apiKey": "secret-key",
                "keySource": "bundled-default",
                "model": "test-model",
                "authHeader": "bearer",
                "maxChapters": 2,
                "requestBody": {},
            }
        )

        self.assertTrue(status["configured"])
        self.assertTrue(status["hasApiKey"])
        self.assertEqual(status["keySource"], "bundled-default")
        self.assertEqual(status["maxChapters"], 2)
        self.assertNotIn("apiKey", status)
        self.assertNotIn("secret-key", json.dumps(status))

    def test_builds_configured_upstream_request(self):
        target_url, headers, body = server.build_configured_upstream_request(
            {
                "baseUrl": "https://api.example.com/v1",
                "apiKey": "secret-key",
                "keySource": "user-config",
                "model": "test-model",
                "authHeader": "api-key",
                "maxChapters": 2,
                "requestBody": {
                    "stream": False,
                    "max_completion_tokens": 8192,
                    "response_format": {"type": "json_object"},
                },
            },
            [{"role": "user", "content": "hello"}],
        )

        self.assertEqual(
            target_url, "https://api.example.com/v1/chat/completions"
        )
        self.assertEqual(headers["api-key"], "secret-key")
        self.assertEqual(body["model"], "test-model")
        self.assertEqual(body["messages"][0]["content"], "hello")
        self.assertEqual(body["stream"], False)
        self.assertEqual(body["response_format"], {"type": "json_object"})
        self.assertNotIn("maxChapters", body)


if __name__ == "__main__":
    unittest.main()
