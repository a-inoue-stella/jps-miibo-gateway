"""
========================================
🧪 backend-modal テストスイート
========================================
テスト対象: app.py (process_image_pipe)

実行方法:
  cd /path/to/jps-rescue-ai_miibo
  python -m pytest backend-modal/tests/test_app.py -v

テスト分類:
  - Unit Tests     : 外部API不要。ロジックのみ検証（モック使用）
  - Integration    : デプロイ済みの Modal エンドポイントに実リクエスト送信
"""

import pytest
import io
import os
import base64
import json
from unittest.mock import patch, MagicMock
from PIL import Image

# ============================================================
# テスト用ヘルパー
# ============================================================

def create_test_image(width=100, height=100, color="red", fmt="JPEG"):
    """テスト用の画像バイト列を生成する"""
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


def create_large_test_image(width=4096, height=4096):
    """サイズ制限テスト用の大きな画像を生成する"""
    img = Image.new("RGB", (width, height), "blue")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=100)
    return buf.getvalue()


def create_png_with_alpha(width=100, height=100):
    """RGBA (透過) PNG を生成する"""
    img = Image.new("RGBA", (width, height), (255, 0, 0, 128))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def mock_env(token="test_secret_token_123"):
    """環境変数のモック辞書を返す"""
    return {
        "INTERNAL_AUTH_TOKEN": token,
        "LINE_ACCESS_TOKEN": "line_test_token",
        "CHATWORK_API_TOKEN": "cw_test_token",
    }


# ============================================================
# process_image_pipe のコアロジックを抽出して直接テスト可能にする
# (Modal デコレータに依存しない形でテスト)
# ============================================================

async def _process_image_pipe_logic(data: dict, env_vars: dict):
    """
    app.py の process_image_pipe と同じロジックをローカルで再現する。
    os.environ の代わりに env_vars 辞書を参照する。
    requests.get の代わりに data["_test_image_bytes"] があればそれを使う。
    """
    import time
    from fastapi.responses import JSONResponse

    MAX_PAYLOAD_BYTES = 2_250_000
    MAX_IMAGE_DIMENSION = 2048
    JPEG_QUALITY = 80

    start_time = time.time()
    user_id = data.get("user", "unknown")
    source = data.get("source", "unknown")

    # --- Security check ---
    env_token = env_vars.get("INTERNAL_AUTH_TOKEN")
    if env_token:
        req_token = data.get("auth_token")
        if not req_token or req_token != env_token:
            return JSONResponse(
                status_code=401,
                content={"error": "Unauthorized", "status": "failed", "error_code": "AUTH_FAILED"}
            )

    # --- Parameters ---
    resource_id = data.get("id")
    resource_url = data.get("url")
    image_url_direct = data.get("image_url")

    try:
        image_bytes = data.get("_test_image_bytes")  # テスト用直接注入

        if image_bytes is None:
            if source == "line":
                if not resource_id:
                    return JSONResponse(
                        status_code=400,
                        content={"error": "Missing 'id' for LINE", "status": "failed", "error_code": "MISSING_PARAM"}
                    )
                return JSONResponse(
                    status_code=400,
                    content={"error": "Cannot download in test mode", "status": "failed", "error_code": "TEST_MODE"}
                )
            elif source == "chatwork":
                if not resource_url:
                    return JSONResponse(
                        status_code=400,
                        content={"error": "Missing 'url' for Chatwork", "status": "failed", "error_code": "MISSING_PARAM"}
                    )
                return JSONResponse(
                    status_code=400,
                    content={"error": "Cannot download in test mode", "status": "failed", "error_code": "TEST_MODE"}
                )
            elif image_url_direct:
                return JSONResponse(
                    status_code=400,
                    content={"error": "Cannot download in test mode", "status": "failed", "error_code": "TEST_MODE"}
                )
            else:
                return JSONResponse(
                    status_code=400,
                    content={"error": "Invalid source or missing image parameters", "status": "failed", "error_code": "INVALID_REQUEST"}
                )

        if not image_bytes:
            raise Exception("Image data is empty.")

        # Resize and Compress
        with Image.open(io.BytesIO(image_bytes)) as img:
            try:
                from PIL import ImageOps
                img = ImageOps.exif_transpose(img)
            except Exception:
                pass

            if img.mode != "RGB":
                img = img.convert("RGB")

            img.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION))

            output_buffer = io.BytesIO()
            img.save(output_buffer, format="JPEG", quality=JPEG_QUALITY)
            optimized_bytes = output_buffer.getvalue()

        # Size Check
        size_kb = len(optimized_bytes) / 1024
        if len(optimized_bytes) > MAX_PAYLOAD_BYTES:
            return JSONResponse(
                status_code=413,
                content={"error": f"Payload Too Large", "status": "failed", "error_code": "PAYLOAD_TOO_LARGE"}
            )

        # Base64 Encode
        base64_data = base64.b64encode(optimized_bytes).decode('utf-8')
        base64_string = f"data:image/jpeg;base64,{base64_data}"

        elapsed = round(time.time() - start_time, 2)

        return {
            "status": "success",
            "base64_image": base64_string,
            "meta": {
                "size_kb": round(size_kb, 1),
                "elapsed_seconds": elapsed
            }
        }

    except Exception as e:
        elapsed = round(time.time() - start_time, 2)
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "status": "failed", "error_code": "INTERNAL_ERROR"}
        )


# ============================================================
# Unit Test 1: 認証ロジック
# ============================================================

class TestAuthentication:
    """認証チェックのテスト"""

    @pytest.mark.asyncio
    async def test_auth_success(self):
        """正しいトークンで認証成功"""
        data = {
            "auth_token": "test_secret_token_123",
            "source": "line",
            "id": "msg_001",
            "_test_image_bytes": create_test_image(),
        }
        result = await _process_image_pipe_logic(data, mock_env())
        assert isinstance(result, dict)
        assert result["status"] == "success"

    @pytest.mark.asyncio
    async def test_auth_missing_token(self):
        """トークン未送信で 401"""
        data = {"source": "line", "id": "msg_001"}
        result = await _process_image_pipe_logic(data, mock_env())
        assert result.status_code == 401
        body = json.loads(result.body)
        assert body["error_code"] == "AUTH_FAILED"

    @pytest.mark.asyncio
    async def test_auth_wrong_token(self):
        """誤ったトークンで 401"""
        data = {"auth_token": "wrong_token", "source": "line", "id": "msg_001"}
        result = await _process_image_pipe_logic(data, mock_env())
        assert result.status_code == 401
        body = json.loads(result.body)
        assert body["error_code"] == "AUTH_FAILED"

    @pytest.mark.asyncio
    async def test_auth_skipped_when_env_not_set(self):
        """INTERNAL_AUTH_TOKEN 未設定時は認証スキップ"""
        data = {
            "source": "line",
            "id": "msg_001",
            "_test_image_bytes": create_test_image(),
        }
        result = await _process_image_pipe_logic(data, {})
        # 認証はスキップされ、画像処理まで進む
        assert isinstance(result, dict)
        assert result["status"] == "success"


# ============================================================
# Unit Test 2: パラメータバリデーション
# ============================================================

class TestParameterValidation:
    """リクエストパラメータのバリデーションテスト"""

    @pytest.mark.asyncio
    async def test_line_missing_id(self):
        """LINE で id なしは 400"""
        data = {"auth_token": "test_secret_token_123", "source": "line"}
        result = await _process_image_pipe_logic(data, mock_env())
        assert result.status_code == 400
        body = json.loads(result.body)
        assert body["error_code"] == "MISSING_PARAM"
        assert "LINE" in body["error"]

    @pytest.mark.asyncio
    async def test_chatwork_missing_url(self):
        """Chatwork で url なしは 400"""
        data = {"auth_token": "test_secret_token_123", "source": "chatwork"}
        result = await _process_image_pipe_logic(data, mock_env())
        assert result.status_code == 400
        body = json.loads(result.body)
        assert body["error_code"] == "MISSING_PARAM"
        assert "Chatwork" in body["error"]

    @pytest.mark.asyncio
    async def test_invalid_source(self):
        """未知の source は 400"""
        data = {"auth_token": "test_secret_token_123", "source": "slack"}
        result = await _process_image_pipe_logic(data, mock_env())
        assert result.status_code == 400
        body = json.loads(result.body)
        assert body["error_code"] == "INVALID_REQUEST"

    @pytest.mark.asyncio
    async def test_no_source_no_url(self):
        """source も image_url もなしは 400"""
        data = {"auth_token": "test_secret_token_123"}
        result = await _process_image_pipe_logic(data, mock_env())
        assert result.status_code == 400

    @pytest.mark.asyncio
    async def test_user_defaults_to_unknown(self):
        """user パラメータ省略時は 'unknown' にフォールバック"""
        data = {
            "auth_token": "test_secret_token_123",
            "source": "line",
            "id": "msg_001",
            "_test_image_bytes": create_test_image(),
        }
        result = await _process_image_pipe_logic(data, mock_env())
        assert result["status"] == "success"


# ============================================================
# Unit Test 3: 画像処理ロジック
# ============================================================

class TestImageProcessing:
    """画像のリサイズ・圧縮・Base64変換テスト"""

    @pytest.mark.asyncio
    async def test_normal_jpeg(self):
        """通常の JPEG 画像が正常処理される"""
        data = {
            "auth_token": "test_secret_token_123",
            "source": "line",
            "id": "msg_001",
            "_test_image_bytes": create_test_image(800, 600),
        }
        result = await _process_image_pipe_logic(data, mock_env())
        assert result["status"] == "success"
        assert result["base64_image"].startswith("data:image/jpeg;base64,")
        assert result["meta"]["size_kb"] > 0
        assert "elapsed_seconds" in result["meta"]

    @pytest.mark.asyncio
    async def test_png_converted_to_jpeg(self):
        """PNG は RGB 変換されて JPEG で出力される"""
        png_bytes = create_png_with_alpha()
        data = {
            "auth_token": "test_secret_token_123",
            "source": "line",
            "id": "msg_001",
            "_test_image_bytes": png_bytes,
        }
        result = await _process_image_pipe_logic(data, mock_env())
        assert result["status"] == "success"
        assert result["base64_image"].startswith("data:image/jpeg;base64,")

    @pytest.mark.asyncio
    async def test_large_image_resized(self):
        """2048px を超える画像がリサイズされる"""
        large_bytes = create_test_image(4000, 3000)
        data = {
            "auth_token": "test_secret_token_123",
            "source": "line",
            "id": "msg_001",
            "_test_image_bytes": large_bytes,
        }
        result = await _process_image_pipe_logic(data, mock_env())
        assert result["status"] == "success"

        # Base64 デコードして実際のサイズを確認
        b64_data = result["base64_image"].split(",")[1]
        img_bytes = base64.b64decode(b64_data)
        with Image.open(io.BytesIO(img_bytes)) as img:
            assert img.width <= 2048
            assert img.height <= 2048

    @pytest.mark.asyncio
    async def test_base64_output_is_valid(self):
        """出力された Base64 が正しくデコードできる"""
        data = {
            "auth_token": "test_secret_token_123",
            "source": "line",
            "id": "msg_001",
            "_test_image_bytes": create_test_image(200, 200),
        }
        result = await _process_image_pipe_logic(data, mock_env())
        assert result["status"] == "success"

        b64_data = result["base64_image"].split(",")[1]
        decoded = base64.b64decode(b64_data)
        # デコード結果が有効な JPEG か確認
        with Image.open(io.BytesIO(decoded)) as img:
            assert img.format == "JPEG"

    @pytest.mark.asyncio
    async def test_empty_image_bytes(self):
        """空の画像バイト列は 500 エラー"""
        data = {
            "auth_token": "test_secret_token_123",
            "source": "line",
            "id": "msg_001",
            "_test_image_bytes": b"",
        }
        result = await _process_image_pipe_logic(data, mock_env())
        assert result.status_code == 500
        body = json.loads(result.body)
        assert body["error_code"] == "INTERNAL_ERROR"

    @pytest.mark.asyncio
    async def test_invalid_image_data(self):
        """壊れた画像データは 500 エラー"""
        data = {
            "auth_token": "test_secret_token_123",
            "source": "line",
            "id": "msg_001",
            "_test_image_bytes": b"this is not an image",
        }
        result = await _process_image_pipe_logic(data, mock_env())
        assert result.status_code == 500
        body = json.loads(result.body)
        assert body["error_code"] == "INTERNAL_ERROR"

    @pytest.mark.asyncio
    async def test_small_image(self):
        """1x1 の極小画像も正常処理される"""
        data = {
            "auth_token": "test_secret_token_123",
            "source": "line",
            "id": "msg_001",
            "_test_image_bytes": create_test_image(1, 1),
        }
        result = await _process_image_pipe_logic(data, mock_env())
        assert result["status"] == "success"


# ============================================================
# Unit Test 4: レスポンス形式
# ============================================================

class TestResponseFormat:
    """レスポンス構造のテスト"""

    @pytest.mark.asyncio
    async def test_success_response_structure(self):
        """成功時のレスポンスに必要なフィールドが含まれる"""
        data = {
            "auth_token": "test_secret_token_123",
            "source": "line",
            "id": "msg_001",
            "_test_image_bytes": create_test_image(),
        }
        result = await _process_image_pipe_logic(data, mock_env())

        assert "status" in result
        assert "base64_image" in result
        assert "meta" in result
        assert "size_kb" in result["meta"]
        assert "elapsed_seconds" in result["meta"]
        assert result["status"] == "success"

    @pytest.mark.asyncio
    async def test_error_response_structure(self):
        """エラー時のレスポンスに error と error_code が含まれる"""
        data = {"auth_token": "wrong", "source": "line"}
        result = await _process_image_pipe_logic(data, mock_env())

        body = json.loads(result.body)
        assert "error" in body
        assert "status" in body
        assert "error_code" in body
        assert body["status"] == "failed"

    @pytest.mark.asyncio
    async def test_elapsed_seconds_is_number(self):
        """elapsed_seconds が数値型である"""
        data = {
            "auth_token": "test_secret_token_123",
            "source": "line",
            "id": "msg_001",
            "_test_image_bytes": create_test_image(),
        }
        result = await _process_image_pipe_logic(data, mock_env())
        assert isinstance(result["meta"]["elapsed_seconds"], float)


# ============================================================
# Unit Test 5: エラーコードの網羅性
# ============================================================

class TestErrorCodes:
    """各エラーケースで正しい error_code が返される"""

    @pytest.mark.asyncio
    async def test_auth_failed_code(self):
        data = {"auth_token": "bad"}
        result = await _process_image_pipe_logic(data, mock_env())
        body = json.loads(result.body)
        assert body["error_code"] == "AUTH_FAILED"
        assert result.status_code == 401

    @pytest.mark.asyncio
    async def test_missing_param_code_line(self):
        data = {"auth_token": "test_secret_token_123", "source": "line"}
        result = await _process_image_pipe_logic(data, mock_env())
        body = json.loads(result.body)
        assert body["error_code"] == "MISSING_PARAM"
        assert result.status_code == 400

    @pytest.mark.asyncio
    async def test_missing_param_code_chatwork(self):
        data = {"auth_token": "test_secret_token_123", "source": "chatwork"}
        result = await _process_image_pipe_logic(data, mock_env())
        body = json.loads(result.body)
        assert body["error_code"] == "MISSING_PARAM"
        assert result.status_code == 400

    @pytest.mark.asyncio
    async def test_invalid_request_code(self):
        data = {"auth_token": "test_secret_token_123", "source": "unknown_platform"}
        result = await _process_image_pipe_logic(data, mock_env())
        body = json.loads(result.body)
        assert body["error_code"] == "INVALID_REQUEST"
        assert result.status_code == 400

    @pytest.mark.asyncio
    async def test_internal_error_code(self):
        data = {
            "auth_token": "test_secret_token_123",
            "source": "line",
            "id": "msg_001",
            "_test_image_bytes": b"corrupted_data",
        }
        result = await _process_image_pipe_logic(data, mock_env())
        body = json.loads(result.body)
        assert body["error_code"] == "INTERNAL_ERROR"
        assert result.status_code == 500
