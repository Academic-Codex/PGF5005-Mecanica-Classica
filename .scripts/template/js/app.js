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


  // === Avatar protegido: decrypt & render com logs ===
  (() => {
    'use strict';

    // ——— CONFIG ———
    const ENC_URL = 'https://academic-codex.github.io/PGF5005-Mecanica-Classica/assets/img/profile.enc.json';
    // obf = Base64 do HEX invertido (outra ofuscação? ajuste aqui)
    const OBF = 'YWE5YjQ4ODQ1MTkyNDJiZjQzYTE5Y2Y3NzZlNWE3NGEyYjVkNDI4MjllNDU4MjA0ZTc2MTFlNDIzYmYwZjc2Ng==';

    // ——— helpers ———
    const log = (...a) => console.log('[avatar]', ...a);
    const errlog = (...a) => console.error('[avatar]', ...a);

    function safeAtob(s) {
      s = (s || '').toString().trim().replace(/[\r\n\s]/g, '').replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      return atob(s);
    }
    const b64ToU8 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    function hexToBytes(hex) { const m = (hex || '').match(/.{1,2}/g) || []; return new Uint8Array(m.map(h => parseInt(h, 16))); }

    async function loadProtectedAvatar() {
      try {
        const img = document.getElementById('avatar') || document.querySelector('img.avatar');
        if (!img) { log('sem #avatar nesta página — saindo'); return; }

        // Reconstrói a chave a partir do OBF (Base64 do HEX invertido)
        const keyHex = safeAtob(OBF).split('').reverse().join('');
        const keyBytes = hexToBytes(keyHex);
        log('keyHex len=', keyHex.length, 'keyBytes len=', keyBytes.length);
        if (keyBytes.length !== 32) throw new Error('key length != 32 bytes');

        // Baixa o JSON cifrado
        log('fetch:', ENC_URL);
        const resp = await fetch(ENC_URL, { cache: 'no-store' });
        log('status:', resp.status);
        if (!resp.ok) throw new Error(`fetch failed: ${resp.status} ${resp.statusText}`);
        const payload = await resp.json();
        log('payload keys:', Object.keys(payload));

        const iv = b64ToU8(payload.iv);
        const tag = b64ToU8(payload.tag);
        const ct = b64ToU8(payload.ciphertext);
        log('lens iv/tag/ct:', iv.length, tag.length, ct.length);

        // ct + tag
        const combo = new Uint8Array(ct.length + tag.length);
        combo.set(ct, 0); combo.set(tag, ct.length);

        // Importa chave e decripta
        const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, combo);
        log('decrypt OK, bytes:', plain.byteLength);

        // Blob -> URL -> <img>
        const blob = new Blob([plain], { type: payload.mime || 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        img.onload = () => log('img carregada ✓');
        img.onerror = e => errlog('img error', e);
        img.src = url;
        log('src definido');
      } catch (e) {
        errlog('FALHA:', e);
      }
    }

    // expõe para você poder chamar manualmente no console
    window.loadProtectedAvatar = loadProtectedAvatar;

    // garante que rode depois do DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', loadProtectedAvatar, { once: true });
    } else {
      loadProtectedAvatar();
    }
  })();

})();