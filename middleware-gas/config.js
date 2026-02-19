// config.js

// --- 環境設定と定数定義 ---
const PROPS = PropertiesService.getScriptProperties();

const CONFIG = {
  // 外部サービス連携キー
  LINE_ACCESS_TOKEN: PROPS.getProperty('LINE_ACCESS_TOKEN'),
  CHATWORK_API_TOKEN: PROPS.getProperty('CHATWORK_API_TOKEN'),
  MIIBO_API_KEY: PROPS.getProperty('MIIBO_API_KEY'),
  MIIBO_AGENT_ID: PROPS.getProperty('MIIBO_AGENT_ID'),

  // 接続先URL
  MODAL_ENDPOINT_URL: PROPS.getProperty('MODAL_ENDPOINT_URL'),

  // セキュリティ
  INTERNAL_AUTH_TOKEN: PROPS.getProperty('INTERNAL_AUTH_TOKEN'),

  // ★変更: Bot自身のChatworkアカウントID (プロパティから取得し数値化)
  // ※取得できない場合は 0 にして誤動作を防ぐ
  BOT_ACCOUNT_ID: Number(PROPS.getProperty('BOT_ACCOUNT_ID')) || 0,

  // ログ設定
  LOG_SHEET_CONVERSATION: 'Conversation_Log',
  LOG_SHEET_ERROR: 'System_Error_Log'
};

// 設定漏れチェック
function checkConfig() {
  const missing = [];
  if (!CONFIG.LINE_ACCESS_TOKEN) missing.push('LINE_ACCESS_TOKEN');
  if (!CONFIG.MIIBO_API_KEY) missing.push('MIIBO_API_KEY'); // DIFY_API_KEYをMIIBO_API_KEYに置き換え
  if (!CONFIG.MODAL_ENDPOINT_URL) missing.push('MODAL_ENDPOINT_URL');
  if (!CONFIG.INTERNAL_AUTH_TOKEN) missing.push('INTERNAL_AUTH_TOKEN');

  // ★追加: チェック項目に追加
  if (!CONFIG.BOT_ACCOUNT_ID) missing.push('BOT_ACCOUNT_ID');

  if (missing.length > 0) {
    console.warn('⚠️ Missing Configs:', missing);
  } else {
    console.log('✅ Configuration OK');
  }
}