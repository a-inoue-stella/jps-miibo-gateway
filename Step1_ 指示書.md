# Role
あなたはPythonおよびModal (Serverless GPU Platform) のエキスパートエンジニアです。
現在開いている `backend-modal/src/app.py` を、miibo連携用の「画像軽量化・Base64変換ゲートウェイ」へリファクタリングします。

# Task Constraints (重要: GAS保護)
呼び出し元の Google Apps Script (GAS) はメモリ制限が厳しいため、**レスポンスのペイロードサイズを厳格に制御**する必要があります。

# Requirements
1. **Dify関連コードの全削除**:
   - `requests.post` でDifyへアップロードする処理や、DifyのAPIキーを取得する処理は全て削除してください。

2. **画像処理フロー**:
   - 入力: JSON `{"image_url": "...", ...}`
   - 処理:
     1. 画像をダウンロード。
     2. **リサイズ**: 長辺 **2048px** に縮小 (アスペクト比維持)。
     3. **圧縮**: JPEG形式, **Quality=80** (少し下げてサイズ優先)。
     4. **エンコード**: Base64文字列へ変換。
     5. **【重要】サイズチェック**:
        - Base64文字列の長さが **3MB** (約3,000,000文字) を超える場合は、例外 (`HTTP 413 Payload Too Large`) またはエラーJSONを返し、決して巨大なデータをGASへ返却しないこと。

3. **レスポンス形式**:
   処理成功時は、以下のキーを持つJSONオブジェクトを返却してください。
   - "status": 文字列 "success"
   - "base64_image": 文字列。"data:image/jpeg;base64," で始まるBase64エンコードされた画像データ。
   - "meta": オブジェクト。内部に "size_kb" (数値、KB単位のサイズ) を含める。

4. **ライブラリ**:
   - 標準ライブラリ `base64` をインポートに追加してください。

# Output
上記仕様を満たす、シンプルかつ堅牢な `app.py` のコードを出力してください。