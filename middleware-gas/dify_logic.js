/**
 * Dify APIを呼び出してチャットを行う関数
 * * @param {string} userId - ユーザーID (cw_xxxx)
 * @param {string} query - ユーザーからのテキストメッセージ
 * @param {string} fileId - 画像がある場合のDify用ファイルID (ない場合はnull)
 * @returns {string} - Difyからの回答テキスト
 */
function callDifyChat(userId, query, fileId = null) {
  const props = PropertiesService.getScriptProperties();
  
  // IDの正規化（念のため余計な空白を除去）
  const uId = String(userId).trim();
  
  // プロパティキーの定義
  const sessionKey = 'SESSION_' + uId;
  const imageKey = 'ACTIVE_IMAGE_' + uId;
  const timeKey = 'LAST_ACCESS_' + uId;

  // コマンド判定用に小文字化・トリム
  const q = (query || "").trim().toLowerCase();
  
  // ==========================================
  // 1. リセット判定（強力クリーンアップ）
  // ==========================================
  // 以下のキーワードが含まれる場合、GAS側の記憶を物理削除して終了
  if (['リセット', 'clear', 'reset', '終了', 'しゅうりょう'].includes(q) || q.includes('会話をリセット')) {
    props.deleteProperty(sessionKey);
    props.deleteProperty(imageKey);
    props.deleteProperty(timeKey);
    
    console.log(`[RESET] User: ${uId} の記憶を消去しました`);
    return "🗑️ 会話と画像の記憶をリセットしました。新しい作業について教えてください。";
  }

  // ==========================================
  // 2. 画像処理（修正：使い回しの廃止）
  // ==========================================
  let fileIdToSend = null;
  
  if (fileId) {
    // 今回新しく画像が添付された場合のみセット
    fileIdToSend = fileId;
    
    // ログ調査用に一応保存はしておくが、次回以降の自動送信には使わない
    props.setProperty(imageKey, fileId); 
  } else {
    // テキストのみの場合は、明示的に null にする
    // ★ここが修正点：以前はここで props.getProperty(imageKey) を読み込んでいました
    fileIdToSend = null; 
  }

  // ==========================================
  // 3. タイムアウト/セッション管理
  // ==========================================
  // 最終アクセスから時間が空きすぎていたらセッションを切る（例: 60分）
  /* // 必要であればコメントアウトを外して有効化してください
  const lastAccess = props.getProperty(timeKey);
  const now = new Date().getTime();
  if (lastAccess && (now - parseInt(lastAccess)) > 60 * 60 * 1000) {
    props.deleteProperty(sessionKey); // セッション破棄
  }
  props.setProperty(timeKey, String(now));
  */

  // 現在のセッションIDを取得（なければ空文字＝新規会話）
  const currentSessionId = props.getProperty(sessionKey) || "";

  // ==========================================
  // 4. Dify APIリクエスト作成
  // ==========================================
  const endpoint = `${CONFIG.DIFY_BASE_URL}/chat-messages`;
  
  // 画像のみでテキストが空の場合、AIが困らないよう補完する
  const textInput = (query && query.trim() !== "") ? query : "画像を解析してください";

  const payload = {
    "inputs": {},
    "query": textInput,
    "response_mode": "blocking",
    "user": uId,
    "conversation_id": currentSessionId,
    "files": []
  };

  // 今回送る画像がある場合のみリストに追加
  if (fileIdToSend) {
    payload.files = [{
      "type": "image",
      "transfer_method": "local_file",
      "upload_file_id": fileIdToSend
    }];
  }

  const options = {
    "method": "post",
    "contentType": "application/json",
    "headers": {
      "Authorization": `Bearer ${CONFIG.DIFY_API_KEY}`
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  // ==========================================
  // 5. API送信とレスポンス処理
  // ==========================================
  try {
    const response = UrlFetchApp.fetch(endpoint, options);
    const code = response.getResponseCode();
    const content = response.getContentText();
    const json = JSON.parse(content);

    if (code !== 200) {
      console.error(`Dify API Error: ${code}`, content);
      return `⚠️ エラーが発生しました (${code})。時間を置いて再試行するか、リセットしてください。`;
    }

    // 新しい conversation_id を保存（会話を継続するため）
    if (json.conversation_id) {
      props.setProperty(sessionKey, json.conversation_id);
    }

    // 回答を返す
    return json.answer;

  } catch (e) {
    console.error("Call Dify Failed:", e);
    return "⚠️ システムエラーが発生しました。管理者に連絡してください。";
  }
}