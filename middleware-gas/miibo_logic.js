/**
 * miibo APIを呼び出してチャットを行う関数
 * @param {string} uid - ユーザー識別子
 * @param {string} message - 発言内容
 * @param {string} base64Image - 画像データ (null可)
 * @returns {string} - miiboからの回答テキスト
 */
function callMiiboApi(uid, message, base64Image = null) {
    const agentId = CONFIG.MIIBO_AGENT_ID;
    const endpoint = `https://api-mebo.dev/api/v1/agents/${agentId}/chat`;

    const payload = {
        "api_key": CONFIG.MIIBO_API_KEY,
        "agent_id": agentId,
        "uid": String(uid),
        "utterance": message || "画像を解析してください"
    };

    if (base64Image) {
        payload.base64_image = base64Image;
    }

    // デバッグ用ログ: Payloadサイズの出力
    const payloadStr = JSON.stringify(payload);
    console.log(`Payload Size: ${payloadStr.length} chars`);

    const options = {
        "method": "post",
        "contentType": "application/json",
        "payload": payloadStr,
        "muteHttpExceptions": true
    };

    try {
        const response = UrlFetchApp.fetch(endpoint, options);
        const code = response.getResponseCode();
        const content = response.getContentText();

        let json;
        try {
            json = JSON.parse(content);
        } catch (parseErr) {
            console.error("JSON Parse Error:", content);
            return "⚠️ サーバーからの応答を解析できませんでした。";
        }

        if (code !== 200) {
            console.error(`miibo API Error: ${code}`, content);
            return `⚠️ miiboエラーが発生しました (${code})`;
        }

        // レスポンス形式の確認
        if (json && json.bestResponse && json.bestResponse.utterance) {
            return json.bestResponse.utterance;
        } else {
            console.error("Unexpected miibo response format:", content);
            return "⚠️ miiboから有効な回答が得られませんでした。";
        }

    } catch (e) {
        console.error("Call miibo Failed:", e);
        return "⚠️ システムエラーが発生しました。時間を置いて再度お試しください。";
    }
}
