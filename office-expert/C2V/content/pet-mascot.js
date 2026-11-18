(() => {
  'use strict';
  if (globalThis.__cylePetMascotV1) return;
  const pictures = {
    dark: 'assets/themes/mascots/fox-static.webp',
    light: 'assets/themes/mascots/dog-static.webp'
  };
  // A single still image per theme: no animation fetch, blob, or playback timer.
  function create({ root, panel, element, assetUrl }) {
    const holder = document.createElement('button');
    holder.className = 'cyle-pet-performer';
    holder.type = 'button';
    holder.title = '切换静态姿势';
    holder.setAttribute('aria-label', '切换宠物静态姿势');
    element.append(holder);
    element.classList.add('has-pet-performer');
    element.removeAttribute('aria-hidden');
    const poses = { dark: 1, light: 1 };
    const heading = element.parentElement;
    const header = panel.querySelector('.gtm-inspector-header');
    function place() {
      if (disposed || !image || !heading.offsetWidth) return;
      const h = heading.getBoundingClientRect();
      const scale = h.width / heading.offsetWidth;
      const toolbar = header.querySelector(':scope > .gtm-inspector-toolbar');
      const card = panel.querySelector('.cyle-public-materials');
      const compact = heading.offsetWidth <= 300;
      const ledge = compact ? toolbar : card;
      if (!ledge) return;
      const y = (ledge.getBoundingClientRect().top - h.top) / scale;
      const height = Math.min(compact ? 132 : 154, Math.max(64, y - 6));
      element.style.top = `${y - height + 1}px`;
      element.style.height = `${height}px`;
      element.style.bottom = 'auto';
      element.dataset.petLedge = compact ? 'toolbar' : 'materials';
    }
    let disposed = false, signature = '', image = null, pending = null, loadedKey = '';
    const visibleNow = () => root.isConnected && !root.hidden && !panel.classList.contains('is-minimized') && !document.hidden;
    function release(node) {
      if (node) { node.onload = node.onerror = null; node.removeAttribute('src'); }
    }
    function clear() {
      release(pending); pending = null;
      release(image); image = null; loadedKey = '';
      holder.replaceChildren();
      element.classList.remove('has-static-pet');
    }
    function sync() {
      if (disposed) return;
      const theme = root.dataset.cyleTheme === 'light' ? 'light' : 'dark';
      const visible = visibleNow(), desired = `${theme}:${poses[theme]}`;
      const key = `${desired}:${visible}`;
      if (signature === key) return;
      signature = key;
      holder.hidden = !visible;
      // Keep the one decoded still across tab switches. Extension reload can
      // invalidate the old page's runtime; returning must not resolve it again.
      if (!visible) { element.dataset.petState = 'suspended'; return; }
      if (image && loadedKey === desired) {
        element.dataset.petState = 'static'; place(); return;
      }
      release(pending); pending = null;
      element.dataset.petState = 'loading';
      const next = new Image(), pose = poses[theme];
      pending = next;
      next.alt = ''; next.draggable = false; next.decoding = 'async';
      next.onload = () => {
        if (disposed || pending !== next) return;
        release(image); image = next; pending = null; loadedKey = desired;
        holder.replaceChildren(next);
        element.classList.add('has-static-pet');
        element.dataset.petState = visibleNow() ? 'static' : 'suspended';
        element.dataset.petPose = String(pose);
        place();
      };
      next.onerror = () => {
        if (disposed || pending !== next) return;
        release(next); pending = null;
        // A failed switch keeps the last successful current-generation image.
        // With no image yet, leave the slot empty instead of showing legacy art.
        element.dataset.petState = visibleNow() ? 'fallback' : 'suspended';
      };
      try {
        next.src = assetUrl(pictures[theme].replace('.webp', pose === 1 ? '.webp' : `-0${pose}.webp`));
      } catch {
        next.onerror();
      }
    }
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['hidden', 'data-cyle-theme'] });
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', sync);
    const resize = new ResizeObserver(place);
    resize.observe(panel);
    resize.observe(header);
    const cards = panel.querySelector('.gtm-inspector-cards');
    if (cards) resize.observe(cards);
    function nextPose() {
      const theme = root.dataset.cyleTheme === 'light' ? 'light' : 'dark';
      poses[theme] = poses[theme] % 3 + 1;
      sync();
    }
    holder.addEventListener('click', nextPose);
    sync();
    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        observer.disconnect();
        resize.disconnect();
        holder.removeEventListener('click', nextPose);
        document.removeEventListener('visibilitychange', sync);
        clear(); holder.remove();
        element.classList.remove('has-pet-performer');
        element.dataset.petState = 'disposed';
      }
    };
  }
  globalThis.__cylePetMascotV1 = { create, pictures };
})();
