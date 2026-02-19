/**
 * miibo APIを呼び出してチャットを行う関数
 * @param {string} userId - ユーザーID (cw_xxxx or line_xxxx)
 * @param {string} query - ユーザーからのテキストメッセージ
 * @param {string} base64Image - 画像がある場合のBase64データ (ない場合はnull)
 * @returns {string} - miiboからの回答テキスト
 */
function callMiiboChat(userId, query, base64Image = null) {
    const props = PropertiesService.getScriptProperties();
    const uId = String(userId).trim();
    const sessionKey = 'SESSION_' + uId;

    // 会話リセット判定
    const q = (query || "").trim().toLowerCase();
    if (['リセット', 'clear', 'reset', '終了'].includes(q)) {
        props.deleteProperty(sessionKey);
        return "🗑️ 会話の記録をリセットしました。";
    }

    const endpoint = "https://api-mebo.dev/v1/chat";

    const payload = {
        "api_key": CONFIG.MIIBO_API_KEY,
        "agent_id": CONFIG.MIIBO_AGENT_ID,
        "utterance": query || "画像を解析してください",
        "uid": uId,
        "at": new Date().toISOString()
    };

    // 画像がある場合は拡張パラメータとして追加 (miiboの仕様に合わせる)
    if (base64Image) {
        // miiboの画像入力仕様に基づき、画像データをセット
        // ※ エージェントの設定で画像認識が有効である必要があります
        payload.image_data = base64Image;
    }

    const options = {
        "method": "post",
        "contentType": "application/json",
        "payload": JSON.stringify(payload),
        "muteHttpExceptions": true
    };

    try {
        const response = UrlFetchApp.fetch(endpoint, options);
        const code = response.getResponseCode();
        const content = response.getContentText();
        const json = JSON.parse(content);

        if (code !== 200) {
            console.error(`miibo API Error: ${code}`, content);
            return `⚠️ miiboエラーが発生しました (${code})`;
        }

        return json.bestResponse.utterance;

    } catch (e) {
        console.error("Call miibo Failed:", e);
        return "⚠️ システムエラーが発生しました。";
    }
}
