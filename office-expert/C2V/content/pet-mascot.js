(() => {
  'use strict';
  if (globalThis.__cylePetMascotV1) return;
  const CLIPS = {
  "dark": [
    {
      "id": "XF01",
      "label": "抬爪打招呼",
      "duration": 8083,
      "animation": "assets/themes/mascots/xf01.webp",
      "start": "assets/themes/mascots/xf01-start.webp",
      "end": "assets/themes/mascots/xf01-end.webp"
    },
    {
      "id": "XF02",
      "label": "大大伸懒腰",
      "duration": 8083,
      "animation": "assets/themes/mascots/xf02.webp",
      "start": "assets/themes/mascots/xf02-start.webp",
      "end": "assets/themes/mascots/xf02-end.webp"
    },
    {
      "id": "XF03",
      "label": "探头又缩回",
      "duration": 8083,
      "animation": "assets/themes/mascots/xf03.webp",
      "start": "assets/themes/mascots/xf03-start.webp",
      "end": "assets/themes/mascots/xf03-end.webp"
    },
    {
      "id": "XF04",
      "label": "尾巴是自己的玩具",
      "duration": 8083,
      "animation": "assets/themes/mascots/xf04.webp",
      "start": "assets/themes/mascots/xf04-start.webp",
      "end": "assets/themes/mascots/xf04-end.webp"
    },
    {
      "id": "XF05",
      "label": "开心原地小跳",
      "duration": 8083,
      "animation": "assets/themes/mascots/xf05.webp",
      "start": "assets/themes/mascots/xf05-start.webp",
      "end": "assets/themes/mascots/xf05-end.webp"
    },
    {
      "id": "XF06",
      "label": "困困打哈欠",
      "duration": 8083,
      "animation": "assets/themes/mascots/xf06.webp",
      "start": "assets/themes/mascots/xf06-start.webp",
      "end": "assets/themes/mascots/xf06-end.webp"
    },
    {
      "id": "XF07",
      "label": "摇头表示不服",
      "duration": 8083,
      "animation": "assets/themes/mascots/xf07.webp",
      "start": "assets/themes/mascots/xf07-start.webp",
      "end": "assets/themes/mascots/xf07-end.webp"
    },
    {
      "id": "XF08",
      "label": "轻轻抖毛甩耳",
      "duration": 8083,
      "animation": "assets/themes/mascots/xf08.webp",
      "start": "assets/themes/mascots/xf08-start.webp",
      "end": "assets/themes/mascots/xf08-end.webp"
    },
    {
      "id": "XF09",
      "label": "自由即兴·调皮",
      "duration": 8083,
      "animation": "assets/themes/mascots/xf09.webp",
      "start": "assets/themes/mascots/xf09-start.webp",
      "end": "assets/themes/mascots/xf09-end.webp"
    }
  ],
  "light": [
    {
      "id": "XD01",
      "label": "抬爪打招呼",
      "duration": 8083,
      "animation": "assets/themes/mascots/xd01.webp",
      "start": "assets/themes/mascots/xd01-start.webp",
      "end": "assets/themes/mascots/xd01-end.webp"
    },
    {
      "id": "XD02",
      "label": "大大伸懒腰",
      "duration": 8083,
      "animation": "assets/themes/mascots/xd02.webp",
      "start": "assets/themes/mascots/xd02-start.webp",
      "end": "assets/themes/mascots/xd02-end.webp"
    },
    {
      "id": "XD03",
      "label": "探头又缩回",
      "duration": 8083,
      "animation": "assets/themes/mascots/xd03.webp",
      "start": "assets/themes/mascots/xd03-start.webp",
      "end": "assets/themes/mascots/xd03-end.webp"
    },
    {
      "id": "XD04",
      "label": "尾巴是自己的玩具",
      "duration": 8083,
      "animation": "assets/themes/mascots/xd04.webp",
      "start": "assets/themes/mascots/xd04-start.webp",
      "end": "assets/themes/mascots/xd04-end.webp"
    },
    {
      "id": "XD05",
      "label": "开心原地小跳",
      "duration": 8083,
      "animation": "assets/themes/mascots/xd05.webp",
      "start": "assets/themes/mascots/xd05-start.webp",
      "end": "assets/themes/mascots/xd05-end.webp"
    },
    {
      "id": "XD06",
      "label": "困困打哈欠",
      "duration": 8083,
      "animation": "assets/themes/mascots/xd06.webp",
      "start": "assets/themes/mascots/xd06-start.webp",
      "end": "assets/themes/mascots/xd06-end.webp"
    },
    {
      "id": "XD07",
      "label": "摇头表示不服",
      "duration": 8083,
      "animation": "assets/themes/mascots/xd07.webp",
      "start": "assets/themes/mascots/xd07-start.webp",
      "end": "assets/themes/mascots/xd07-end.webp"
    },
    {
      "id": "XD08",
      "label": "轻轻抖毛甩耳",
      "duration": 8083,
      "animation": "assets/themes/mascots/xd08.webp",
      "start": "assets/themes/mascots/xd08-start.webp",
      "end": "assets/themes/mascots/xd08-end.webp"
    },
    {
      "id": "XD09",
      "label": "自由即兴·调皮",
      "duration": 8083,
      "animation": "assets/themes/mascots/xd09.webp",
      "start": "assets/themes/mascots/xd09-start.webp",
      "end": "assets/themes/mascots/xd09-end.webp"
    }
  ]
};
  function create({ root, panel, element, assetUrl }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cyle-pet-performer';
    element.removeAttribute('aria-hidden');
    element.append(button);
    element.classList.add('has-pet-performer');
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const next = { dark: 0, light: 0 };
    let theme = '', active = false, disposed = false, signature = '', epoch = 0;
    let timer = 0, request = null, objectUrl = null, pendingImage = null, cancelImage = null;
    function canPlay() { return active && !disposed && !preference.matches; }
    function phase(value) { element.dataset.petState = value; }
    function cancelWork() {
      epoch += 1;
      clearTimeout(timer); timer = 0;
      request?.abort(); request = null;
      if (cancelImage) cancelImage();
      cancelImage = null; pendingImage = null;
    }
    function release() {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    function display(src, version, blobUrl = null) {
      return new Promise(resolve => {
        const image = new Image();
        image.alt = ''; image.draggable = false;
        pendingImage = image;
        cancelImage = () => { image.onload = image.onerror = null; image.src = ''; if (blobUrl) URL.revokeObjectURL(blobUrl); resolve(false); };
        image.onload = () => {
          if (disposed || epoch !== version) { if (blobUrl) URL.revokeObjectURL(blobUrl); resolve(false); return; }
          pendingImage = null; cancelImage = null; release(); objectUrl = blobUrl;
          button.replaceChildren(image);
          element.classList.add('has-animated-pet');
          resolve(true);
        };
        image.onerror = () => {
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          if (pendingImage === image) { pendingImage = null; cancelImage = null; }
          resolve(false);
        };
        image.src = src;
      });
    }
    function label(clip) {
      const name = theme === 'dark' ? '墨团 · 小狐狸' : '绒绒 · 小狗';
      button.setAttribute('aria-label', `${name}，${clip.label}，点击播放下一段表演`);
      button.title = `${name} · ${clip.label}（点击切换表演）`;
      element.dataset.petClip = clip.id;
    }
    function later(delay, version) {
      clearTimeout(timer);
      if (canPlay()) timer = setTimeout(() => { if (epoch === version) playNext(); }, delay);
    }
    async function playNext() {
      if (!canPlay()) return;
      cancelWork();
      const version = epoch;
      const clips = CLIPS[theme];
      const clip = clips[next[theme]];
      next[theme] = (next[theme] + 1) % clips.length;
      label(clip); phase('loading');
      const controller = new AbortController(); request = controller;
      try {
        // Fresh blob URLs restart one-shot WebP, including a repeated clip. Only
        // the current animation is retained; static endpoints release its URL.
        const response = await fetch(assetUrl(clip.animation), { signal: controller.signal });
        if (!response.ok) throw new Error('Pet animation unavailable');
        const blob = await response.blob();
        if (epoch !== version || !canPlay()) return;
        request = null;
        const url = URL.createObjectURL(blob);
        const loaded = await display(url, version, url);
        if (epoch !== version || !canPlay()) return;
        if (!loaded) throw new Error('Pet animation could not be decoded');
        phase('playing');
        timer = setTimeout(async () => {
          if (epoch !== version || !canPlay()) return;
          await display(assetUrl(clip.end), version);
          if (epoch !== version || !canPlay()) return;
          phase('resting'); later(24000, version);
        }, clip.duration + 100);
      } catch (error) {
        if (epoch !== version || disposed || error.name === 'AbortError') return;
        request = null;
        await display(assetUrl(clip.start), version);
        if (epoch !== version) return;
        phase('fallback'); later(30000, version);
      }
    }
    async function sync() {
      if (disposed) return;
      const nextTheme = root.dataset.cyleTheme === 'light' ? 'light' : 'dark';
      const visible = root.isConnected && !root.hidden && !panel.classList.contains('is-minimized') && !document.hidden;
      const key = `${nextTheme}:${visible}:${preference.matches}`;
      if (signature === key) return;
      signature = key; theme = nextTheme; active = visible;
      cancelWork(); release();
      button.replaceChildren(); element.classList.remove('has-animated-pet');
      const clip = CLIPS[theme][next[theme]];
      label(clip); phase(visible ? 'static' : 'suspended');
      button.disabled = preference.matches;
      if (!visible) return;
      const version = epoch;
      await display(assetUrl(clip.start), version);
      if (epoch === version && canPlay()) later(450, version);
    }
    button.addEventListener('click', playNext);
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['hidden', 'data-cyle-theme'] });
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', sync);
    preference.addEventListener('change', sync);
    sync();
    return {
      dispose() {
        if (disposed) return;
        disposed = true; active = false; cancelWork(); release(); observer.disconnect();
        document.removeEventListener('visibilitychange', sync);
        preference.removeEventListener('change', sync);
        button.removeEventListener('click', playNext); button.remove();
        element.classList.remove('has-pet-performer', 'has-animated-pet'); phase('disposed');
      }
    };
  }
  globalThis.__cylePetMascotV1 = { create, clips: CLIPS };
})();
