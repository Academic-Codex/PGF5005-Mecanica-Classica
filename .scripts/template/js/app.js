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
})();