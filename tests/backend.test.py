"""Provider contract checks; uses a fake provider, not paid AI calls."""
import asyncio
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import app


class FakeResponse:
    def __init__(self, content="Xin chào"):
        self.content = content

    def raise_for_status(self):
        pass

    def json(self):
        return {"choices": [{"message": {"content": self.content}}]}


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
        assert kwargs["json"]["temperature"] == 0
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

    def check_retry(self, contents, target):
        calls = []

        class RetryClient(FakeClient):
            async def post(self, url, **kwargs):
                body = kwargs["json"]
                calls.append(body["messages"][0]["content"])
                self_test.assertEqual(body["temperature"], 0)
                self_test.assertEqual(body["messages"][1]["content"], "Hello 你好")
                return FakeResponse(contents[len(calls) - 1])

        self_test = self
        with patch.dict(os.environ, {"TRANSLATION_MODEL": "test"}), patch.object(app.httpx, "AsyncClient", RetryClient):
            response = self.client.post("/translate", json={"text": "Hello 你好", "target": target})
        self.assertEqual(len(calls), 2)
        self.assertIn("Do not output any Chinese, Japanese, or Korean characters", calls[1])
        self.assertIn("mixes languages", calls[0])
        if target == "vi":
            self.assertIn("proper diacritics", calls[0])
        return response

    def test_mixed_chinese_retry_success(self):
        for target, corrected in (("vi", "Xin chào"), ("en", "Hello")):
            with self.subTest(target=target):
                response = self.check_retry(["Xin chào 你好", corrected], target)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), {"translation": corrected})

    def test_retry_still_wrong(self):
        for script in ("你好", "こんにちは", "안녕하세요", "\U00020000"):
            with self.subTest(script=script):
                response = self.check_retry([script, script], "vi")
                self.assertEqual(response.status_code, 502)
                self.assertIn("sau khi thử lại", response.json()["detail"])

    def test_shared_deadline_cancels_retry(self):
        calls = []
        cancelled = []
        real_wait_for = asyncio.wait_for

        class SlowClient(FakeClient):
            async def post(self, url, **kwargs):
                calls.append(url)
                if len(calls) == 1:
                    await asyncio.sleep(0.02)
                    return FakeResponse("你好")
                try:
                    await asyncio.sleep(1)
                finally:
                    cancelled.append(True)

        async def short_deadline(coro, timeout):
            self.assertEqual(timeout, 40.0)
            return await real_wait_for(coro, timeout=0.06)

        with patch.dict(os.environ, {"TRANSLATION_MODEL": "test"}), patch.object(app.httpx, "AsyncClient", SlowClient), patch.object(app.asyncio, "wait_for", short_deadline):
            response = self.client.post("/translate", json={"text": "Hi", "target": "vi"})
        self.assertEqual(response.status_code, 504)
        self.assertEqual(len(calls), 2)
        self.assertEqual(cancelled, [True])


if __name__ == "__main__":
    unittest.main()
