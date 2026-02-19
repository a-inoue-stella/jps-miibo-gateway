/**
 * スプレッドシートオープン時にメニューを追加
 * ※ admin.js の onOpen に統合しました
 */
/*
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🚀 システム管理')
    .addItem('1. 【初回のみ】ログシート初期構築', 'initializeLogSheets')
    .addSeparator()
    .addItem('2. 【設定】APIキー登録', 'showConfigDialog')
    .addToUi();
}
*/

/**
 * APIキー設定用のHTMLダイアログを表示
 */
function showConfigDialog() {
  const html = HtmlService.createHtmlOutputFromFile('ConfigDialog')
    .setWidth(450)
    .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, '⚙️ システム環境設定 (APIキー)');
}

/**
 * フォームから受け取った値をスクリプトプロパティに保存
 * @param {Object} formObject - HTMLフォームからの入力値
 */
function saveEnvironmentConfig(formObject) {
  const props = PropertiesService.getScriptProperties();
  const currentProps = props.getProperties();

  // 入力があった項目のみ更新（空欄の場合は既存値を維持）
  const newProps = { ...currentProps };

  if (formObject.lineToken) newProps['LINE_ACCESS_TOKEN'] = formObject.lineToken;
  if (formObject.chatworkToken) newProps['CHATWORK_API_TOKEN'] = formObject.chatworkToken;

  // ★追加: Bot IDの保存
  if (formObject.botId) newProps['BOT_ACCOUNT_ID'] = formObject.botId;

  if (formObject.miiboKey) newProps['MIIBO_API_KEY'] = formObject.miiboKey;
  if (formObject.miiboAgentId) newProps['MIIBO_AGENT_ID'] = formObject.miiboAgentId;
  if (formObject.authToken) newProps['INTERNAL_AUTH_TOKEN'] = formObject.authToken;
  if (formObject.modalUrl) newProps['MODAL_ENDPOINT_URL'] = formObject.modalUrl;

  props.setProperties(newProps);

  return '✅ 設定を保存しました。\n次回実行時より反映されます。';
}

/**
 * ログ保存用のシートとヘッダーを自動作成（変更なし）
 */
function initializeLogSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  const sheetDefinitions = [
    {
      name: 'Conversation_Log',
      headers: ['Timestamp', 'Platform', 'UserID', 'SessionID', 'UserQuery', 'AIAnswer', 'ImageAttached'],
      description: '会話ログ'
    },
    {
      name: 'System_Error_Log',
      headers: ['Timestamp', 'Module', 'UserID', 'ErrorMessage', 'StackTrace'],
      description: 'エラーログ'
    }
  ];

  let createdCount = 0;
  sheetDefinitions.forEach(def => {
    let sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
      sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, def.headers.length).setFontWeight('bold').setBackground('#EFEFEF');
      createdCount++;
    }
  });

  // --- INTERNAL_AUTH_TOKEN の自動生成 ---
  const props = PropertiesService.getScriptProperties();
  let authToken = props.getProperty('INTERNAL_AUTH_TOKEN');
  let tokenGenerated = false;

  if (!authToken) {
    authToken = generateRandomToken(32);
    props.setProperty('INTERNAL_AUTH_TOKEN', authToken);
    tokenGenerated = true;
  }

  if (createdCount > 0 || tokenGenerated) {
    let msg = `✅ セットアップが完了しました。\n\n`;
    if (createdCount > 0) msg += `・${createdCount} つのログシートを作成しました。\n`;
    if (tokenGenerated) {
      msg += `・セキュリティトークンを新規生成しました。\n\n`;
      msg += `【重要：Modalへの設定用】\n`;
      msg += `以下のトークンをModalのSecret(INTERNAL_AUTH_TOKEN)に設定してください：\n`;
      msg += `--------------------------------\n`;
      msg += `${authToken}\n`;
      msg += `--------------------------------`;
    } else {
      msg += `・既存のセキュリティトークンを維持しました。`;
    }
    ui.alert('初期セットアップ完了', msg, ui.ButtonSet.OK);
  } else {
    ui.alert('ℹ️ 完了', 'シートおよびトークンは既に存在します。内容を確認したい場合はスクリプトプロパティを確認してください。', ui.ButtonSet.OK);
  }
}

/**
 * ランダムな文字列を生成する
 */
function generateRandomToken(length) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let res = "";
  for (let i = 0; i < length; i++) {
    res += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return res;
}