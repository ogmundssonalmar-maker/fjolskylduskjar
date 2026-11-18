import { EncryptJWT, base64url, jwtDecrypt } from 'jose';
import { readApprovedShopping } from './household.js';

const graphOrigin = 'https://graph.microsoft.com';
const microsoft = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const scope = 'offline_access https://graph.microsoft.com/Tasks.ReadWrite';
const production = 'https://fjolskylduskjar.ogmundssonalmar.workers.dev';
const redirectUri = production + '/api/todo/callback';
const credentialsCookie = 'fjolskylduskjar_todo_state';
const textEncoder = new TextEncoder();
const number = new Intl.NumberFormat('is-IS', { maximumFractionDigits: 3 });

class TodoError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

const json = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store', ...headers },
});

function configured(env) {
  return Boolean(env.DB && env.MS_TODO_CLIENT_ID?.trim() && env.MS_TODO_CLIENT_SECRET?.trim());
}

async function encryptionKey(env) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode('fjolskylduskjar-ms-todo:' + env.MS_TODO_CLIENT_SECRET.trim())));
}

async function seal(env, purpose, claims) {
  const jwt = new EncryptJWT(claims).setProtectedHeader({ alg:'dir', enc:'A256GCM' }).setAudience(purpose);
  if (purpose === 'oauth-state') jwt.setExpirationTime('10m');
  return jwt.encrypt(await encryptionKey(env));
}

async function unseal(env, purpose, value) {
  const { payload } = await jwtDecrypt(value, await encryptionKey(env), {
    audience: purpose, keyManagementAlgorithms:['dir'], contentEncryptionAlgorithms:['A256GCM'],
  });
  return payload;
}

function stateCookie(value) {
  return `${credentialsCookie}=${value}; Path=/api/todo; HttpOnly; Secure; SameSite=Lax; Max-Age=${value ? 600 : 0}`;
}

function callbackResult(status) {
  return new Response(null, { status:303, headers: {
    Location:'/?todo=' + status, 'Set-Cookie':stateCookie(''), 'Cache-Control':'private, no-store',
  } });
}

async function readConnection(db) {
  try {
    return await db.prepare('SELECT * FROM todo_connection WHERE id = 1').first();
  } catch (error) {
    if (!/no such table: todo_connection\b/i.test(error?.message ?? '')) throw error;
    return null;
  }
}

async function getToken(env, parameters) {
  const response = await fetch(microsoft + '/token', {
    method:'POST', signal:AbortSignal.timeout(12000),
    body:new URLSearchParams({ client_id:env.MS_TODO_CLIENT_ID.trim(),
      client_secret:env.MS_TODO_CLIENT_SECRET.trim(), scope, ...parameters }),
  });
  const token = await response.json().catch(() => ({}));
  if (!response.ok || typeof token.access_token !== 'string') {
    throw new TodoError('Ekki tókst að tengjast Microsoft. Tengdu reikning Oddnýjar aftur.');
  }
  return {
    accessToken:token.access_token,
    refreshToken:token.refresh_token || parameters.refresh_token,
    expires:Date.now() + (Number(token.expires_in) || 3600) * 1000,
  };
}

async function connect(env) {
  const state = base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64url.encode(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64url.encode(await crypto.subtle.digest('SHA-256', textEncoder.encode(verifier)));
  const url = new URL(microsoft + '/authorize');
  url.search = new URLSearchParams({
    client_id:env.MS_TODO_CLIENT_ID.trim(), response_type:'code', response_mode:'query',
    redirect_uri:redirectUri, scope, state, code_challenge:challenge, code_challenge_method:'S256', prompt:'select_account',
  });
  const cookie = await seal(env, 'oauth-state', { state, verifier });
  return json({ url:url.href }, 200, { 'Set-Cookie':stateCookie(cookie) });
}

export async function todoCallback(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== production || !configured(env)) return callbackResult('villa');
  const cookie = request.headers.get('Cookie')?.split(';').map(value=>value.trim())
    .find(value=>value.startsWith(credentialsCookie+'='))?.slice(credentialsCookie.length+1);
  try {
    const code = url.searchParams.get('code');
    if (!cookie || !code) return callbackResult('villa');
    const state = await unseal(env, 'oauth-state', cookie);
    if (state.state !== url.searchParams.get('state')) return callbackResult('villa');
    const tokens = await getToken(env, {
      grant_type:'authorization_code', code, redirect_uri:redirectUri, code_verifier:state.verifier,
    });
    if (!tokens.refreshToken) return callbackResult('villa');
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS todo_connection (
      id INTEGER PRIMARY KEY CHECK (id = 1), connection_key TEXT NOT NULL, tokens TEXT NOT NULL,
      list_id TEXT, list_name TEXT,
      export_lease INTEGER NOT NULL DEFAULT 0
    )`).run();
    const sealed = await seal(env, 'microsoft-token', tokens);
    const updated = await env.DB.prepare(`INSERT INTO todo_connection (id, connection_key, tokens) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET connection_key = excluded.connection_key, tokens = excluded.tokens,
        list_id = NULL, list_name = NULL
      WHERE todo_connection.export_lease <= ?`).bind(state.state, sealed, Date.now()).run();
    return callbackResult(updated.meta.changes ? 'tengt' : 'villa');
  } catch {
    return callbackResult('villa');
  }
}

async function accessToken(env, connection) {
  let tokens;
  try {
    tokens = await unseal(env, 'microsoft-token', connection.tokens);
  } catch {
    throw new TodoError('Tengdu reikning Oddnýjar aftur.');
  }
  if (tokens.expires > Date.now() + 60000) return tokens.accessToken;
  const updated = await getToken(env, { grant_type:'refresh_token', refresh_token:tokens.refreshToken });
  const sealed = await seal(env, 'microsoft-token', updated);
  await env.DB.prepare('UPDATE todo_connection SET tokens = ? WHERE id = 1 AND tokens = ?')
    .bind(sealed, connection.tokens).run();
  return updated.accessToken;
}

async function graph(token, path, options = {}) {
  const url = new URL(path, graphOrigin);
  if (url.origin !== graphOrigin || !url.pathname.startsWith('/v1.0/')) {
    throw new TodoError('Ógild Microsoft Graph-slóð.');
  }
  const response = await fetch(url, {
    ...options,
    signal:AbortSignal.timeout(12000),
    headers:{ Authorization:'Bearer ' + token, ...(options.body ? { 'Content-Type':'application/json' } : {}) },
  });
  if (!response.ok) {
    if (response.status === 401) throw new TodoError('Tengdu reikning Oddnýjar aftur.');
    throw new TodoError('Microsoft To Do svaraði ekki beiðninni. Reyndu aftur.');
  }
  return response.json();
}

async function graphList(token, path) {
  const result = [];
  let next = path;
  while (next) {
    const data = await graph(token, next);
    if (!Array.isArray(data.value)) throw new TodoError('Microsoft To Do skilaði óvæntu svari.');
    result.push(...data.value);
    next = data['@odata.nextLink'];
  }
  return result;
}

async function availableLists(token) {
  const lists = await graphList(token, '/v1.0/me/todo/lists?$select=id,displayName,isOwner,isShared');
  return lists.filter(list => list.isOwner && list.isShared).map(({ id, displayName }) => ({ id, name:displayName }));
}

async function exportItems(env, connection) {
  if (!connection.list_id) throw new TodoError('Veldu sameiginlega listann í Microsoft To Do.', 409);
  const shopping = await readApprovedShopping(env.DB);
  if (!shopping) throw new TodoError('Samþykktu matseðilinn fyrst.', 409);
  const waiting = shopping.items.filter(item => !item.done);
  if (!waiting.length) return { added:0, updated:0, skipped:0, failed:0 };

  const now = Date.now();
  const lease = now + 300000;
  const locked = await env.DB.prepare(`UPDATE todo_connection SET export_lease = ?
    WHERE id = 1 AND list_id = ? AND connection_key = ? AND export_lease <= ?`)
    .bind(lease, connection.list_id, connection.connection_key, now).run();
  if (!locked.meta.changes) throw new TodoError('Önnur To Do-beiðni er í vinnslu. Reyndu aftur.', 409);

  try {
    const token = await accessToken(env, connection);
    const taskPath = '/me/todo/lists/' + encodeURIComponent(connection.list_id) + '/tasks';
    const existing = await graphList(token, '/v1.0' + taskPath + '?$select=id,title,status,body');
    const byMarker = new Map(existing.map(item => [item.body?.content?.trim(), item]));
    const openTitles = new Set(existing.filter(item => item.status !== 'completed')
      .map(item => item.title.trim().toLocaleLowerCase('is')));
    const operations = [];
    for (const item of waiting) {
      const marker = 'Heima hjá okkur ' + base64url.encode(await crypto.subtle.digest('SHA-256',
        textEncoder.encode(shopping.week + ':' + item.id)));
      const title = item.amount === null ? item.name : item.name + ' · ' + number.format(item.amount) + ' ' + item.unit;
      const task = byMarker.get(marker);
      if (task && task.status !== 'completed' && task.title !== title) {
        const normalized = title.toLocaleLowerCase('is');
        if (!openTitles.has(normalized)) {
          operations.push({ method:'PATCH', url:taskPath + '/' + encodeURIComponent(task.id), body:{ title } });
          openTitles.add(normalized);
        }
      } else if (!task && !openTitles.has(title.toLocaleLowerCase('is'))) {
        operations.push({ method:'POST', url:taskPath, body:{ title, body:{ contentType:'text', content:marker } } });
        openTitles.add(title.toLocaleLowerCase('is'));
      }
    }
    const totals = { added:0, updated:0, skipped:waiting.length - operations.length, failed:0 };
    for (let i=0; i<operations.length; i+=20) {
      const batch = operations.slice(i,i+20);
      const requests = batch.map((item,index) => ({ id:String(index), ...item, headers:{ 'Content-Type':'application/json' } }));
      try {
        const data = await graph(token, '/v1.0/$batch', { method:'POST', body:JSON.stringify({ requests }) });
        const results = new Map((data.responses || []).map(item => [item.id,item.status]));
        batch.forEach((operation,index) => {
          const status = results.get(String(index));
          if (status >= 200 && status < 300) totals[operation.method === 'POST' ? 'added' : 'updated']++;
          else totals.failed++;
        });
      } catch {
        totals.failed += operations.length - i;
        break;
      }
    }
    return totals;
  } finally {
    await env.DB.prepare('UPDATE todo_connection SET export_lease = 0 WHERE id = 1 AND export_lease = ?').bind(lease).run();
  }
}

export async function todo(request, env) {
  const { pathname, origin } = new URL(request.url);
  const settings = origin === production && configured(env);
  if (pathname === '/api/todo' && request.method === 'GET') {
    const connection = settings ? await readConnection(env.DB) : null;
    return json({ configured:settings, connected:Boolean(connection), list:connection?.list_name || null });
  }
  if (!settings) return json({ error:'Microsoft To Do hefur ekki verið tengt við heimilisskjáinn.' }, 503);
  if (request.method !== 'GET' && (request.headers.get('Origin') !== origin ||
      request.headers.get('Content-Type')?.split(';')[0] !== 'application/json')) {
    return json({ error:'Beiðni óheimil.' }, 403);
  }
  try {
    if (pathname === '/api/todo/connect' && request.method === 'POST') return await connect(env);
    const connection = await readConnection(env.DB);
    if (!connection) throw new TodoError('Tengdu fyrst reikning Oddnýjar við Microsoft To Do.',409);
    if (pathname === '/api/todo/lists' && request.method === 'GET') {
      return json({ lists:connection.list_id ? [{ id:connection.list_id, name:connection.list_name }]
        : await availableLists(await accessToken(env, connection)) });
    }
    if (pathname === '/api/todo/list' && request.method === 'PUT') {
      const input = await request.json().catch(() => null);
      const list = (await availableLists(await accessToken(env, connection))).find(item=>item.id === input?.id);
      if (!list) throw new TodoError('Veldu sameiginlegan lista sem Oddný á.',400);
      const saved = await env.DB.prepare(`UPDATE todo_connection SET list_id = ?, list_name = ?
        WHERE id = 1 AND connection_key = ? AND (list_id IS NULL OR list_id = ?) AND export_lease <= ?`)
        .bind(list.id, list.name, connection.connection_key, list.id, Date.now()).run();
      if (!saved.meta.changes) throw new TodoError('Listaval er þegar vistað. Tengdu reikninginn aftur til að skipta um lista.',409);
      return json({ list:list.name });
    }
    if (pathname === '/api/todo/export' && request.method === 'POST') return json(await exportItems(env, connection));
    return json({ error:'Slóð fannst ekki.' },404);
  } catch (error) {
    return error instanceof TodoError
      ? json({ error:error.message }, error.status)
      : json({ error:'Ekki tókst að ljúka Microsoft To Do-aðgerðinni. Reyndu aftur.' },502);
  }
}
