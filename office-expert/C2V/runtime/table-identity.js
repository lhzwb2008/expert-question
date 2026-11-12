export function buildTableKey(pageUrl, sheetIndex, sheetIdOverride = '') {
  try {
    const url = new URL(pageUrl);
    const sheetId = String(sheetIdOverride || url.searchParams.get('sheet') || '');
    return `${url.pathname}::${sheetId}::${sheetIndex ?? ''}`;
  } catch (_error) {
    return `unknown::${String(sheetIdOverride || '')}::${sheetIndex ?? ''}`;
  }
}

export function tableKeyParts(value) {
  const [path = '', sheetId = '', sheetIndex = ''] = String(value || '').split('::');
  return { path, sheetId, sheetIndex };
}

export function tableKeysCompatible(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  const first = tableKeyParts(left);
  const second = tableKeyParts(right);
  if (
    !first.path
    || first.path === 'unknown'
    || first.path !== second.path
    || first.sheetIndex !== second.sheetIndex
  ) {
    return false;
  }
  return (
    !first.sheetId
    || !second.sheetId
    || first.sheetId === second.sheetId
  );
}
