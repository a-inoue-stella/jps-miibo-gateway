import modal
import requests
from PIL import Image
import io
import os
import base64
import time
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse

# --- 1. Infrastructure ---
image = (
    modal.Image.debian_slim()
    .pip_install("requests", "pillow", "fastapi", "pydantic")
)

app = modal.App("jps-miibo-gateway", image=image)

# --- Constants ---
MAX_PAYLOAD_BYTES = 2_250_000  # Base64変換後 ≒ 3MB に相当するバイト上限
MAX_IMAGE_DIMENSION = 2048
JPEG_QUALITY = 80

# --- 2. Core Logic ---
@app.function(secrets=[modal.Secret.from_name("jps-miibo-secrets")])
@modal.fastapi_endpoint(method="POST")
async def process_image_pipe(data: dict):
    """
    Gateway to download (LINE/Chatwork), resize, compress and base64-encode images.
    """
    start_time = time.time()
    user_id = data.get("user", "unknown")
    source = data.get("source", "unknown")
    print(f"🚀 [START] Processing Image | user={user_id} source={source}")

    # --- Security check ---
    env_token = os.environ.get("INTERNAL_AUTH_TOKEN")
    if env_token:
        req_token = data.get("auth_token")
        if not req_token or req_token != env_token:
            print(f"⛔ Unauthorized Access Attempt | user={user_id}")
            return JSONResponse(
                status_code=401,
                content={"error": "Unauthorized", "status": "failed", "error_code": "AUTH_FAILED"}
            )

    # --- Common parameters ---
    resource_id = data.get("id")
    resource_url = data.get("url")
    image_url_direct = data.get("image_url")  # For direct URL support

    try:
        # 1. Download Image (Source Specific)
        image_bytes = None

        if source == "line":
            if not resource_id:
                return JSONResponse(
                    status_code=400,
                    content={"error": "Missing 'id' for LINE", "status": "failed", "error_code": "MISSING_PARAM"}
                )

            line_token = os.environ.get("LINE_ACCESS_TOKEN") or os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
            if not line_token:
                raise Exception("LINE Token not found in Secrets")

            url = f"https://api-data.line.me/v2/bot/message/{resource_id}/content"
            headers = {"Authorization": f"Bearer {line_token}"}
            print(f"Downloading from LINE: {url}")
            resp = requests.get(url, headers=headers, stream=True, timeout=30)
            if resp.status_code != 200:
                raise Exception(f"LINE API Error: {resp.status_code} {resp.text}")
            image_bytes = resp.content

        elif source == "chatwork":
            # GAS側でダウンロードURLを発行して送る（唯一の経路）
            if not resource_url:
                return JSONResponse(
                    status_code=400,
                    content={"error": "Missing 'url' for Chatwork", "status": "failed", "error_code": "MISSING_PARAM"}
                )

            print(f"Downloading from Chatwork...")
            resp_bin = requests.get(resource_url, stream=True, timeout=30)
            if resp_bin.status_code != 200:
                raise Exception(f"Chatwork Download Error: {resp_bin.status_code} {resp_bin.text}")
            image_bytes = resp_bin.content

        elif image_url_direct:
            print(f"Downloading from direct URL: {image_url_direct}")
            resp = requests.get(image_url_direct, timeout=30)
            if resp.status_code != 200:
                raise Exception(f"Failed to download image: HTTP {resp.status_code} {resp.text}")
            image_bytes = resp.content

        else:
            return JSONResponse(
                status_code=400,
                content={"error": "Invalid source or missing image parameters", "status": "failed", "error_code": "INVALID_REQUEST"}
            )

        if not image_bytes:
            raise Exception("Image data is empty.")

        # 2. Resize and Compress
        with Image.open(io.BytesIO(image_bytes)) as img:
            try:
                from PIL import ImageOps
                img = ImageOps.exif_transpose(img)
            except Exception:
                pass  # EXIF情報が無い/壊れている場合はスキップ

            if img.mode != "RGB":
                img = img.convert("RGB")

            img.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION))

            output_buffer = io.BytesIO()
            img.save(output_buffer, format="JPEG", quality=JPEG_QUALITY)
            optimized_bytes = output_buffer.getvalue()

        # 3. Size Check (エンコード前にバイトサイズで判定)
        size_kb = len(optimized_bytes) / 1024
        if len(optimized_bytes) > MAX_PAYLOAD_BYTES:
            print(f"⚠️ Payload too large: {size_kb:.1f} KB | user={user_id}")
            return JSONResponse(
                status_code=413,
                content={"error": f"Payload Too Large ({size_kb:.0f}KB > {MAX_PAYLOAD_BYTES // 1024}KB limit)", "status": "failed", "error_code": "PAYLOAD_TOO_LARGE"}
            )

        # 4. Base64 Encode
        base64_data = base64.b64encode(optimized_bytes).decode('utf-8')
        base64_string = f"data:image/jpeg;base64,{base64_data}"

        elapsed = round(time.time() - start_time, 2)
        print(f"✅ Success: {size_kb:.1f} KB in {elapsed}s | user={user_id}")

        # 5. Response
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
        print(f"❌ Error: {str(e)} | user={user_id} elapsed={elapsed}s")
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "status": "failed", "error_code": "INTERNAL_ERROR"}
        )