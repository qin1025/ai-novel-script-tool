import json
import tempfile
import unittest
from pathlib import Path

import server


class ApiConfigTests(unittest.TestCase):
    def test_loads_api_config_from_json_file(self):
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "api-config.json"
            config_path.write_text(
                json.dumps(
                    {
                        "enabled": True,
                        "baseUrl": "https://api.example.com/v1",
                        "apiKey": "test-key",
                        "model": "test-model",
                        "authHeader": "api-key",
                        "requestBody": {
                            "stream": False,
                            "response_format": {"type": "json_object"},
                        },
                    }
                ),
                encoding="utf-8",
            )

            config = server.load_api_config(config_path)

        self.assertTrue(config["enabled"])
        self.assertEqual(config["baseUrl"], "https://api.example.com/v1")
        self.assertEqual(config["apiKey"], "test-key")
        self.assertEqual(config["authHeader"], "api-key")
        self.assertEqual(config["requestBody"]["stream"], False)

    def test_public_status_never_exposes_api_key(self):
        status = server.public_api_config_status(
            {
                "enabled": True,
                "baseUrl": "https://api.example.com/v1",
                "apiKey": "secret-key",
                "model": "test-model",
                "authHeader": "bearer",
                "requestBody": {},
            }
        )

        self.assertTrue(status["configured"])
        self.assertTrue(status["hasApiKey"])
        self.assertNotIn("apiKey", status)
        self.assertNotIn("secret-key", json.dumps(status))

    def test_builds_configured_upstream_request(self):
        target_url, headers, body = server.build_configured_upstream_request(
            {
                "enabled": True,
                "baseUrl": "https://api.example.com/v1",
                "apiKey": "secret-key",
                "model": "test-model",
                "authHeader": "api-key",
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


if __name__ == "__main__":
    unittest.main()
