(() => {
  "use strict";
  // Dify chat-messages endpoint（ベースURLは同じ）
  const API_ENDPOINT = "https://dtrnuhsofbgdn.cloudfront.net/v1/chat-messages";
  // プロファイル（キャラ）定義：APIキーと画像マップをプロファイルごとに
  // 画像パスはダミー/例です。あとから自由に差し替えてください。
  const PROFILES = {
    char1: {
      name: "Minori",
      apiKey: "app-s5RH6G6Fr7CKy6GgrMc8ZGMv", // 既存のアプリキー
      images: {
        consider: "josei_20_h.png",
        calm: "josei_20_a.png",
        smile: "josei_20_g.png",
        angry: "josei_20_c.png",
        surprise: "josei_20_e.png",
        sad: "josei_20_d.png",
      },
      defaultMood: "calm",
    },
    char2: {
      name: "Nagisa",
      apiKey: "app-CHsonCEORmv3V4pk5U2YACeO", // 新しいアプリキー
      images: {
        // ← ここは任意のファイルに差し替えてください
        consider: "dansei_16_h.png",
        calm: "dansei_16_f.png",
        smile: "dansei_16_g.png",
        angry: "dansei_16_d.png",
        surprise: "dansei_16_e.png",
        sad: "dansei_16_c.png",
        admire: "dansei_16_a.png",
        normal: "dansei_16_b.png",
      },
      defaultMood: "calm",
    },
    char3: {
      name: "Julian", // お好みで変更してください
      apiKey: "app-u52RfqgzpWdHJN3hvqS23mSQ",
      images: {
        consider: "josei_20_h.png", // 画像は差し替えてOK
        calm: "Julian.jpg",
        smile: "josei_20_g.png",
        angry: "josei_20_c.png",
        surprise: "josei_20_e.png",
        sad: "josei_20_d.png",
      },
      defaultMood: "calm",
    },
  };
  // 会話IDはプロファイルごとに別管理
  const conversationIds = { char1: "", char2: "" };
  // 現在のプロファイル
  let currentProfileId = "char1";
  const els = {
    query: document.getElementById("query"),
    startBtn: document.getElementById("startBtn"),
    stopBtn: document.getElementById("stopBtn"),
    messages: document.getElementById("messages"),
    chat: document.querySelector(".chat"),
    charBtns: Array.from(document.querySelectorAll(".charBtn")),
    // 旧レイアウトの左側<img>を使っている場合への後方互換
    characterImg: document.getElementById("image"),
  };
  let controller = null;
  let running = false;
  let currentAiBubbleTextNode = null;
  // 背景キャラの切替（.chat のCSS変数に適用）
  function setCharacterBg(imgPath) {
    if (els.chat) {
      els.chat.style.setProperty("--char-bg-image", `url(${imgPath})`);
    }
    // 旧の左側<img>を使っている場合にも反映（後方互換）
    if (els.characterImg) {
      els.characterImg.src = imgPath;
    }
  }
  // プロファイル適用（背景初期化・UI更新など）
  function applyProfile(profileId, { showNotice = true } = {}) {
    const profile = PROFILES[profileId];
    if (!profile) return;
    // 背景初期化
    const initial = profile.images[profile.defaultMood] || Object.values(profile.images)[0];
    if (initial) setCharacterBg(initial);
    // ボタンの active 表示
    els.charBtns.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.profile === profileId);
    });
    // UIクリア
    clearMessages();
    // 変更: 切替メッセージを5秒で自動消去
    if (showNotice) {
      const txt = `【${profile.name}】に切り替えました。${conversationIds[profileId] ? "前回の会話を継続します。" : "新しい会話を開始します。"}`;
      createSystemBubble(txt, { autoHideMs: 3000 });
    }
    // 念のため停止
    if (running && controller) controller.abort();
    currentAiBubbleTextNode = null;
  }
  function clearMessages() {
    if (els.messages) els.messages.innerHTML = "";
  }
  function setRunning(state) {
    running = state;
    if (els.startBtn) els.startBtn.disabled = state;
    if (els.stopBtn) els.stopBtn.disabled = !state;
    // 応答中は切替ボタンを押せないように
    els.charBtns.forEach(btn => btn.disabled = state);
  }
  // メッセージフキダシ生成
  function createMessageBubble(role, initialText = "") {
    const row = document.createElement("div");
    row.className = `msg ${role}`;
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    const textNode = document.createTextNode(initialText || "");
    bubble.appendChild(textNode);
    row.appendChild(bubble);
    els.messages.appendChild(row);
    row.scrollIntoView({ behavior: "smooth", block: "end" });
    return { row, bubble, textNode };
  }
  function createAiBubble(initialText = "") {
    const b = createMessageBubble("ai", initialText);
    currentAiBubbleTextNode = b.textNode;
    return b;
  }
  function appendToCurrentAiBubble(text) {
    if (!currentAiBubbleTextNode) {
      const { textNode } = createAiBubble();
      currentAiBubbleTextNode = textNode;
    }
    currentAiBubbleTextNode.textContent += text;
  }
  function createUserBubble(text) { return createMessageBubble("user", text); }
  function createSystemBubble(text, options = {}) {
    const b = createMessageBubble("system", text);
    // 追加: 自動消去（ms）を指定できるようにする
    const autoHideMs = options.autoHideMs;
    if (typeof autoHideMs === "number" && Number.isFinite(autoHideMs) && autoHideMs > 0) {
      const { row } = b;
      setTimeout(() => {
        if (!row) return;
        // フェードアウトしてから削除（任意の演出）
        row.style.transition = "opacity 200ms ease";
        row.style.opacity = "0";
        setTimeout(() => {
          try { row.remove(); } catch {}
        }, 220);
      }, autoHideMs);
    }
    return b;
  }
  
  async function startStreaming() {
    const profile = PROFILES[currentProfileId];
    if (!profile?.apiKey) {
      alert("現在のキャラのAPIキーが未設定です。");
      return;
    }
    const query = (els.query?.value || "").trim();
    if (!query) {
      alert("質問（query）を入力してください");
      return;
    }
    createUserBubble(query);
    els.query.value = "";
    const payload = {
      inputs: {},
      query,
      response_mode: "streaming",
      user: "abc-123",
    };
    // 変更: 会話IDがある場合のみ付与
    const cid = conversationIds[currentProfileId];
    if (cid) payload.conversation_id = cid;
    setRunning(true);
    controller = new AbortController();
    createAiBubble();
    try {
      const res = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${profile.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!res.ok) {
        const text = await safeReadText(res);
        throw new Error(`HTTP ${res.status} ${res.statusText}\n${text}`);
      }
      await readEventStream(res.body, onEvent);
    } catch (err) {
      if (err.name === "AbortError") {
        createSystemBubble("[中断しました]");
      } else {
        createSystemBubble(`[エラー] ${err.message || err}`);
      }
    } finally {
      setRunning(false);
      controller = null;
      currentAiBubbleTextNode = null;
    }
  }

  function stopStreaming() {
    if (controller) controller.abort();
  }
  async function readEventStream(stream, onEvent) {
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        processChunk(chunk, onEvent);
      }
    }
    if (buffer.trim()) processChunk(buffer, onEvent);
  }
  function processChunk(chunk, onEvent) {
    const lines = chunk.split(/\r?\n/);
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const jsonText = line.slice(5).trim();
      if (!jsonText) continue;
      try {
        const obj = JSON.parse(jsonText);
        onEvent(obj);
      } catch {
        // ignore
      }
    }
  }
  // outputs から最初に見つかった文字列
  function pickStringFromOutputs(outputs) {
    if (!outputs || typeof outputs !== "object") return undefined;
    const candidates = [
      outputs.output,
      outputs.text,
      outputs.rendered,
      outputs.result,
    ].filter(v => typeof v === "string" && v.length > 0);
    if (candidates.length > 0) return candidates[0];
    for (const v of Object.values(outputs)) {
      if (typeof v === "string" && v.length > 0) return v;
      if (v && typeof v === "object") {
        for (const vv of Object.values(v)) {
          if (typeof vv === "string" && vv.length > 0) return vv;
        }
      }
    }
    return undefined;
  }
  function onEvent(evt) {
    // 追加: どのイベントでも conversation_id があれば保存（フロー/チャット両対応）
    if (evt?.conversation_id) {
      conversationIds[currentProfileId] = evt.conversation_id;
    }
    switch (evt.event) {
      case "workflow_started":
        if (evt.conversation_id) {
          // 現在のプロファイルの会話IDを更新
          conversationIds[currentProfileId] = evt.conversation_id;
        }
        break;
      case "message":
        if (typeof evt.answer === "string") {
          appendToCurrentAiBubble(evt.answer);
        } else if (evt.data && typeof evt.data.answer === "string") {
          appendToCurrentAiBubble(evt.data.answer);
        }
        break;
      case "node_finished": {
        // 「テンプレート」ノードの出力に応じて表情（画像）切替
        const title = (evt?.data?.title || "").trim();
        if (title === "テンプレート") {
          const out = evt?.data?.outputs || {};
          const val = pickStringFromOutputs(out); // "consider"/"calm"/...
          if (typeof val === "string") {
            const imgMap = PROFILES[currentProfileId]?.images || {};
            const img = imgMap[val];
            if (img) setCharacterBg(img);
          }
        }
        break;
      }
      case "workflow_finished":
        break;
      case "error":
        createSystemBubble(`[APIエラー] ${evt.data?.message || "Unknown error"}`);
        break;
      default:
        break;
    }
  }
  async function safeReadText(res) {
    try { return await res.text(); } catch { return ""; }
  }
  // Ctrl+Enter（＋Cmd+Enter）で送信
  if (els.query) {
    els.query.addEventListener("keydown", (e) => {
      const isCtrlEnter = e.ctrlKey && e.key === "Enter";
      const isCmdEnter = e.metaKey && e.key === "Enter";
      if (isCtrlEnter || isCmdEnter) {
        e.preventDefault();
        if (!running) startStreaming();
      }
    });
  }
  // ボタンイベント
  if (els.startBtn && els.stopBtn) {
    els.startBtn.addEventListener("click", () => { if (!running) startStreaming(); });
    els.stopBtn.addEventListener("click", () => { if (running) stopStreaming(); });
  }
  // キャラ切替ボタン
  if (els.charBtns.length > 0) {
    els.charBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        if (running) {
          alert("応答中は切り替えできません。まず停止してください。");
          return;
        }
        const pid = btn.dataset.profile;
        if (pid && pid !== currentProfileId) {
          currentProfileId = pid;
          applyProfile(currentProfileId);
        }
        if (pid === "char3") {
          setCharacterBg("Julian.jpg"); // ←お好みのファイル名に
        }
      });
    });
  }
  // 初期プロファイルを適用
  applyProfile(currentProfileId, { showNotice: false });
})();