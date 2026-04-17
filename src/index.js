/**
 * Edge Worker — HTTP proxy + dual WS tunnel + admin panel
 *
 * Env vars:
 *   UUID        — tunnel user id (uuidv4)
 *   TROJAN_PASS — alt tunnel password (fallback: UUID)
 *   ADMIN       — panel password (fallback: UUID)
 *   AUTH_TOKEN  — optional bearer for HTTP proxy
 *   PROXY_IP    — optional upstream relay
 *   WS_PATH     — REQUIRED WebSocket entry path, e.g. "/_s/<random>". Empty => WS disabled.
 *   WS_TOKEN    — REQUIRED query token for WS, e.g. ?k=<token>. Empty => WS disabled.
 *   ADMIN_PATH  — panel entry path, default "/_m"
 *   SUB_PATH    — subscription entry path, default "/_c"
 *   HOME_HTML   — optional custom home page HTML
 *
 * KV binding "KV" — optional, stores config + access logs + panel tokens.
 */

import { connect } from 'cloudflare:sockets';

const PANEL_HTML = "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>Panel</title>\n<style>\n*{margin:0;padding:0;box-sizing:border-box}\n:root{--bg:#0a0a0a;--card:#141414;--border:#222;--text:#e0e0e0;--dim:#666;--accent:#3b82f6;--green:#22c55e;--red:#ef4444;--orange:#f59e0b}\nbody{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace;background:var(--bg);color:var(--text);min-height:100vh;padding:20px}\n.container{max-width:800px;margin:0 auto}\nh1{font-size:1.4em;font-weight:600;margin-bottom:24px;display:flex;align-items:center;gap:10px}\nh1 .dot{width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block}\n.card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:16px}\n.card h2{font-size:0.75em;font-weight:500;color:var(--dim);margin-bottom:14px;text-transform:uppercase;letter-spacing:1px}\n.uri-box{background:#0d0d0d;border:1px solid var(--border);border-radius:6px;padding:12px 14px;font-family:monospace;font-size:0.82em;word-break:break-all;line-height:1.6;color:var(--accent);position:relative;margin-bottom:10px}\n.uri-box .tag{position:absolute;top:8px;right:8px;font-size:0.65em;padding:2px 8px;border-radius:3px;font-weight:600;text-transform:uppercase;color:#fff}\n.tag-a{background:#6366f1}\n.tag-b{background:#f59e0b;color:#000}\n.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:6px;border:1px solid var(--border);background:var(--card);color:var(--text);cursor:pointer;font-size:0.82em;transition:all .15s}\n.btn:hover{border-color:var(--accent);color:var(--accent)}\n.btn-primary{background:var(--accent);border-color:var(--accent);color:#fff}\n.btn-primary:hover{opacity:.85}\n.btn-sm{padding:5px 12px;font-size:0.75em}\n.btn-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}\n.field{margin-bottom:14px}\n.field label{display:block;font-size:0.75em;color:var(--dim);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px}\n.field input{width:100%;padding:10px 12px;background:#0d0d0d;border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:monospace;font-size:0.85em;outline:none}\n.field input:focus{border-color:var(--accent)}\n.toast{position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;background:var(--green);color:#fff;font-size:0.85em;opacity:0;transition:opacity .3s;pointer-events:none;z-index:999}\n.toast.show{opacity:1}\n.toast.err{background:var(--red)}\n.qr-wrap{text-align:center;padding:16px;background:#fff;border-radius:8px;display:inline-block;margin-top:10px}\n.login-wrap{display:flex;justify-content:center;align-items:center;min-height:80vh}\n.login-box{width:320px}\n.login-box h1{justify-content:center;margin-bottom:32px}\n.hidden{display:none}\n.tab-bar{display:flex;gap:0;margin-bottom:20px;border-bottom:1px solid var(--border)}\n.tab{padding:10px 20px;cursor:pointer;color:var(--dim);font-size:0.85em;border-bottom:2px solid transparent;transition:all .15s}\n.tab.active{color:var(--accent);border-bottom-color:var(--accent)}\n.tab:hover{color:var(--text)}\n.section{display:none}.section.active{display:block}\n.conn-log{font-family:monospace;font-size:0.78em;line-height:1.8}\n.conn-log .row{display:flex;gap:12px;padding:4px 0;border-bottom:1px solid #1a1a1a}\n.conn-log .time{color:var(--dim);min-width:80px}\n.conn-log .proto{min-width:50px;font-weight:600}\n.conn-log .proto.a{color:#6366f1}\n.conn-log .proto.b{color:var(--orange)}\n.conn-log .target{color:var(--text)}\n</style>\n</head>\n<body>\n\n<div id=\"loginView\" class=\"login-wrap\">\n  <div class=\"login-box\">\n    <h1><span class=\"dot\"></span> Panel</h1>\n    <div class=\"card\">\n      <div class=\"field\">\n        <label>Access Key</label>\n        <input type=\"password\" id=\"passwordInput\" placeholder=\"\" autofocus>\n      </div>\n      <button class=\"btn btn-primary\" style=\"width:100%\" onclick=\"doLogin()\">Enter</button>\n    </div>\n  </div>\n</div>\n\n<div id=\"adminView\" class=\"container hidden\">\n  <h1><span class=\"dot\"></span> Panel</h1>\n\n  <div class=\"tab-bar\">\n    <div class=\"tab active\" data-tab=\"nodes\">Endpoints</div>\n    <div class=\"tab\" data-tab=\"config\">Settings</div>\n    <div class=\"tab\" data-tab=\"logs\">Activity</div>\n  </div>\n\n  <div id=\"tab-nodes\" class=\"section active\">\n    <div class=\"card\">\n      <h2>Channel A</h2>\n      <div class=\"uri-box\" id=\"aUri\"><span class=\"tag tag-a\">A</span>loading...</div>\n      <div class=\"btn-row\">\n        <button class=\"btn btn-sm\" onclick=\"copyUri('a')\">Copy</button>\n        <button class=\"btn btn-sm\" onclick=\"showQR('a')\">QR</button>\n      </div>\n      <div id=\"aQR\" class=\"hidden\"></div>\n    </div>\n\n    <div class=\"card\">\n      <h2>Channel B</h2>\n      <div class=\"uri-box\" id=\"bUri\"><span class=\"tag tag-b\">B</span>loading...</div>\n      <div class=\"btn-row\">\n        <button class=\"btn btn-sm\" onclick=\"copyUri('b')\">Copy</button>\n        <button class=\"btn btn-sm\" onclick=\"showQR('b')\">QR</button>\n      </div>\n      <div id=\"bQR\" class=\"hidden\"></div>\n    </div>\n\n    <div class=\"card\">\n      <h2>Feed</h2>\n      <div class=\"uri-box\" id=\"subUrl\">loading...</div>\n      <div class=\"btn-row\">\n        <button class=\"btn btn-sm\" onclick=\"copyEl('subUrl')\">Copy</button>\n      </div>\n    </div>\n  </div>\n\n  <div id=\"tab-config\" class=\"section\">\n    <div class=\"card\">\n      <h2>Settings</h2>\n      <div class=\"field\">\n        <label>User ID</label>\n        <input type=\"text\" id=\"cfgUUID\" placeholder=\"uuid\">\n      </div>\n      <div class=\"field\">\n        <label>Alt Password (optional)</label>\n        <input type=\"text\" id=\"cfgTrojanPass\" placeholder=\"fallback to User ID\">\n      </div>\n      <div class=\"field\">\n        <label>Relay Host</label>\n        <input type=\"text\" id=\"cfgProxyIP\" placeholder=\"optional, host:port\">\n      </div>\n      <div class=\"field\">\n        <label>HTTP Token</label>\n        <input type=\"text\" id=\"cfgAuthToken\" placeholder=\"optional bearer\">\n      </div>\n      <div class=\"btn-row\">\n        <button class=\"btn btn-primary\" onclick=\"saveConfig()\">Save</button>\n      </div>\n    </div>\n  </div>\n\n  <div id=\"tab-logs\" class=\"section\">\n    <div class=\"card\">\n      <h2>Recent</h2>\n      <div id=\"connLogs\" class=\"conn-log\">\n        <div style=\"color:var(--dim)\">no records</div>\n      </div>\n      <div class=\"btn-row\" style=\"margin-top:14px\">\n        <button class=\"btn btn-sm\" onclick=\"refreshLogs()\">Refresh</button>\n        <button class=\"btn btn-sm\" onclick=\"clearLogs()\">Clear</button>\n      </div>\n    </div>\n  </div>\n</div>\n\n<div id=\"toast\" class=\"toast\"></div>\n\n<script>\nconst BASE = location.pathname.replace(/\\/$/, '');\nlet authToken = '';\n\ndocument.querySelectorAll('.tab').forEach(t => {\n  t.addEventListener('click', () => {\n    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));\n    document.querySelectorAll('.section').forEach(x => x.classList.remove('active'));\n    t.classList.add('active');\n    document.getElementById('tab-' + t.dataset.tab).classList.add('active');\n  });\n});\n\ndocument.getElementById('passwordInput').addEventListener('keydown', e => {\n  if (e.key === 'Enter') doLogin();\n});\n\nasync function doLogin() {\n  const pass = document.getElementById('passwordInput').value.trim();\n  if (!pass) return;\n  try {\n    const res = await fetch(BASE + '/api/login', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({ password: pass }),\n    });\n    const data = await res.json();\n    if (data.token) {\n      authToken = data.token;\n      sessionStorage.setItem('panel-token', authToken);\n      showAdmin();\n    } else {\n      toast('invalid key', true);\n    }\n  } catch (e) {\n    toast('error: ' + e.message, true);\n  }\n}\n\nfunction showAdmin() {\n  document.getElementById('loginView').classList.add('hidden');\n  document.getElementById('adminView').classList.remove('hidden');\n  loadNodeInfo();\n  loadConfig();\n  refreshLogs();\n}\n\nasync function apiFetch(path, opts = {}) {\n  opts.headers = { ...opts.headers, 'X-Panel-Token': authToken };\n  const res = await fetch(BASE + path, opts);\n  if (res.status === 401) {\n    sessionStorage.removeItem('panel-token');\n    location.reload();\n    return null;\n  }\n  return res.json();\n}\n\nasync function loadNodeInfo() {\n  const data = await apiFetch('/api/info');\n  if (!data) return;\n  document.getElementById('aUri').innerHTML = `<span class=\"tag tag-a\">A</span>${escHtml(data.a_uri || '(not configured)')}`;\n  document.getElementById('bUri').innerHTML = `<span class=\"tag tag-b\">B</span>${escHtml(data.b_uri || '(not configured)')}`;\n  document.getElementById('subUrl').textContent = data.sub_url || '(not configured)';\n}\n\nasync function loadConfig() {\n  const data = await apiFetch('/api/config');\n  if (!data) return;\n  document.getElementById('cfgUUID').value = data.uuid || '';\n  document.getElementById('cfgTrojanPass').value = data.trojan_pass || '';\n  document.getElementById('cfgProxyIP').value = data.proxy_ip || '';\n  document.getElementById('cfgAuthToken').value = data.auth_token || '';\n}\n\nasync function saveConfig() {\n  const cfg = {\n    uuid: document.getElementById('cfgUUID').value.trim(),\n    trojan_pass: document.getElementById('cfgTrojanPass').value.trim(),\n    proxy_ip: document.getElementById('cfgProxyIP').value.trim(),\n    auth_token: document.getElementById('cfgAuthToken').value.trim(),\n  };\n  const data = await apiFetch('/api/config', {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify(cfg),\n  });\n  if (data?.success) {\n    toast('saved');\n    loadNodeInfo();\n  } else {\n    toast('save failed', true);\n  }\n}\n\nasync function refreshLogs() {\n  const data = await apiFetch('/api/logs');\n  if (!data) return;\n  const container = document.getElementById('connLogs');\n  if (!data.logs || data.logs.length === 0) {\n    container.innerHTML = '<div style=\"color:var(--dim)\">no records</div>';\n    return;\n  }\n  container.innerHTML = data.logs.map(l =>\n    `<div class=\"row\"><span class=\"time\">${l.time}</span><span class=\"proto ${l.protocol}\">${l.protocol.toUpperCase()}</span><span class=\"target\">${escHtml(l.target)}</span></div>`\n  ).join('');\n}\n\nasync function clearLogs() {\n  await apiFetch('/api/logs', { method: 'DELETE' });\n  toast('cleared');\n  refreshLogs();\n}\n\nfunction copyUri(type) {\n  const el = document.getElementById(type + 'Uri');\n  const text = el.textContent.replace(/^[AB]/, '').trim();\n  navigator.clipboard.writeText(text);\n  toast('copied');\n}\n\nfunction copyEl(id) {\n  const text = document.getElementById(id).textContent;\n  navigator.clipboard.writeText(text);\n  toast('copied');\n}\n\nfunction showQR(type) {\n  const wrap = document.getElementById(type + 'QR');\n  if (!wrap.classList.contains('hidden')) {\n    wrap.classList.add('hidden');\n    return;\n  }\n  const el = document.getElementById(type + 'Uri');\n  const uri = el.textContent.replace(/^[AB]/, '').trim();\n  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}`;\n  wrap.innerHTML = `<div class=\"qr-wrap\"><img src=\"${qrUrl}\" alt=\"QR\"></div>`;\n  wrap.classList.remove('hidden');\n}\n\nfunction toast(msg, err = false) {\n  const el = document.getElementById('toast');\n  el.textContent = msg;\n  el.className = 'toast show' + (err ? ' err' : '');\n  setTimeout(() => el.className = 'toast', 2000);\n}\n\nfunction escHtml(s) {\n  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');\n}\n\nconst saved = sessionStorage.getItem('panel-token');\nif (saved) {\n  authToken = saved;\n  showAdmin();\n}\n</script>\n</body>\n</html>\n";

// Minimal, benign home page. Override via env.HOME_HTML.
const DEFAULT_HOME = "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex,nofollow\"><title>Notes</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:10vh auto;padding:0 24px;color:#333;line-height:1.7}h1{font-size:1.4em;margin:0 0 .6em}p{color:#666;margin:0 0 1em}a{color:#2563eb;text-decoration:none}</style></head><body><h1>Notes</h1><p>A small personal corner. Nothing interesting here yet.</p><p><a href=\"/\">reload</a></p></body></html>";

// ─── Entry ────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const upgrade = (request.headers.get('Upgrade') || '').toLowerCase();

    // WS tunnel: strict path + token gate
    if (upgrade === 'websocket') {
      return handleTunnel(request, env, ctx, url);
    }

    const adminPath = (env.ADMIN_PATH || '/_m').replace(/\/$/, '');
    if (url.pathname === adminPath || url.pathname.startsWith(adminPath + '/')) {
      return handlePanel(request, env, ctx, url, adminPath);
    }

    const subPath = (env.SUB_PATH || '/_c').replace(/\/$/, '');
    if (url.pathname === subPath || url.pathname.startsWith(subPath + '/')) {
      const r = await handleFeed(request, env, url, subPath);
      if (r) return r;
    }

    return handleHttpProxy(request, env, url);
  },
};

// ─── Tunnel gate ──────────────────────────────────────
async function handleTunnel(request, env, ctx, url) {
  const wsPath = env.WS_PATH || '';
  const wsToken = env.WS_TOKEN || '';

  // Kill switch: any misconfig => behave like non-WS
  if (!wsPath || !wsToken) {
    return decoy();
  }

  // Path must match exactly (prevents random scan probes)
  if (url.pathname !== wsPath) {
    return decoy();
  }

  // Token must match (prevents blind probes on known path)
  const k = url.searchParams.get('k') || request.headers.get('X-K') || '';
  if (k !== wsToken) {
    return decoy();
  }

  return openTunnel(request, env, ctx);
}

// Looks like a plain 404/short page; no auth error signals.
function decoy() {
  return new Response(DEFAULT_HOME, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function openTunnel(request, env, ctx) {
  const uuid = env.UUID;
  const trojanPass = env.TROJAN_PASS || uuid;
  if (!uuid && !trojanPass) return decoy();

  const trojanHash = trojanPass ? await sha224(trojanPass) : null;

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();

  let remoteSocket = null;
  let remoteWriter = null;

  server.addEventListener('message', async (event) => {
    try {
      const data = new Uint8Array(event.data);

      if (!remoteSocket) {
        const detected = await detectAndParse(data, uuid, trojanHash);
        if (detected.error) { server.close(1002, 'bad'); return; }

        const { protocol, hostname, port, rawData, isUdp, respHeader } = detected;

        if (isUdp) {
          if (port === 53) await handleDnsOverUdp(rawData, server, respHeader);
          else server.close(1002, 'unsupported');
          return;
        }

        const proxyIp = env.PROXY_IP || '';
        remoteSocket = await connectTcp(hostname, port, proxyIp);
        remoteWriter = remoteSocket.writable.getWriter();

        logConnection(env, ctx, protocol, hostname, port);

        if (rawData.byteLength > 0) await remoteWriter.write(rawData);
        pipeRemoteToWs(remoteSocket.readable, server, respHeader);
      } else {
        if (remoteWriter) await remoteWriter.write(data);
      }
    } catch (_) {
      try { server.close(1011, 'err'); } catch (__) {}
      if (remoteSocket) try { remoteSocket.close(); } catch (__) {}
    }
  });

  server.addEventListener('close', () => { if (remoteSocket) try { remoteSocket.close(); } catch (_) {} });
  server.addEventListener('error', () => { if (remoteSocket) try { remoteSocket.close(); } catch (_) {} });

  return new Response(null, { status: 101, webSocket: client });
}

// ─── Protocol detect ──────────────────────────────────
async function detectAndParse(data, uuid, trojanHash) {
  if (trojanHash && data.byteLength >= 58) {
    const headerHex = new TextDecoder().decode(data.slice(0, 56));
    if (headerHex === trojanHash && data[56] === 0x0d && data[57] === 0x0a) {
      return parseBHeader(data);
    }
  }
  if (uuid) return parseAHeader(data, uuid);
  return { error: 'nomatch' };
}

function parseBHeader(data) {
  let offset = 58;
  if (data.byteLength < offset + 4) return { error: 'short' };
  const cmd = data[offset++];
  const isUdp = cmd === 3;
  const atype = data[offset++];
  let hostname = '';
  if (atype === 1) {
    if (data.byteLength < offset + 4) return { error: 'v4' };
    hostname = `${data[offset]}.${data[offset+1]}.${data[offset+2]}.${data[offset+3]}`;
    offset += 4;
  } else if (atype === 3) {
    const len = data[offset++];
    if (data.byteLength < offset + len) return { error: 'dom' };
    hostname = new TextDecoder().decode(data.slice(offset, offset + len));
    offset += len;
  } else if (atype === 4) {
    if (data.byteLength < offset + 16) return { error: 'v6' };
    const p = []; for (let i = 0; i < 8; i++) p.push(((data[offset+i*2]<<8)|data[offset+i*2+1]).toString(16));
    hostname = p.join(':'); offset += 16;
  } else return { error: 'atype' };
  if (data.byteLength < offset + 4) return { error: 'port' };
  const port = (data[offset]<<8)|data[offset+1]; offset += 2;
  if (data[offset]===0x0d && data[offset+1]===0x0a) offset += 2;
  return { protocol:'b', hostname, port, rawData:data.slice(offset), isUdp, respHeader:null };
}

function parseAHeader(data, uuid) {
  if (data.byteLength < 24) return { error: 'short' };
  const version = data[0];
  const clientUuid = formatUuidBytes(data.slice(1, 17));
  if (clientUuid !== uuid.toLowerCase()) return { error: 'id' };
  const addonLen = data[17];
  let offset = 18 + addonLen;
  if (data.byteLength < offset + 4) return { error: 'trunc' };
  const cmd = data[offset++];
  const isUdp = cmd === 2;
  const port = (data[offset]<<8)|data[offset+1]; offset += 2;
  const addrType = data[offset++];
  let hostname = '';
  if (addrType === 1) {
    if (data.byteLength < offset+4) return { error: 'v4' };
    hostname = `${data[offset]}.${data[offset+1]}.${data[offset+2]}.${data[offset+3]}`; offset += 4;
  } else if (addrType === 2) {
    const len = data[offset++];
    if (data.byteLength < offset+len) return { error: 'dom' };
    hostname = new TextDecoder().decode(data.slice(offset, offset+len)); offset += len;
  } else if (addrType === 3) {
    if (data.byteLength < offset+16) return { error: 'v6' };
    const p = []; for (let i=0;i<8;i++) p.push(((data[offset+i*2]<<8)|data[offset+i*2+1]).toString(16));
    hostname = p.join(':'); offset += 16;
  } else return { error: 'atype' };
  return { protocol:'a', version, hostname, port, rawData:data.slice(offset), isUdp, respHeader:new Uint8Array([version,0]) };
}

function formatUuidBytes(bytes) {
  const h = Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

// ─── TCP + pipe ───────────────────────────────────────
async function connectTcp(address, port, proxyIp) {
  try {
    const s = connect({ hostname: address, port });
    s.writable.getWriter().releaseLock();
    return s;
  } catch (err) {
    if (proxyIp) {
      const [h, p] = proxyIp.includes(':') ? [proxyIp.split(':')[0], parseInt(proxyIp.split(':')[1])] : [proxyIp, port];
      return connect({ hostname: h, port: p });
    }
    throw err;
  }
}

async function pipeRemoteToWs(readable, ws, respHeader) {
  let sent = false;
  const reader = readable.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || ws.readyState !== WebSocket.OPEN) break;
      if (!sent && respHeader) {
        const m = new Uint8Array(respHeader.byteLength + value.byteLength);
        m.set(respHeader, 0); m.set(new Uint8Array(value), respHeader.byteLength);
        ws.send(m.buffer); sent = true;
      } else ws.send(value);
    }
  } catch (_) {} finally { reader.releaseLock(); try { ws.close(); } catch (_) {} }
}

async function handleDnsOverUdp(rawData, ws, respHeader) {
  try {
    const dns = rawData.byteLength > 2 ? rawData.slice(2) : rawData;
    const resp = await fetch('https://1.1.1.1/dns-query', { method:'POST', headers:{'Content-Type':'application/dns-message'}, body:dns });
    const buf = new Uint8Array(await resp.arrayBuffer());
    const len = new Uint8Array(2); len[0]=(buf.byteLength>>8)&0xff; len[1]=buf.byteLength&0xff;
    const hl = respHeader ? respHeader.byteLength : 0;
    const out = new Uint8Array(hl+2+buf.byteLength);
    if (respHeader) out.set(respHeader, 0);
    out.set(len, hl); out.set(buf, hl+2);
    ws.send(out.buffer);
  } catch (_) {}
}

// ─── SHA-224 ──────────────────────────────────────────
async function sha224(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  let h0=0xc1059ed8,h1=0x367cd507,h2=0x3070dd17,h3=0xf70e5939,h4=0xffc00b31,h5=0x68581511,h6=0x64f98fa7,h7=0xbefa4fa4;
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const bitLen=data.length*8;const padded=new Uint8Array(Math.ceil((data.length+9)/64)*64);padded.set(data);padded[data.length]=0x80;const view=new DataView(padded.buffer);view.setUint32(padded.length-4,bitLen,false);
  const w=new Int32Array(64);
  for(let i=0;i<padded.length;i+=64){for(let j=0;j<16;j++)w[j]=view.getInt32(i+j*4,false);for(let j=16;j<64;j++){const s0=rotr(w[j-15],7)^rotr(w[j-15],18)^(w[j-15]>>>3);const s1=rotr(w[j-2],17)^rotr(w[j-2],19)^(w[j-2]>>>10);w[j]=(w[j-16]+s0+w[j-7]+s1)|0}let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;for(let j=0;j<64;j++){const S1=rotr(e,6)^rotr(e,11)^rotr(e,25);const ch=(e&f)^(~e&g);const t1=(h+S1+ch+K[j]+w[j])|0;const S0=rotr(a,2)^rotr(a,13)^rotr(a,22);const maj=(a&b)^(a&c)^(b&c);const t2=(S0+maj)|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0}h0=(h0+a)|0;h1=(h1+b)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0;h5=(h5+f)|0;h6=(h6+g)|0;h7=(h7+h)|0}
  return [h0,h1,h2,h3,h4,h5,h6].map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}
function rotr(n,b){return((n>>>b)|(n<<(32-b)))>>>0}

// ─── Panel ────────────────────────────────────────────
async function handlePanel(request, env, ctx, url, basePath) {
  const adminPass = env.ADMIN || env.UUID;
  if (!adminPass) return decoy();

  const rel = url.pathname.slice(basePath.length) || '/';

  if (rel === '/' || rel === '') {
    return new Response(PANEL_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    });
  }

  if (rel === '/api/login' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (body.password === adminPass) {
      const raw = new TextEncoder().encode(adminPass + Date.now() + Math.random());
      const hash = await crypto.subtle.digest('SHA-256', raw);
      const token = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (env.KV) await env.KV.put(`panel_token:${token}`, '1', { expirationTtl: 86400 });
      return json(200, { token });
    }
    return json(401, { error: 'no' });
  }

  const token = request.headers.get('X-Panel-Token');
  if (!token) return json(401, { error: 'no' });

  let authed = false;
  if (env.KV) {
    authed = !!(await env.KV.get(`panel_token:${token}`));
  } else {
    const raw = new TextEncoder().encode(adminPass + 'static');
    const hash = await crypto.subtle.digest('SHA-256', raw);
    const expected = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    authed = token === expected;
  }
  if (!authed) return json(401, { error: 'no' });

  if (rel === '/api/info') {
    const host = url.hostname;
    const uuid = env.UUID || '';
    const trojanPass = env.TROJAN_PASS || uuid;
    const wsPath = env.WS_PATH || '';
    const wsToken = env.WS_TOKEN || '';
    const pathWithToken = wsPath && wsToken ? `${wsPath}?k=${encodeURIComponent(wsToken)}` : '';
    return json(200, {
      a_uri: (uuid && pathWithToken) ? aUri(uuid, host, pathWithToken, host) : '',
      b_uri: (uuid && pathWithToken) ? bUri(trojanPass, host, pathWithToken, host) : '',
      sub_url: `https://${host}${(env.SUB_PATH || '/_c')}`,
      host,
    });
  }

  if (rel === '/api/config') {
    if (request.method === 'POST') {
      if (!env.KV) return json(500, { error: 'no-kv' });
      const cfg = await request.json();
      await env.KV.put('config', JSON.stringify(cfg));
      return json(200, { success: true });
    }
    let saved = {};
    if (env.KV) { const r = await env.KV.get('config'); if (r) saved = JSON.parse(r); }
    return json(200, {
      uuid: saved.uuid || env.UUID || '',
      trojan_pass: saved.trojan_pass || env.TROJAN_PASS || '',
      proxy_ip: saved.proxy_ip || env.PROXY_IP || '',
      auth_token: saved.auth_token || env.AUTH_TOKEN || '',
    });
  }

  if (rel === '/api/logs') {
    if (request.method === 'DELETE') {
      if (env.KV) await env.KV.put('conn_logs', '[]');
      return json(200, { success: true });
    }
    let logs = [];
    if (env.KV) { const r = await env.KV.get('conn_logs'); if (r) logs = JSON.parse(r); }
    return json(200, { logs });
  }

  return json(404, { error: 'nope' });
}

async function logConnection(env, ctx, protocol, hostname, port) {
  if (!env.KV) return;
  ctx.waitUntil((async () => {
    try {
      const raw = await env.KV.get('conn_logs') || '[]';
      const logs = JSON.parse(raw);
      logs.unshift({
        time: new Date().toISOString().replace('T', ' ').slice(0, 19),
        protocol,
        target: `${hostname}:${port}`,
      });
      if (logs.length > 100) logs.length = 100;
      await env.KV.put('conn_logs', JSON.stringify(logs));
    } catch (_) {}
  })());
}

// ─── Feed / URI ───────────────────────────────────────
function aUri(uuid, host, path, remark) {
  const p = new URLSearchParams({security:'tls',sni:host,fp:'randomized',type:'ws',host,path,encryption:'none'});
  return `vless://${uuid}@${host}:443?${p}#${encodeURIComponent(remark)}`;
}
function bUri(password, host, path, remark) {
  const p = new URLSearchParams({security:'tls',sni:host,fp:'randomized',type:'ws',host,path});
  return `trojan://${encodeURIComponent(password)}@${host}:443?${p}#${encodeURIComponent(remark)}`;
}

async function handleFeed(request, env, url, basePath) {
  const uuid = env.UUID;
  const trojanPass = env.TROJAN_PASS || uuid;
  const host = url.hostname;
  const wsPath = env.WS_PATH || '';
  const wsToken = env.WS_TOKEN || '';

  // Feed requires same WS_TOKEN in ?k= to prevent leaks via path enumeration
  const k = url.searchParams.get('k') || '';
  if (!wsToken || k !== wsToken) return decoy();
  if (!uuid || !wsPath) return decoy();

  const rel = url.pathname.slice(basePath.length) || '/';
  const pathWithToken = `${wsPath}?k=${encodeURIComponent(wsToken)}`;

  if (rel === '/' || rel === '') {
    const lines = [
      aUri(uuid, host, pathWithToken, host),
      bUri(trojanPass, host, pathWithToken, host),
    ];
    return new Response(btoa(lines.join('\n')), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Profile-Update-Interval': '12',
        'Subscription-Userinfo': 'upload=0; download=0; total=10737418240; expire=4102329600',
        'Content-Disposition': `attachment; filename*=utf-8''feed`,
      },
    });
  }
  if (rel === '/a') return new Response(aUri(uuid, host, pathWithToken, host), { headers: {'Content-Type':'text/plain; charset=utf-8'} });
  if (rel === '/b') return new Response(bUri(trojanPass, host, pathWithToken, host), { headers: {'Content-Type':'text/plain; charset=utf-8'} });
  return null;
}

// ─── HTTP proxy (unchanged behavior) ─────────────────
async function handleHttpProxy(request, env, url) {
  if (request.method === 'OPTIONS') return handleCORS(request);

  // Root: only a minimal home page, no service fingerprints
  if (url.pathname === '/' && !url.searchParams.has('url')) {
    return new Response(env.HOME_HTML || DEFAULT_HOME, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' },
    });
  }

  // favicon / robots / common probe paths -> benign response
  const p = url.pathname;
  if (p === '/favicon.ico') return new Response(null, { status: 204 });
  if (p === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain' } });

  try {
    const targetURL = resolveTarget(request);
    if (!targetURL) return decoy();

    // HTTP proxy MUST have AUTH_TOKEN for public workers (else anyone can use as open proxy)
    if (env.AUTH_TOKEN) {
      const auth = request.headers.get('Authorization');
      if (auth !== `Bearer ${env.AUTH_TOKEN}` && auth !== env.AUTH_TOKEN) return decoy();
    } else {
      // No token configured => refuse to act as open proxy
      return decoy();
    }

    const headers = new Headers(request.headers);
    ['host','cf-connecting-ip','cf-ray','cf-visitor','cf-ipcountry','cf-worker'].forEach(h=>headers.delete(h));
    const t = new URL(targetURL); headers.set('Host', t.host);
    const init = { method: request.method, headers, redirect: 'follow' };
    if (!['GET','HEAD'].includes(request.method)) init.body = request.body;
    const resp = await fetch(targetURL, init);
    const rh = new Headers(resp.headers);
    rh.set('Access-Control-Allow-Origin','*');
    rh.delete('content-security-policy'); rh.delete('x-frame-options');
    return new Response(resp.body, { status:resp.status, statusText:resp.statusText, headers:rh });
  } catch (_) {
    return decoy();
  }
}

// ─── Helpers ──────────────────────────────────────────
function resolveTarget(request) {
  const u = new URL(request.url);
  const p = u.searchParams.get('url');
  if (p) return normalizeURL(p);
  const path = u.pathname.slice(1) + u.search;
  if (!path||path==='favicon.ico'||path==='robots.txt') return null;
  let target = decodeURIComponent(u.pathname.slice(1));
  const qs = u.search;
  if (qs && !qs.startsWith('?url=')) target += qs;
  return normalizeURL(target);
}
function normalizeURL(url) {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = 'https://'+url;
  try { new URL(url); return url; } catch { return null; }
}
function handleCORS(request) {
  return new Response(null, { status:204, headers: {
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS',
    'Access-Control-Allow-Headers':request.headers.get('Access-Control-Request-Headers')||'*',
    'Access-Control-Max-Age':'86400',
  }});
}
function json(status, data) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' },
  });
}
