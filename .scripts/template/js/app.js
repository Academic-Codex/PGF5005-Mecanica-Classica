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


  (function () {
    'use strict';

    const encUrl = './assets/img/profile.enc.json';
    const obf = 'YWE5YjQ4ODQ1MTkyNDJiZjQzYTE5Y2Y3NzZlNWE3NGEyYjVkNDI4MjllNDU4MjA0ZTc2MTFlNDIzYmYwZjc2Ng==';

    function safeAtob(s) {
      s = (s || '').toString().trim().replace(/[\r\n\s]/g, '').replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      return atob(s);
    }

    function hexToBytes(hex) {
      if (!hex) return new Uint8Array();
      const pairs = hex.match(/.{1,2}/g) || [];
      return new Uint8Array(pairs.map(h => parseInt(h, 16)));
    }

    function b64ToU8(b64) {
      return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    }

    async function doDecrypt() {
      try {
        console.log('[avatar] starting decrypt flow');

        // reconstruir chave: obf => atob => reverse => keyHex
        const keyHex = safeAtob(obf).split('').reverse().join('');
        if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
          console.warn('[avatar] keyHex format unexpected (expected 64 hex chars):', keyHex);
        }
        const keyBytes = hexToBytes(keyHex);
        console.log('[avatar] keyBytes length:', keyBytes.length);
        if (keyBytes.length !== 32) throw new Error('key length != 32 bytes');

        // fetch do arquivo cifrado
        const resp = await fetch(encUrl, { cache: 'no-store' });
        if (!resp.ok) throw new Error(`fetch failed: ${resp.status} ${resp.statusText} (${resp.url})`);
        const payload = await resp.json();
        console.log('[avatar] fetched payload keys:', Object.keys(payload));

        // transformar b64 -> Uint8Array
        const ivU8 = b64ToU8(payload.iv);
        const tagU8 = b64ToU8(payload.tag);
        const ctU8 = b64ToU8(payload.ciphertext);
        console.log('[avatar] lens iv/tag/ct:', ivU8.length, tagU8.length, ctU8.length);

        if (ivU8.length !== 12) console.warn('[avatar] warning: iv length is not 12 bytes (AES-GCM recommended nonce=12)');
        if (tagU8.length !== 16) console.warn('[avatar] warning: tag length is not 16 bytes (AES-GCM typical tag=16)');

        // concat CT + TAG (WebCrypto expects tag appended)
        const combo = new Uint8Array(ctU8.length + tagU8.length);
        combo.set(ctU8, 0);
        combo.set(tagU8, ctU8.length);

        // importa chave e decripta
        const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
        const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivU8 }, cryptoKey, combo.buffer);
        console.log('[avatar] decrypt OK, plain bytes:', (plainBuf && plainBuf.byteLength) || 0);

        // cria blob e injeta no img
        const mime = payload.mime || 'image/jpeg';
        const blob = new Blob([plainBuf], { type: mime });
        const objUrl = URL.createObjectURL(blob);

        const imgEl = document.getElementById('avatar') || document.getElementById('img') || document.querySelector('img.avatar');
        if (!imgEl) {
          console.warn('[avatar] no <img> element found to set src — objectURL available:', objUrl);
          // opcional: abrir em nova aba para confirmação
          // window.open(objUrl, '_blank');
          return;
        }

        imgEl.onload = () => {
          console.log('[avatar] image loaded');
          // URL.revokeObjectURL(objUrl); // opcional: revogar quando não precisar
        };
        imgEl.onerror = e => console.error('[avatar] image error:', e);
        imgEl.src = objUrl;
        console.log('[avatar] image src set');

      } catch (err) {
        console.error('[avatar] FALLHA:', err);
      }
    }

    // garante que o DOM está pronto antes de executar
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', doDecrypt, { once: true });
    } else {
      // já pronto
      doDecrypt();
    }
  })();

})();