(function () {
  const data = window.TREE_DATA;
  if (!data) return;

  const elTree = document.getElementById('tree');
  const q = document.getElementById('q');
  const viewer = document.getElementById('viewer');

  // ——— util: abre todos os ancestrais de um elemento
  function openAncestors(el) {
    let cur = el.parentElement;
    while (cur && cur !== elTree) {
      if (cur.classList && cur.classList.contains('node')) {
        cur.classList.add('open');
      }
      cur = cur.parentElement;
    }
  }

  function mkNode(node, { initialOpen = true } = {}) {
    const li = document.createElement('li');
    li.className = 'node ' + (node.type === 'dir' ? 'dir' : 'file');

    const label = document.createElement('span');
    label.className = 'label';

    if (node.type === 'dir') {
      label.textContent = node.name;
      label.onclick = () => li.classList.toggle('open');

      // >>> estado inicial expandido
      if (initialOpen) li.classList.add('open');

      li.appendChild(label);

      const ul = document.createElement('ul');
      ul.className = 'children';
      (node.children || []).forEach(ch => ul.appendChild(mkNode(ch, { initialOpen })));
      li.appendChild(ul);

    } else {
      if (node.nb_html) {
        const a = document.createElement('a');
        a.textContent = node.name;
        a.href = '#';
        a.className = 'file-notebook';
        a.onclick = (e) => { e.preventDefault(); viewer.src = node.nb_html; };
        label.appendChild(a);
      } else {
        label.textContent = node.name;
      }
      li.appendChild(label);
    }
    return li;
  }

  function render(filter = '') {
    elTree.innerHTML = '';
    const norm = s => (s || '').toLowerCase();

    function pass(node) {
      if (!filter) return true;
      return norm(node.name).includes(filter) || (node.path && norm(node.path).includes(filter));
    }

    function cloneFiltered(node) {
      if (node.type === 'file') return pass(node) ? node : null;
      const kids = (node.children || []).map(cloneFiltered).filter(Boolean);
      if (kids.length) return { ...node, children: kids };
      return pass(node) ? { ...node, children: [] } : null;
    }

    const filtered = cloneFiltered(data);
    if (!filtered) { elTree.innerHTML = '<li class="node">Nothing found…</li>'; return; }

    // cria nós JÁ abertos
    (filtered.children || []).forEach(ch => elTree.appendChild(mkNode(ch, { initialOpen: true })));

    // se há filtro, garanta ancestrais abertos dos matches visíveis
    if (filter) {
      elTree.querySelectorAll('.node.file .label, .node.dir .label').forEach(lbl => {
        const txt = lbl.textContent || '';
        if (norm(txt).includes(filter)) openAncestors(lbl);
      });
    }
  }

  q.addEventListener('input', (e) => render(e.target.value.trim().toLowerCase()));
  render();


  /*************** DEBUG INICIAL DO APP ***************/
  console.log('[avatar] app.js carregado', new Date().toISOString(), 'readyState=', document.readyState);

  // Loga erros globais para pegar qualquer exceção que impeça o restante de rodar
  window.addEventListener('error', (e) => {
    console.error('[avatar] window.onerror:', e.message, 'em', e.filename + ':' + e.lineno + ':' + e.colno);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[avatar] unhandledrejection:', e.reason);
  });

  /*************** LOADER DO AVATAR PROTEGIDO ***************/
  (() => {
    'use strict';

    // ——— CONFIG ———
    const ENC_URL = 'https://academic-codex.github.io/PGF5005-Mecanica-Classica/assets/img/profile.enc.json';
    // OBF = Base64 do HEX invertido (como combinamos)
    const OBF = 'YWE5YjQ4ODQ1MTkyNDJiZjQzYTE5Y2Y3NzZlNWE3NGEyYjVkNDI4MjllNDU4MjA0ZTc2MTFlNDIzYmYwZjc2Ng==';

    // ——— HELPERS ———
    const log = (...a) => console.log('[avatar]', ...a);
    const errlog = (...a) => console.error('[avatar]', ...a);
    function safeAtob(s) { s = (s || '').toString().trim().replace(/[\r\n\s]/g, '').replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return atob(s); }
    const b64ToU8 = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const hexToBytes = (hex) => new Uint8Array((hex.match(/.{1,2}/g) || []).map(h => parseInt(h, 16)));

    async function loadProtectedAvatar() {
      log('handler iniciou. readyState=', document.readyState);

      // 1) Garantir que o <img> existe
      const img = document.getElementById('avatar') || document.querySelector('img.avatar');
      if (!img) { errlog('NÃO ENCONTREI <img id="avatar"> nesta página. Abortando.'); return; }
      log('encontrei <img id="avatar">');

      try {
        // 2) Reconstruir chave
        const keyHex = safeAtob(OBF).split('').reverse().join('');
        log('keyHex len=', keyHex.length, 'head=', keyHex.slice(0, 6), 'tail=', keyHex.slice(-6));
        const keyBytes = hexToBytes(keyHex);
        log('keyBytes len=', keyBytes.length);
        if (keyBytes.length !== 32) throw new Error('key length != 32 bytes');

        // 3) Buscar JSON cifrado
        log('fetch', ENC_URL);
        const resp = await fetch(ENC_URL, { cache: 'no-store' });
        log('status', resp.status, resp.statusText);
        if (!resp.ok) throw new Error(`fetch falhou: ${resp.status} ${resp.statusText}`);
        const payload = await resp.json().catch(async e => {
          const raw = await resp.text().catch(() => '<sem corpo>');
          errlog('falha parse JSON; amostra:', raw.slice(0, 200));
          throw e;
        });
        log('payload OK. keys=', Object.keys(payload));

        // 4) Converter campos
        const iv = b64ToU8(payload.iv);
        const tag = b64ToU8(payload.tag);
        const ct = b64ToU8(payload.ciphertext);
        log('lens iv/tag/ct:', iv.length, tag.length, ct.length);

        // 5) Montar combo ct+tag
        const combo = new Uint8Array(ct.length + tag.length);
        combo.set(ct, 0); combo.set(tag, ct.length);

        // 6) Decriptar
        const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
        log('importKey OK');
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, combo.buffer);
        log('decrypt OK; bytes=', plain.byteLength);

        // 7) Blob -> URL -> <img>
        const blob = new Blob([plain], { type: payload.mime || 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        img.onload = () => log('img onload ✓');
        img.onerror = (e) => errlog('img onerror', e);
        img.src = url;
        log('src definido →', url.slice(0, 60) + '…');

      } catch (e) {
        errlog('FALHA NO HANDLER:', e);
      }
    }

    // Expor p/ você poder acionar manualmente
    window.loadProtectedAvatar = loadProtectedAvatar;

    // 8) Garantir execução após DOM
    if (document.readyState === 'loading') {
      log('aguardando DOMContentLoaded…');
      document.addEventListener('DOMContentLoaded', () => {
        log('DOMContentLoaded disparado');
        loadProtectedAvatar();
      }, { once: true });
    } else {
      log('DOM já pronto; executando handler agora');
      loadProtectedAvatar();
    }
  })();

})();