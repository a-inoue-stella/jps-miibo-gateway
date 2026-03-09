// ==================================================
// 🛠️ 現場レスキューAI : システム診断モード
// このファイルはデバッグ用です。本番環境への影響はありません。
// ==================================================

/**
 * 1. 一括診断を実行する
 * まずはこの関数を選択して「実行」を押してください。
 */
function runSystemDiagnostics() {
  console.log("=== 🏥 システム診断を開始します ===");

  const results = {
    config: testConfiguration(),
    spreadsheet: testSpreadsheetAccess(),
    miibo: testMiiboConnection()
  };

  console.log("=== 📊 診断結果サマリー ===");
  console.log(`1. 設定値ロード: ${results.config ? '✅ OK' : '❌ NG'}`);
  console.log(`2. ログシート接続: ${results.spreadsheet ? '✅ OK' : '❌ NG'}`);
  console.log(`3. AIサーバー接続: ${results.miibo ? '✅ OK' : '❌ NG'}`);

  if (results.config && results.spreadsheet && results.miibo) {
    console.log("✨ 基本システムは正常です。Webhook設定や通信経路の問題の可能性があります。");
  } else {
    console.error("⚠️ システム内部に問題が見つかりました。上記のNG項目を確認してください。");
  }
}

/**
 * 診断1: 設定値の読み込みテスト
 */
function testConfiguration() {
  console.log("\n[Test 1] 設定値の確認...");
  try {
    const props = PropertiesService.getScriptProperties();
    const miiboKey = props.getProperty('MIIBO_API_KEY');
    const miiboAgentId = props.getProperty('MIIBO_AGENT_ID');
    const botId = props.getProperty('BOT_ACCOUNT_ID');

    if (!miiboKey || !miiboAgentId) {
      console.error("❌ エラー: MIIBO_API_KEY または MIIBO_AGENT_ID が設定されていません。");
      return false;
    }

    // Bot IDのチェックを追加
    if (!botId) {
      console.error("❌ エラー: BOT_ACCOUNT_ID が設定されていません。Chatwork連携に必須です。");
      console.error("   対策: スクリプトプロパティに、Bot自身のChatworkアカウントID（数字）を設定してください。");
      return false;
    }

    console.log(`ℹ️ Bot Account ID: ${botId}`);
    console.log("✅ 設定値は正常に読み込めました。");
    return true;
  } catch (e) {
    console.error("❌ エラー: スクリプトプロパティにアクセスできません。", e);
    return false;
  }
}

/**
 * 診断2: スプレッドシート書き込み権限テスト
 */
function testSpreadsheetAccess() {
  console.log("\n[Test 2] スプレッドシート アクセス権限の確認...");
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      console.error("❌ エラー: スプレッドシートが見つかりません。このスクリプトはコンテナバインドされていますか？");
      return false;
    }

    // エラーログシートへの書き込みテスト
    // ※ logger.js の関数を直接呼ぶ
    if (typeof logError !== 'function') {
      console.error("❌ エラー: logger.js の logError 関数が見つかりません。");
      return false;
    }

    logError('SystemTest', 'DebugUser', 'これはテスト書き込みです。無視してください。');
    console.log("✅ スプレッドシートへの追記に成功しました。ログシートを確認してください。");
    return true;

  } catch (e) {
    console.error("❌ エラー: スプレッドシートへの書き込みに失敗しました。", e);
    return false;
  }
}

/**
 * 診断3: miibo APIとの疎通テスト
 */
function testMiiboConnection() {
  console.log("\n[Test 3] miibo API 接続テスト...");
  try {
    const userId = "debug_user_001";
    const message = "接続テストです。";

    if (typeof callMiiboApi !== 'function') {
      console.error("❌ エラー: callMiiboApi 関数が見つかりません。");
      return false;
    }

    console.log("ℹ️ miiboへ送信中...");
    const response = callMiiboApi(userId, message);

    if (!response || response.startsWith("⚠️")) {
      console.error(`❌ エラー: miiboからの応答が異常です -> ${response}`);
      return false;
    }

    console.log(`✅ miiboからの応答: "${response}"`);
    return true;

  } catch (e) {
    console.error("❌ エラー: miiboへの接続中に例外が発生しました。", e);
    return false;
  }
}

/**
 * 応用: LINEからのメッセージ受信をシミュレートする
 * (doPostのロジックが動くか確認)
 */
function simulateLineWebhook() {
  console.log("\n[Simulation] LINE Webhook 受信テスト...");

  // テスト用のダミーイベントデータ
  const dummyEvent = {
    "destination": "xxxxxxxxxx",
    "events": [
      {
        "type": "message",
        "message": {
          "type": "text",
          "id": "1234567890",
          "text": "テストメッセージ"
        },
        "webhookEventId": "01FZ74A0TDDPYRVKNK77XKC3ZR",
        "deliveryContext": {
          "isRedelivery": false
        },
        "timestamp": 1616560000000,
        "source": {
          "type": "user",
          "userId": "Udeadbeefdeadbeefdeadbeefdeadbeef" // テスト用ユーザーID
        },
        "replyToken": "00000000000000000000000000000000",
        "mode": "active"
      }
    ]
  };

  const req = {
    postData: {
      contents: JSON.stringify(dummyEvent)
    }
  };

  try {
    // doPostを直接呼ぶと return 値が ContentOutput になるため、実行ログでエラーが出なければOK
    console.log("ℹ️ handleLineEvents を呼び出します...");

    // handleLineEvents は main.js にある関数
    if (typeof handleLineEvents === 'function') {
      handleLineEvents(dummyEvent);
      console.log("✅ 関数呼び出し完了。処理が最後まで走りました（replyToLineはエラーになる可能性がありますが無視してOK）");
    } else {
      console.error("❌ エラー: handleLineEvents が見つかりません。");
    }
  } catch (e) {
    console.error("❌ 致命的エラー: Webhook処理中にスクリプトがクラッシュしました。", e);
  }
}

/**
 * 応用: Chatworkからのメッセージ受信をシミュレートする
 * (doPost -> handleChatworkEvent のロジック確認)
 * 
 * 使い方: 
 * 1. この関数を選択して実行
 * 2. ログに「✅ Chatwork処理完了」が出るか確認
 * 3. スプレッドシートのログに書き込まれているか確認
 */
function simulateChatworkWebhook() {
  console.log("\n[Simulation] Chatwork Webhook 受信テスト...");

  // プロパティからボットIDを取得（自分自身へのメンション判定用）
  const props = PropertiesService.getScriptProperties();
  const botId = Number(props.getProperty('BOT_ACCOUNT_ID')) || 123456;

  console.log('ℹ️ Bot ID used for test: ' + botId);

  // テスト用のダミーイベントデータ (Webhook形式)
  const dummyPayload = {
    "webhook_setting_id": "12345",
    "webhook_event_type": "message_created",
    "webhook_event_time": 1616560000,
    "webhook_event": {
      "from_account_id": 999999, // テストユーザーID
      "to_account_id": botId,    // Bot宛て
      "room_id": 12345678,       // テストルームID
      "message_id": "1234567890",
      "body": '[To:' + botId + '] これはChatworkからのテストメッセージです。', // メンション付き
      "send_time": 1616560000,
      "update_time": 0
    }
  };

  try {
    console.log("ℹ️ handleChatworkEvent を呼び出します...");

    // main.js の handleChatworkEvent を使用
    // ※注意: 実際にmiiboへ飛び、Chatworkへ返信しようとします（UrlFetchが走る）
    // 実際のChatworkルームが存在しないIDの場合、返信部分はエラーになりますが、
    // ログ保存(logConversation)までは進むはずです。

    if (typeof handleChatworkEvent === 'function') {
      handleChatworkEvent(dummyPayload);
      console.log("✅ Chatwork処理関数が終了しました。");
      console.log("👉 スプレッドシートの「Conversation_Log_LINE」「Conversation_Log_Chatwork」を確認してください。");
      console.log("   (APIエラーがログに出ていれば、ロジック自体は動いています)");
    } else {
      console.error("❌ エラー: handleChatworkEvent が見つかりません。");
    }
  } catch (e) {
    console.error("❌ 致命的エラー: Webhook処理中にスクリプトがクラッシュしました。", e);
  }
}
