/* A separate extension window stays available while the user switches pages. */
async function openComparator(tab) {
  if (tab?.id && !tab.url?.startsWith(chrome.runtime.getURL(''))) {
    await chrome.storage.session.set({target: {id: tab.id, title: tab.title || '', url: tab.url || ''}});
  }
  const {compareWindow} = await chrome.storage.session.get('compareWindow');
  if (compareWindow) {
    try { await chrome.windows.update(compareWindow, {focused: true}); return; } catch (_) { /* closed */ }
  }
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL('compare.html'), type: 'popup', width: 1180, height: 820, focused: true
  });
  await chrome.storage.session.set({compareWindow: win.id});
}
chrome.action.onClicked.addListener(tab => openComparator(tab).catch(console.error));
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({id: 'compare-selection', title: '保存选中文字为对比 A', contexts: ['selection']});
    chrome.contextMenus.create({id: 'compare-open', title: '打开作业标注对比', contexts: ['page']});
  });
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === 'compare-selection') {
      await chrome.storage.session.set({incomingSelection: {text: info.selectionText || '', title: tab.title || '', url: tab.url || ''}});
    }
    await openComparator(tab);
  } catch (error) { console.error(error); }
});
