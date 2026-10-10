"""Provider contract checks; uses a fake provider, not paid AI calls."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import app


class FakeResponse:
    def raise_for_status(self):
        pass

    def json(self):
        return {"choices": [{"message": {"content": "Xin chào"}}]}


class FakeClient:
    def __init__(self, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def post(self, url, **kwargs):
        assert url.endswith("/chat/completions")
        assert kwargs["json"]["messages"][1]["content"] == "Hi"
        return FakeResponse()


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app.app)

    def test_validation(self):
        self.assertEqual(self.client.post("/translate", json={"text": "Hi", "target": "invalid"}).status_code, 422)
        self.assertEqual(self.client.post("/translate", json={"text": "", "target": "vi"}).status_code, 422)

    def test_unconfigured(self):
        with patch.dict(os.environ, {"TRANSLATION_MODEL": ""}):
            self.assertEqual(self.client.post("/translate", json={"text": "Hi", "target": "vi"}).status_code, 503)

    def test_provider_contract(self):
        with patch.dict(os.environ, {"TRANSLATION_MODEL": "test"}), patch.object(app.httpx, "AsyncClient", FakeClient):
            self.assertEqual(self.client.post("/translate", json={"text": "Hi", "target": "vi"}).json(), {"translation": "Xin chào"})


if __name__ == "__main__":
    unittest.main()
