/**
 * miibo APIを呼び出してチャットを行う関数
 * @param {string} uid - ユーザー識別子
 * @param {string} message - 発言内容
 * @param {string} base64Image - 画像データ (null可)
 * @returns {string} - miiboからの回答テキスト
 */
function callMiiboApi(uid, message, base64Image = null) {
    const agentId = CONFIG.MIIBO_AGENT_ID;
    const endpoint = 'https://api-mebo.dev/api';

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

/**
 * miibo の会話履歴とステートを初期化する
 * 空の utterance と初期値の state を送信することで短期記憶をリセットする
 * @param {string} uid - ユーザー識別子
 * @returns {boolean} 成功時 true、失敗時 false
 */
function resetMiiboConversation(uid) {
    const endpoint = 'https://api-mebo.dev/api';

    const payload = {
        "api_key": CONFIG.MIIBO_API_KEY,
        "agent_id": CONFIG.MIIBO_AGENT_ID,
        "uid": String(uid),
        "utterance": "",
        "state":{
                    "current_phase": "hearing",
                    "target_mode": "未定",
                    "target_device": "不明",
                    "is_map_e": "不明",
                    "has_hgw": "不明",
                    "line_installation_date": "不明",
                    "fasttrack_topic": "該当なし",
                    "current_step_status": "ヒアリング中",
                    "line_item": "不明",
                    "hikari_denwa": "不明"
                }

    };

    const options = {
        "method": "post",
        "contentType": "application/json",
        "payload": JSON.stringify(payload),
        "muteHttpExceptions": true
    };

    try {
        const response = UrlFetchApp.fetch(endpoint, options);
        const code = response.getResponseCode();

        if (code === 200) {
            console.log(`miibo conversation reset successful for uid: ${uid}`);
            return true;
        } else {
            console.error(`miibo reset API Error: ${code}`, response.getContentText());
            return false;
        }
    } catch (e) {
        console.error("miibo reset Failed:", e);
        return false;
    }
}
