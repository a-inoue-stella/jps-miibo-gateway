import modal
import requests
from PIL import Image
import io
import os
import base64
from fastapi import Request, HTTPException

# --- 1. Infrastructure ---
image = (
    modal.Image.debian_slim()
    .pip_install("requests", "pillow", "fastapi", "pydantic")
)

app = modal.App("jps-miibo-gateway", image=image)

# --- 2. Core Logic ---
@app.function(secrets=[modal.Secret.from_name("jps-miibo-secrets")])
@modal.fastapi_endpoint(method="POST")
async def process_image_pipe(data: dict):
    """
    Gateway to download (LINE/Chatwork), resize, compress and base64-encode images.
    """
    print(f"🚀 [START] Processing Image: {data}")

    # Security check
    req_token = data.get("auth_token")
    env_token = os.environ.get("INTERNAL_AUTH_TOKEN")
    if env_token and req_token and req_token != env_token:
        print(f"⛔ Unauthorized Access Attempt")
        return {"error": "Unauthorized", "status": "failed"}

    # Common parameters
    source = data.get("source")
    resource_id = data.get("id")
    resource_url = data.get("url")
    image_url_direct = data.get("image_url") # For direct URL support

    try:
        # 1. Download Image (Source Specific)
        image_bytes = None

        if source == "line":
            if not resource_id:
                raise Exception("Missing 'id' for LINE")
            
            line_token = os.environ.get("LINE_ACCESS_TOKEN") or os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
            if not line_token:
                raise Exception("LINE Token not found in Secrets")

            url = f"https://api-data.line.me/v2/bot/message/{resource_id}/content"
            headers = {"Authorization": f"Bearer {line_token}"}
            print(f"Downloading from LINE: {url}")
            resp = requests.get(url, headers=headers, stream=True)
            if resp.status_code != 200:
                raise Exception(f"LINE API Error: {resp.status_code} {resp.text}")
            image_bytes = resp.content

        # --- Chatworkの場合 ---
        elif source == "chatwork":
            # GAS側ですでにダウンロードURLを発行して送ってくれている場合 (推奨)
            if resource_url:
                dl_url = resource_url
            
            # GASがIDしか送ってこなかった場合 (バックアップ手段)
            elif resource_id:
                cw_token = os.environ.get("CHATWORK_API_TOKEN") or os.environ.get("X-ChatWorkToken")
                url_file = f"https://api.chatwork.com/v2/files/{resource_id}"
                headers = {"X-ChatWorkToken": cw_token}
                resp_link = requests.get(url_file, headers=headers)
                if resp_link.status_code != 200:
                     raise Exception(f"Chatwork Link Error: {resp_link.status_code} {resp_link.text}")
                dl_url = resp_link.json().get("download_url")
            else:
                raise Exception("Missing 'url' or 'id' for Chatwork")

            print(f"Downloading from Chatwork...")
            resp_bin = requests.get(dl_url, stream=True)
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
             return {"error": "Invalid source or missing image parameters", "status": "failed"}

        if not image_bytes:
             raise Exception("Image data is empty.")

        # 2. Resize and Compress
        with Image.open(io.BytesIO(image_bytes)) as img:
            try:
                from PIL import ImageOps
                img = ImageOps.exif_transpose(img)
            except:
                pass

            if img.mode != "RGB":
                img = img.convert("RGB")
            
            img.thumbnail((2048, 2048))
            
            output_buffer = io.BytesIO()
            img.save(output_buffer, format="JPEG", quality=80)
            optimized_bytes = output_buffer.getvalue()

        # 3. Base64 Encode
        base64_data = base64.b64encode(optimized_bytes).decode('utf-8')
        base64_string = f"data:image/jpeg;base64,{base64_data}"
        
        # 4. Size Check (Limit: 3MB)
        size_kb = len(optimized_bytes) / 1024
        if len(base64_string) > 3000000:
             return {"error": "Payload Too Large (Over 3MB)", "status": "failed"}

        print(f"✅ Success: {size_kb:.1f} KB")

        # 5. Response
        return {
            "status": "success",
            "base64_image": base64_string,
            "meta": {
                "size_kb": round(size_kb, 1)
            }
        }

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return {"error": str(e), "status": "failed"}