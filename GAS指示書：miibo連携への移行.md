# **Role**

あなたはGoogle Apps Script (GAS) のエキスパートエンジニアです。

現在、middleware-gas フォルダ内のコードを改修し、バックエンドAIをDifyから **miibo (国産AIプラットフォーム)** へ切り替えます。

# **Context**

現在、このシステムはLINEやChatworkからのメッセージをDifyに転送していますが、セキュリティ要件により接続先をmiiboに変更する必要があります。

# **Implement Tasks**

以下の3つのファイルを修正・作成してください。

## **1\. 設定ファイルの更新 (config.js)**

Difyに関連する定数（DifyのAPIキーやベースURL）を全て削除してください。

代わりに、以下の2つの定数を定義し、ScriptPropertiesから値を取得するように実装してください。

* 定数名: MIIBO\_API\_KEY  
* 定数名: MIIBO\_AGENT\_ID

## **2\. miiboクライアントの新規作成 (miibo\_client.js)**

新しく miibo\_logic.js というファイルを作成し、以下の仕様を満たす関数 callMiiboApi(uid, message, base64Image \= null) を実装してください。

### **API接続仕様**

* エンドポイントURL: [https://api-mebo.dev/api/v1/agents/](https://www.google.com/search?q=https://api-mebo.dev/api/v1/agents/){agentId}/chat  
* HTTPメソッド: POST  
* ヘッダー: Content-Type: application/json

### **リクエストボディ（Payload）の構成要件**

以下のプロパティを持つオブジェクトを作成してください。

* api\_key: 上記で定義した定数 MIIBO\_API\_KEY  
* agent\_id: 上記で定義した定数 MIIBO\_AGENT\_ID  
* uid: 引数で渡された uid (ユーザー識別子)  
* utterance: 引数で渡された message

### **画像送信時の処理**

引数 base64Image が存在する場合（nullでない場合）、上記Payloadオブジェクトに以下のプロパティを追加してください。

* プロパティ名: base64\_image  
* 値: 引数 base64Image の値をそのまま設定

### **エラーハンドリングとログ**

* UrlFetchApp.fetch は必ず try-catch ブロックで囲んでください。  
* リクエスト送信直前に、作成したPayloadオブジェクトを JSON.stringify した際の文字数を計算し、「Payload Size: XXX chars」という形式で console.log に出力してください（デバッグ用）。  
* miiboからのレスポンスを JSON.parse する際のエラー処理を含めてください。

## **3\. メインロジックの接続変更 (main.js)**

既存の dify\_logic.js への依存を排除し、作成した miibo\_client.js を使用するように書き換えてください。

### **ユーザーID (uid) の管理について**

miiboは uid をキーにして会話履歴を保持します。以下の通り、プラットフォームごとのユーザーIDを確実に文字列化して uid 引数に渡してください。

* LINEの場合: イベントオブジェクトの source.userId を使用  
* Chatworkの場合: メッセージオブジェクトの account\_id を使用。ただし、数値で来る場合があるため、必ず String() 関数で文字列型に変換すること。

# **Output**

以上の仕様に基づき、修正・作成が必要な以下の3ファイルの全コードを出力してください。

1. config.js  
2. miibo\_logic.js  
3. main.js