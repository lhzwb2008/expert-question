(() => {
  const ADAPTER_KEY = '__gtMapperFeishuSheetAdapterV5';
  const MAX_SCAN_COLUMNS = 2048;
  const MAX_SCAN_ROWS = 100000;
  const HEADER_PROBE_SAMPLE = 6;

  if (window[ADAPTER_KEY]) return;

  function toText(value, depth = 0) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (depth > 4) return JSON.stringify(value);
    if (typeof value === 'object') {
      if (value.text) return String(value.text);
      if (value.value !== undefined) return toText(value.value, depth + 1);
      if (value.formula) return String(value.formula);
      if (Array.isArray(value.richText)) {
        return value.richText.map((segment) => segment?.text || '').join('');
      }
      return JSON.stringify(value);
    }
    return String(value);
  }

  function simpleText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'object') {
      if (typeof value.text === 'string') return value.text;
      if (value.value !== undefined && typeof value.value !== 'object') return String(value.value);
    }
    return String(value ?? '');
  }

  function normalizedLineEndings(value) {
    return String(value ?? '').replace(/\r\n?/g, '\n');
  }

  function writeValuesEquivalent(actual, expected) {
    const left = normalizedLineEndings(actual);
    const right = normalizedLineEndings(expected);
    if (left === right) return true;
    try {
      return JSON.stringify(JSON.parse(left)) === JSON.stringify(JSON.parse(right));
    } catch (_error) {
      return false;
    }
  }

  function normalizedJoinKey(value) {
    return String(value ?? '').trim();
  }

  const VIDEO_EXT_RE = /\.(?:mp4|m4v|mov|qt|webm|ogv|ogg|avi|mkv|flv|wmv|asf|3gp|3g2|ts|mts|m2ts|vob|mpeg|mpg|mpe|m1v|m2v|f4v|rm|rmvb|divx|mxf|mod|tod|dat|amv|m3u8|mpd)$/i;
  const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|tiff?|ico)$/i;
  const AUDIO_EXT_RE = /\.(?:mp3|wav|ogg|m4a|aac|flac|wma|opus)$/i;
  const FILE_EXT_RE = /\.(?:pdf|docx?|xlsx?|pptx?|csv|txt|json|xml|md|zip|rar|7z|tar|gz)$/i;

  function inferMediaKind(mimeType, fileName) {
    const mt = String(mimeType || '').toLowerCase();
    if (mt.startsWith('video/')) return 'video';
    if (mt.startsWith('image/')) return 'image';
    if (mt.startsWith('audio/')) return 'audio';
    const name = String(fileName || '');
    const dot = name.lastIndexOf('.');
    if (dot >= 0) {
      const ext = name.slice(dot).toLowerCase();
      if (VIDEO_EXT_RE.test(ext)) return 'video';
      if (IMAGE_EXT_RE.test(ext)) return 'image';
      if (AUDIO_EXT_RE.test(ext)) return 'audio';
    }
    return 'file';
  }

  function findHttpUrl(value, depth = 0) {
    if (value === null || value === undefined || depth > 4) return '';
    if (typeof value === 'string') {
      return value.match(/https?:\/\/[^\s"'}`\]]+/i)?.[0] || '';
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findHttpUrl(item, depth + 1);
        if (found) return found;
      }
      return '';
    }
    if (typeof value === 'object') {
      for (const key of [
        'url',
        'link',
        'href',
        'src',
        'downloadUrl',
        'download_url',
        'fileUrl',
        'file_url'
      ]) {
        const found = findHttpUrl(value[key], depth + 1);
        if (found) return found;
      }
      for (const child of Object.values(value)) {
        const found = findHttpUrl(child, depth + 1);
        if (found) return found;
      }
    }
    return '';
  }

  function classifyUrl(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.toLowerCase();
      if (VIDEO_EXT_RE.test(path)) return 'video';
      if (IMAGE_EXT_RE.test(path)) return 'image';
      if (AUDIO_EXT_RE.test(path)) return 'audio';
      if (FILE_EXT_RE.test(path)) return 'file';
      if (
        /(?:video|media|stream|download|attachment)/i.test(path)
        && /(?:x-tos-|x-amz-|signature|expires|token)=/i.test(parsed.search)
      ) {
        return 'media-link';
      }
      return 'link';
    } catch (_error) {
      return '';
    }
  }

  function jsonType(text) {
    const source = String(text || '').trim();
    if (!/^[{[]/.test(source)) return '';
    try {
      JSON.parse(source);
      return 'json';
    } catch (_error) {
      return '';
    }
  }

  function dateFormattedNumber(rawValue, displayValue, header = '') {
    if (
      typeof rawValue !== 'number'
      || !Number.isFinite(rawValue)
      || rawValue < 1
      || rawValue > 2958465
    ) return false;
    const display = String(displayValue || '').trim();
    if (!display || display === String(rawValue)) return false;
    const dateShape = (
      /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?/
        .test(display)
      || /^\d{4}年\d{1,2}月\d{1,2}日(?:\s*\d{1,2}[时:]\d{1,2})?/
        .test(display)
      || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}(?:[ T]\d{1,2}:\d{2})?/
        .test(display)
    );
    return dateShape || (
      /日期|时间|date|time/i.test(String(header || ''))
      && /\d/.test(display)
      && /[-/.年月日:]/.test(display)
    );
  }

  function buildColumnDescriptors(headers) {
    const totals = new Map();
    headers.forEach((header) => {
      const key = String(header || '');
      totals.set(key, (totals.get(key) || 0) + 1);
    });
    const seen = new Map();
    return headers.map((header, columnIndex) => {
      const key = String(header || '');
      const duplicateIndex = (seen.get(key) || 0) + 1;
      seen.set(key, duplicateIndex);
      const duplicateCount = totals.get(key) || 1;
      return {
        key: `column:${columnIndex}`,
        columnIndex,
        columnNumber: columnIndex + 1,
        columnLetter: columnIndexToLetter(columnIndex),
        header: key,
        label: key || `第 ${columnIndex + 1} 列`,
        duplicateIndex,
        duplicateCount,
        duplicate: Boolean(key && duplicateCount > 1)
      };
    });
  }

  function normalizeDropdownOption(value, depth = 0) {
    if (value === null || value === undefined || depth > 3) return null;
    if (['string', 'number', 'boolean'].includes(typeof value)) {
      const text = String(value);
      return text === '' ? null : {
        value: text,
        label: text,
        backgroundColor: '',
        textColor: ''
      };
    }
    if (typeof value !== 'object') return null;
    const labelKeys = [
      'text',
      'label',
      'name',
      'title',
      'displayValue',
      'value',
      'optionValue'
    ];
    let label = '';
    for (const key of labelKeys) {
      const normalized = normalizeDropdownOption(propertyOrCall(value, key), depth + 1);
      if (normalized?.label) {
        label = normalized.label;
        break;
      }
    }
    if (!label) return null;
    let optionValue = '';
    for (const key of ['optionValue', 'value']) {
      const raw = propertyOrCall(value, key);
      if (['string', 'number', 'boolean'].includes(typeof raw)) {
        optionValue = String(raw);
        break;
      }
    }
    const style = propertyOrCall(value, 'style') || {};
    return {
      value: optionValue || label,
      label,
      backgroundColor: normalizeCssColor(
        propertyOrCall(value, 'backgroundColor')
        || propertyOrCall(value, 'bgColor')
        || propertyOrCall(value, 'fillColor')
        || propertyOrCall(style, 'backgroundColor')
        || propertyOrCall(value, 'color')
      ),
      textColor: normalizeCssColor(
        propertyOrCall(value, 'textColor')
        || propertyOrCall(value, 'fontColor')
        || propertyOrCall(style, 'color')
      )
    };
  }

  function normalizeCssColor(value) {
    if (typeof value !== 'string') return '';
    const color = value.trim();
    if (
      /^#[0-9a-f]{3,8}$/i.test(color)
      || /^rgba?\([^)]+\)$/i.test(color)
      || /^hsla?\([^)]+\)$/i.test(color)
      || /^[a-z]+$/i.test(color)
    ) return color;
    return '';
  }

  function dropdownItemsFromCandidate(candidate) {
    const arrays = [];
    const seen = new WeakSet();
    const visit = (value, depth = 0) => {
      if (value === null || value === undefined || depth > 4) return;
      if (Array.isArray(value)) {
        arrays.push(value);
        return;
      }
      if (typeof value !== 'object') return;
      if (seen.has(value)) return;
      seen.add(value);
      for (const key of [
        'options',
        'items',
        'values',
        'list',
        'choices',
        'candidates',
        'enum'
      ]) {
        visit(propertyOrCall(value, key), depth + 1);
      }
      for (const key of ['rule', 'validator', 'validation', 'condition', 'config']) {
        visit(propertyOrCall(value, key), depth + 1);
      }
      const formula = propertyOrCall(value, 'formula1');
      if (Array.isArray(formula)) visit(formula, depth + 1);
      else if (typeof formula === 'string' && /^"[\s\S]*"$/.test(formula)) {
        // Only a literal validation list. Never evaluate a reference/formula or
        // split an option from an actual array (it may contain punctuation).
        arrays.push(formula.slice(1, -1).split(','));
      }
    };
    visit(candidate);
    const unique = new Map();
    arrays.flat().forEach((item) => {
      const normalized = normalizeDropdownOption(item);
      if (normalized && !unique.has(normalized.value)) {
        unique.set(normalized.value, normalized);
      }
    });
    return [...unique.values()];
  }

  function propertyOrCall(target, key, ...args) {
    if (!target) return undefined;
    try {
      const value = target[key];
      if (typeof value === 'function') return value.apply(target, args);
      return value;
    } catch (_error) {
      return undefined;
    }
  }

  function isMultipleDropdown(candidate, depth = 0) {
    if (!candidate || typeof candidate !== 'object' || depth > 4) return false;
    if (['multiple', 'multiSelect', 'allowMultiple', 'multipleSelection'].some(
      (key) => propertyOrCall(candidate, key) === true
    )) return true;
    if (/multi.?select/i.test(String(propertyOrCall(candidate, 'type') || ''))) {
      return true;
    }
    return ['rule', 'validator', 'validation', 'condition', 'config'].some((key) => (
      isMultipleDropdown(propertyOrCall(candidate, key), depth + 1)
    ));
  }

  function isPeopleDropdown(candidate, depth = 0) {
    if (!candidate || typeof candidate !== 'object' || depth > 4) return false;
    const typeText = [
      'type',
      'kind',
      'fieldType',
      'valueType',
      'validatorType',
      'dataType'
    ].map((key) => String(propertyOrCall(candidate, key) || '')).join(' ');
    if (/(?:person|people|user|member|contact|employee|人员|联系人|成员)/i.test(typeText)) {
      return true;
    }
    const identityKeys = [
      'userId',
      'user_id',
      'openId',
      'open_id',
      'employeeId',
      'avatar',
      'avatarUrl',
      'email'
    ];
    if (identityKeys.some((key) => propertyOrCall(candidate, key) !== undefined)) {
      return true;
    }
    for (const key of ['options', 'items', 'values', 'list', 'choices']) {
      const options = propertyOrCall(candidate, key);
      if (
        Array.isArray(options)
        && options.some((option) => (
          option
          && typeof option === 'object'
          && identityKeys.some((itemKey) => propertyOrCall(option, itemKey) !== undefined)
        ))
      ) return true;
    }
    return ['rule', 'validator', 'validation', 'condition', 'config'].some((key) => (
      isPeopleDropdown(propertyOrCall(candidate, key), depth + 1)
    ));
  }

  function columnIndexToLetter(index) {
    let value = Math.max(0, Math.round(Number(index) || 0)) + 1;
    let output = '';
    while (value > 0) {
      value -= 1;
      output = String.fromCharCode(65 + (value % 26)) + output;
      value = Math.floor(value / 26);
    }
    return output;
  }

  function buildAttachmentMetadata(media, origin) {
    const segType = media?.type || media?.segType || '';
    const fileToken = media?.fileToken || '';
    const link = media?.link || media?.url || media?.src || media?.thumbUrl || '';
    const fileName = media?.fileName || media?.name || media?.text || '';
    const mimeType = media?.mimeType || media?.mime || '';
    const kind = segType === 'embed-image'
      ? 'image'
      : inferMediaKind(mimeType, fileName);
    const downloadUrl = fileToken
      ? `${origin}/space/api/box/stream/download/all/${fileToken}/`
      : (media?.downloadUrl || media?.download_url || link || '');
    return {
      kind,
      source: 'feishu-attachment',
      segType,
      fileName,
      mimeType,
      width: media?.width || 0,
      height: media?.height || 0,
      size: media?.size || 0,
      fileToken,
      thumbUrl: kind === 'image' ? (link || downloadUrl) : (media?.thumbUrl || link || ''),
      downloadUrl
    };
  }

  class FeishuSheetPageAdapter {
    constructor(pageWindow = window) {
      this.pageWindow = pageWindow;
      this.boundSheets = new WeakSet();
      this.sheetCache = new Map();
    }

    context() {
      const spread = this.pageWindow.spread;
      const sheetIndex = spread?._activeSheetIndex;
      const sheet = spread?.sheets?.[sheetIndex];
      if (!sheet?._dataModel) throw new Error('未检测到飞书表格数据模型');
      return { spread, sheet, sheetIndex, dataModel: sheet._dataModel };
    }

    sheetId(sheet = null) {
      const queryId = new URL(this.pageWindow.location.href).searchParams.get('sheet');
      const activeSheet = sheet || this.context().sheet;
      const internalId = String(activeSheet?._id_ || '').trim();
      if (internalId) return internalId;
      const currentSheet = this.pageWindow.spread?.sheets?.[
        this.pageWindow.spread?._activeSheetIndex
      ];
      if (queryId && activeSheet === currentSheet) return queryId;
      throw new Error('当前页面缺少稳定的 sheet 标识，无法读取或写入');
    }

    targetContext(payload = {}) {
      const active = this.context();
      const requestedId = String(payload.sheetId || '').trim();
      const requestedIndex = Number(payload.sheetIndex);
      if (!requestedId && !Number.isInteger(requestedIndex)) return active;

      const sheets = active.spread?.sheets || [];
      let sheetIndex = Number.isInteger(requestedIndex) ? requestedIndex : -1;
      let sheet = sheetIndex >= 0 ? sheets[sheetIndex] : null;
      const matchesRequestedId = (candidate) => {
        if (!candidate || !requestedId) return false;
        try {
          return this.sheetId(candidate) === requestedId
            || String(candidate?._id_ || '') === requestedId;
        } catch (_error) {
          return false;
        }
      };
      if (requestedId && Number.isInteger(requestedIndex)) {
        if (!sheet || !matchesRequestedId(sheet)) {
          throw new Error('目标 Sheet 的 id 与 index 不一致，已阻止跨表操作');
        }
      } else if (requestedId) {
        sheetIndex = sheets.findIndex(matchesRequestedId);
        sheet = sheets[sheetIndex];
      }
      if (!sheet?._dataModel || sheetIndex < 0) {
        throw new Error(`未找到目标 Sheet：${requestedId || requestedIndex}`);
      }
      const resolvedId = this.sheetId(sheet);
      if (
        requestedId
        && resolvedId !== requestedId
        && String(sheet._id_ || '') !== requestedId
      ) {
        throw new Error('目标 Sheet 标识不一致，已阻止跨表操作');
      }
      return {
        spread: active.spread,
        sheet,
        sheetIndex,
        dataModel: sheet._dataModel
      };
    }

    sheetName(sheet) {
      let name = '';
      try {
        name = typeof sheet.name === 'function' ? sheet.name() : sheet._name;
      } catch (_error) {}
      return String(name || '');
    }

    getCache(sheetId, sheet, dataModel) {
      let cache = this.sheetCache.get(sheetId);
      if (cache) return cache;
      cache = {
        headers: null,
        columnCount: 0,
        lastNonEmptyCol: -1,
        sheetName: '',
        fingerprint: ''
      };
      this.sheetCache.set(sheetId, cache);
      return cache;
    }

    invalidateCache(sheetId) {
      this.sheetCache.delete(sheetId);
    }

    readHeaderCell(sheet, dataModel, col) {
      const readers = [
        () => sheet.getText?.(0, col),
        () => dataModel.getText?.(0, col),
        () => {
          const raw = dataModel.getValue?.(0, col);
          return simpleText(raw);
        },
        () => {
          const raw = sheet.getValue?.(0, col);
          return simpleText(raw);
        }
      ];
      for (const read of readers) {
        try {
          const text = simpleText(read());
          if (text !== '') return text.trim();
        } catch (_error) {}
      }
      return '';
    }

    readDataCellFast(sheet, dataModel, row, col) {
      try {
        const text = sheet.getText?.(row, col);
        if (text !== '' && text !== null && text !== undefined) return toText(text);
      } catch (_error) {}
      try {
        const raw = dataModel.getValue?.(row, col);
        if (raw !== '' && raw !== null && raw !== undefined) return toText(raw);
      } catch (_error) {}
      return '';
    }

    readFormula(sheet, dataModel, row, col) {
      const readers = [
        () => dataModel.getFormula?.(row, col),
        () => sheet.getFormula?.(row, col),
        () => sheet.getCell?.(row, col)?.formula?.(),
        () => dataModel.getValue?.(row, col)?.formula,
        () => sheet.getValue?.(row, col)?.formula,
        () => sheet.getCell?.(row, col)?.value?.()?.formula
      ];
      for (const read of readers) {
        try {
          const formula = String(read() || '');
          if (formula.startsWith('=')) return formula;
        } catch (_error) {}
      }
      return '';
    }

    readDropdownRule(sheet, dataModel, row, col) {
      const cellReaders = [
        () => sheet.getCell?.(row, col),
        () => dataModel.getCell?.(row, col)
      ];
      const candidates = [];
      for (const readCell of cellReaders) {
        try {
          const cell = readCell();
          if (!cell) continue;
          candidates.push(
            propertyOrCall(cell, 'dataValidation'),
            propertyOrCall(cell, 'dataValidator'),
            propertyOrCall(cell, 'validator'),
            propertyOrCall(cell, 'validation'),
            propertyOrCall(cell, 'getDataValidation'),
            propertyOrCall(cell, 'getDataValidationRule'),
            propertyOrCall(cell, 'getValidator'),
            cell._dataValidation,
            cell._validator
          );
        } catch (_error) {}
      }
      const directReaders = [
        () => sheet.getDataValidator?.(row, col),
        () => dataModel.getDataValidator?.(row, col),
        () => sheet.getDataValidation?.(row, col),
        () => dataModel.getDataValidation?.(row, col),
        () => sheet.getDataValidationRule?.(row, col),
        () => dataModel.getDataValidationRule?.(row, col),
        () => sheet.getValidator?.(row, col),
        () => dataModel.getValidator?.(row, col),
        () => sheet.getCellValidator?.(row, col),
        () => dataModel.getCellValidator?.(row, col),
        () => sheet.getDropdownOptions?.(row, col),
        () => dataModel.getDropdownOptions?.(row, col),
        () => sheet.getValidation?.(row, col),
        () => dataModel.getValidation?.(row, col)
      ];
      directReaders.forEach((read) => {
        try {
          candidates.push(read());
        } catch (_error) {}
      });
      for (const candidate of candidates) {
        const items = dropdownItemsFromCandidate(candidate);
        if (items.length) {
          return {
            items,
            options: items.map(({ value }) => value),
            multiple: isMultipleDropdown(candidate),
            kind: isPeopleDropdown(candidate) ? 'people' : 'choice',
            allowBlank: propertyOrCall(candidate, 'ignoreBlank') !== false
              && propertyOrCall(candidate, 'allowBlank') !== false
          };
        }
      }
      return null;
    }

    probeColumn(sheet, dataModel, col) {
      try {
        const h = this.readHeaderCell(sheet, dataModel, col);
        if (h) return h;
      } catch (_error) {}
      try {
        const v = this.readDataCellFast(sheet, dataModel, 1, col);
        if (v) return v;
      } catch (_error) {}
      return '';
    }

    scanLastNonEmptyCol(sheet, dataModel, maxCol) {
      let last = -1;
      for (let col = 0; col <= maxCol; col += 1) {
        if (this.probeColumn(sheet, dataModel, col)) last = col;
      }
      return last;
    }

    computeFingerprint(headers) {
      const parts = [];
      const step = Math.max(1, Math.floor(headers.length / HEADER_PROBE_SAMPLE));
      for (let i = 0; i < headers.length; i += step) {
        parts.push(headers[i]);
        if (parts.length >= HEADER_PROBE_SAMPLE) break;
      }
      parts.push(headers.length);
      parts.push(headers.at(-1) || '');
      return parts.join('\u0001');
    }

    readHeadersCached(sheet, dataModel, sheetId) {
      const cache = this.getCache(sheetId, sheet, dataModel);
      let declared = Number(sheet.getColumnCount?.());
      if (!Number.isFinite(declared) || declared <= 0) {
        declared = Number(dataModel.getColumnCount?.()) || MAX_SCAN_COLUMNS;
      }
      declared = Math.min(declared, MAX_SCAN_COLUMNS);

      const lastCol = this.scanLastNonEmptyCol(sheet, dataModel, declared - 1);
      if (lastCol < 0) {
        throw new Error('表头读取为空，请确认第 1 行是表头并等待表格加载完成');
      }
      const headers = [];
      for (let col = 0; col <= lastCol; col += 1) {
        headers.push(this.readHeaderCell(sheet, dataModel, col));
      }
      while (headers.length && !headers.at(-1)) headers.pop();
      cache.headers = headers;
      cache.columnCount = declared;
      cache.lastNonEmptyCol = headers.length - 1;
      cache.fingerprint = this.computeFingerprint(headers);
      cache.sheetName = this.sheetName(sheet);
      return headers;
    }

    getValue(sheet, dataModel, row, col) {
      return this.inspectCell(sheet, dataModel, row, col).value;
    }

    inspectCell(sheet, dataModel, row, col, header = '') {
      if (row === 0) {
        const value = this.readHeaderCell(sheet, dataModel, col);
        return {
          key: `cell:${row}:${col}`,
          rowIndex: row,
          rowNumber: row + 1,
          columnIndex: col,
          columnNumber: col + 1,
          columnLetter: columnIndexToLetter(col),
          header,
          type: 'header',
          value,
          displayValue: value,
          rawValue: value,
          formula: '',
          url: '',
          metadata: null,
          attachments: [],
          isEmpty: !value
        };
      }
      const ATTACHMENT_TYPES = new Set(['attachment', 'embed-image', 'media', 'file']);
      const formula = this.readFormula(sheet, dataModel, row, col);
      const dropdownRule = this.readDropdownRule(
        sheet,
        dataModel,
        row,
        col
      );
      let segments = [];
      try {
        const candidate = dataModel.getSegmentArray?.(row, col);
        if (Array.isArray(candidate)) segments = candidate;
      } catch (_error) {}
      const attachments = segments
        .filter((segment) => (
          segment?.fileToken
          || (segment?.type && ATTACHMENT_TYPES.has(segment.type))
          || (segment?.segType && ATTACHMENT_TYPES.has(segment.segType))
        ))
        .map((media) => buildAttachmentMetadata(
          media,
          this.pageWindow.location.origin
        ));
      let rawValue = null;
      try {
        rawValue = dataModel.getValue?.(row, col);
        if (rawValue && typeof rawValue === 'object') {
          if (rawValue.kind && ['image', 'video', 'audio', 'file'].includes(rawValue.kind)) {
            const meta = {
              ...rawValue,
              source: 'feishu-attachment'
            };
            if (!meta.downloadUrl && meta.fileToken) {
              meta.downloadUrl = `${this.pageWindow.location.origin}/space/api/box/stream/download/all/${meta.fileToken}/`;
            }
            if (meta.kind === 'file') {
              const inferred = inferMediaKind(meta.mimeType, meta.fileName || meta.name);
              if (inferred !== 'file') meta.kind = inferred;
            }
            if (!attachments.some(({ fileToken }) => (
              fileToken && fileToken === meta.fileToken
            ))) {
              attachments.push(meta);
            }
          }
          const isAttachmentObject = rawValue.fileToken
            || rawValue.thumbUrl
            || (rawValue.type && ATTACHMENT_TYPES.has(rawValue.type))
            || (rawValue.segType && ATTACHMENT_TYPES.has(rawValue.segType));
          if (isAttachmentObject) {
            const meta = buildAttachmentMetadata(
              rawValue,
              this.pageWindow.location.origin
            );
            if (!attachments.some(({ fileToken, downloadUrl }) => (
              (fileToken && fileToken === meta.fileToken)
              || (downloadUrl && downloadUrl === meta.downloadUrl)
            ))) {
              attachments.push(meta);
            }
          }
        }
      } catch (_error) {}
      const displayReaders = [
        () => sheet.getText?.(row, col),
        () => dataModel.getText?.(row, col),
        () => sheet.getCell?.(row, col)?.text?.(),
      ];
      let displayValue = '';
      for (const read of displayReaders) {
        try {
          const text = simpleText(read());
          if (text !== '') {
            displayValue = text;
            break;
          }
        } catch (_error) {}
      }
      if (rawValue === null || rawValue === undefined) {
        try {
          rawValue = sheet.getValue?.(row, col);
        } catch (_error) {}
      }
      const rawText = toText(rawValue);
      const hyperlinkFormulaUrl = formula.match(
        /^\s*=\s*HYPERLINK\s*\(\s*"([^"]+)"/i
      )?.[1] || '';
      const segmentUrl = findHttpUrl(segments);
      const url = attachments[0]?.downloadUrl
        || attachments[0]?.thumbUrl
        || hyperlinkFormulaUrl
        || findHttpUrl(displayValue)
        || segmentUrl
        || findHttpUrl(rawValue);
      let type = '';
      if (attachments.length > 1) {
        type = 'attachments';
      } else if (attachments.length === 1) {
        type = attachments[0].kind || 'file';
      } else {
        type = classifyUrl(url);
      }
      if (url && (!type || ['link', 'file', 'media-link'].includes(type))) {
        const semanticHeader = String(header || '').toLowerCase();
        if (/视频|录像|video/.test(semanticHeader)) type = 'video';
        else if (/图片|图像|照片|image|photo|picture/.test(semanticHeader)) type = 'image';
        else if (/音频|录音|audio|voice/.test(semanticHeader)) type = 'audio';
        else if (/附件|文件|attachment|file/.test(semanticHeader)) type = 'file';
      }
      // A URL embedded in prose does not turn the whole cell into a link/media.
      const prose = displayValue || rawText;
      if (!attachments.length && url && prose.includes(url) && prose.trim() !== url && prose.replace(url, '').trim() !== '') {
        type = jsonType(prose) || (segments.length ? 'rich-text' : 'text');
      }
      if (formula) type = 'formula';
      if (!type) type = jsonType(displayValue || rawText);
      if (
        !type
        && dateFormattedNumber(rawValue, displayValue, header)
      ) type = 'date';
      if (!type && typeof rawValue === 'number') type = 'number';
      if (!type && typeof rawValue === 'boolean') type = 'boolean';
      if (!type && segments.length) type = 'rich-text';
      if (!type) type = 'text';
      const value = attachments.length
        ? JSON.stringify(
          attachments.length === 1
            ? attachments[0]
            : { kind: 'attachments', items: attachments }
        )
        : (displayValue !== '' ? displayValue : rawText);
      const rawReaders = [
        () => sheet.getValue?.(row, col),
        () => dataModel.getValue?.(row, col),
        () => sheet.getCell?.(row, col)?.value?.()
      ];
      if (!rawText) {
        for (const read of rawReaders) {
          try {
            const candidate = read();
            if (candidate !== null && candidate !== undefined && candidate !== '') {
              rawValue = candidate;
              break;
            }
          } catch (_error) {}
        }
      }
      return {
        key: `cell:${row}:${col}`,
        rowIndex: row,
        rowNumber: row + 1,
        columnIndex: col,
        columnNumber: col + 1,
        columnLetter: columnIndexToLetter(col),
        header,
        type,
        value,
        displayValue,
        rawValue: toText(rawValue),
        formula,
        url,
        metadata: attachments[0] || null,
        attachments,
        dropdownOptions: dropdownRule?.options || [],
        dropdownItems: dropdownRule?.items || [],
        dropdownKind: dropdownRule?.kind || '',
        dropdownMultiple: dropdownRule?.multiple || false,
        dropdownAllowBlank: dropdownRule?.allowBlank !== false,
        isEmpty: !String(value || '').trim()
      };
    }

    activeCell(sheet) {
      let row = Number(sheet._activeRowIndex);
      let col = Number(sheet._activeColIndex);
      try {
        const selections = sheet.getSelections?.();
        const activeIndex = Number(sheet._selectionModel?.activeSelectedRangeIndex);
        const selected = selections?.[
          Number.isInteger(activeIndex) && activeIndex >= 0 ? activeIndex : 0
        ];
        if (selected) {
          row = Number.isInteger(selected.row) ? selected.row : Number(selected.startRow);
          col = Number.isInteger(selected.col)
            ? selected.col
            : Number.isInteger(selected.startCol)
              ? selected.startCol
              : Number(selected.startColumn);
        }
      } catch (_error) {}
      return { row, col };
    }

    readActiveRow(options = {}) {
      const { sheet, sheetIndex, dataModel } = this.context();
      const { row: rowIndex, col: activeCol } = this.activeCell(sheet);
      if (!Number.isInteger(rowIndex) || rowIndex < 1) {
        throw new Error('请先选中数据行，不能选择表头');
      }

      const sheetId = this.sheetId(sheet);
      const headers = this.readHeadersCached(sheet, dataModel, sheetId);
      const lastCol = headers.length - 1;

      const cells = [];
      for (let col = 0; col <= lastCol; col += 1) {
        cells.push(this.inspectCell(
          sheet,
          dataModel,
          rowIndex,
          col,
          headers[col] || ''
        ));
      }
      const values = cells.map(({ value }) => value);
      while (values.length && !values.at(-1) && !headers[values.length - 1]) {
        values.pop();
        cells.pop();
      }
      if (!headers.some(Boolean)) {
        throw new Error('表头读取为空，请确认第 1 行是表头并等待表格加载完成');
      }

      const cached = this.getCache(sheetId, sheet, dataModel);
      const sheetName = cached.sheetName || this.sheetName(sheet);
      const workbookName = String(this.pageWindow.document.title || '飞书表格')
        .replace(/\s*[-–—]\s*飞书.*$/i, '')
        .trim();
      const activeValue = col => {
        if (col >= 0 && col < values.length) return values[col] || '';
        return this.getValue(sheet, dataModel, rowIndex, col) || '';
      };
      return {
        ok: true,
        sheetId,
        sheetIndex,
        sheetNumber: sheetIndex + 1,
        sheetName,
        workbookName,
        rowIndex,
        rowNumber: rowIndex + 1,
        activeCol,
        activeValue: activeValue(activeCol),
        headers: headers.slice(),
        columns: buildColumnDescriptors(headers),
        values,
        cells
      };
    }

    readSheetRowByKey(payload = {}) {
      const {
        sheet,
        sheetIndex,
        dataModel
      } = this.targetContext(payload);
      const sheetId = this.sheetId(sheet);
      const headers = this.readHeadersCached(sheet, dataModel, sheetId);
      const keyHeader = String(payload.keyHeader || '').trim();
      const keyValue = normalizedJoinKey(payload.keyValue);
      const keyCol = headers.findIndex((header) => header === keyHeader);
      if (keyCol < 0) throw new Error(`目标 Sheet 未找到主键列：${keyHeader}`);
      if (!keyValue) throw new Error('跨表读取缺少主键值');

      let rowCount = Number(sheet.getRowCount?.());
      if (!Number.isFinite(rowCount) || rowCount <= 1) {
        rowCount = Number(dataModel.getRowCount?.());
      }
      if (!Number.isFinite(rowCount) || rowCount <= 1) {
        try {
          const used = sheet.getUsedRange?.();
          const start = Number(used?.row) || 0;
          const count = Number(used?.rowCount) || 0;
          if (count > 0) rowCount = start + count;
        } catch (_error) {}
      }
      const rowCountKnown = Number.isFinite(rowCount) && rowCount > 1;
      rowCount = Number.isFinite(rowCount) && rowCount > 1
        ? Math.min(MAX_SCAN_ROWS, Math.round(rowCount))
        : MAX_SCAN_ROWS;

      let rowIndex = -1;
      let emptyRun = 0;
      let stoppedOnUnknownRange = false;
      for (let row = 1; row < rowCount; row += 1) {
        const candidate = normalizedJoinKey(
          this.readDataCellFast(sheet, dataModel, row, keyCol)
        );
        if (!candidate) {
          emptyRun += 1;
          if (!rowCountKnown && emptyRun >= 2000) {
            stoppedOnUnknownRange = true;
            break;
          }
          continue;
        }
        emptyRun = 0;
        if (candidate === keyValue) {
          if (rowIndex >= 0) {
            throw new Error(`目标 Sheet 主键重复：${keyHeader}=${keyValue}`);
          }
          rowIndex = row;
        }
      }
      if (rowIndex < 0) {
        if (stoppedOnUnknownRange) {
          throw new Error(
            `目标 Sheet 行数暂不可用；已扫描到连续 ${emptyRun} 个空行，`
            + '请先在目标区域滚动或等待表格加载完成后重试'
          );
        }
        throw new Error(`目标 Sheet 未找到 ${keyHeader}=${keyValue}`);
      }
      if (stoppedOnUnknownRange || rowCount >= MAX_SCAN_ROWS) {
        throw new Error(
          `已找到 ${keyHeader}=${keyValue}，但目标 Sheet 的剩余范围未完整扫描，`
          + '无法排除重复主键；请等待表格加载完成后重试'
        );
      }

      const cells = headers.map((header, col) => (
        this.inspectCell(sheet, dataModel, rowIndex, col, header)
      ));
      const values = cells.map(({ value }) => value);
      return {
        ok: true,
        sheetId,
        sheetIndex,
        sheetNumber: sheetIndex + 1,
        sheetName: this.sheetName(sheet),
        workbookName: String(this.pageWindow.document.title || '飞书表格')
          .replace(/\s*[-–—]\s*飞书.*$/i, '')
          .trim(),
        rowIndex,
        rowNumber: rowIndex + 1,
        activeCol: -1,
        activeValue: '',
        headers: headers.slice(),
        columns: buildColumnDescriptors(headers),
        values,
        cells,
        keyHeader,
        keyValue
      };
    }

    readQuestionNavigation(payload = {}) {
      const {
        sheet,
        sheetIndex,
        dataModel
      } = this.targetContext(payload);
      const sheetId = this.sheetId(sheet);
      const headers = this.readHeadersCached(sheet, dataModel, sheetId);
      const keyHeader = String(payload.keyHeader || '').trim();
      const keyCol = headers.findIndex((header) => header === keyHeader);
      if (keyCol < 0) throw new Error(`目标 Sheet 未找到题号列：${keyHeader}`);

      let rowCount = Number(sheet.getRowCount?.());
      if (!Number.isFinite(rowCount) || rowCount <= 1) {
        rowCount = Number(dataModel.getRowCount?.());
      }
      if (!Number.isFinite(rowCount) || rowCount <= 1) {
        try {
          const used = sheet.getUsedRange?.();
          const start = Number(used?.row) || 0;
          const count = Number(used?.rowCount) || 0;
          if (count > 0) rowCount = start + count;
        } catch (_error) {}
      }
      const rowCountKnown = Number.isFinite(rowCount) && rowCount > 1;
      rowCount = rowCountKnown
        ? Math.min(MAX_SCAN_ROWS, Math.round(rowCount))
        : MAX_SCAN_ROWS;

      const filterColumns = Array.isArray(payload.filterColumns) ? payload.filterColumns : [];
      for (const source of filterColumns) {
        if (!Number.isInteger(source.index) || source.index < 0 || headers[source.index] !== source.header) throw new Error('筛选列已变化，请重新配置映射');
      }
      const entries = [];
      let emptyRun = 0;
      let stoppedOnUnknownRange = false;
      for (let row = 1; row < rowCount; row += 1) {
        const value = normalizedJoinKey(
          this.readDataCellFast(sheet, dataModel, row, keyCol)
        );
        if (!value) {
          emptyRun += 1;
          if (!rowCountKnown && emptyRun >= 2000) {
            stoppedOnUnknownRange = true;
            break;
          }
          continue;
        }
        emptyRun = 0;
        const filterValues = {};
        for (const source of filterColumns) filterValues[source.index] = this.readDataCellFast(sheet, dataModel, row, source.index);
        entries.push({ rowIndex: row, keyValue: value, filterValues });
      }
      if (stoppedOnUnknownRange || rowCount >= MAX_SCAN_ROWS) {
        throw new Error(
          `目标 Sheet 行数暂不可用；已扫描到连续 ${emptyRun} 个空行，`
          + '请先在目标区域滚动或等待表格加载完成后重试'
        );
      }

      const requestedRow = Number(payload.rowIndex);
      const activeRow = Number.isInteger(requestedRow)
        ? requestedRow
        : this.activeCell(sheet).row;
      let currentIndex = entries.findIndex(({ rowIndex }) => (
        rowIndex === activeRow
      ));
      if (currentIndex < 0 && entries.length) {
        const nextIndex = entries.findIndex(({ rowIndex }) => rowIndex > activeRow);
        currentIndex = nextIndex >= 0 ? nextIndex : entries.length - 1;
      }
      const current = currentIndex >= 0 ? entries[currentIndex] : null;
      const previous = currentIndex > 0 ? entries[currentIndex - 1] : null;
      const next = currentIndex >= 0 && currentIndex < entries.length - 1
        ? entries[currentIndex + 1]
        : null;
      return {
        ok: true,
        sheetId,
        sheetIndex,
        keyHeader,
        count: entries.length,
        position: currentIndex >= 0 ? currentIndex + 1 : 0,
        items: entries,
        current,
        previous,
        next
      };
    }

    getActivePosition() {
      const { sheet, sheetIndex } = this.context();
      const { row, col } = this.activeCell(sheet);
      let sheetId;
      try {
        sheetId = this.sheetId(sheet);
      } catch (_error) {
        sheetId = '';
      }
      return {
        ok: true,
        sheetId,
        sheetIndex,
        rowIndex: row,
        rowNumber: Number.isInteger(row) ? row + 1 : null,
        colIndex: col
      };
    }

    selectRow(payload) {
      const { sheet, sheetIndex } = this.context();
      const current = this.activeCell(sheet);
      const requested = Number(payload?.row);
      const row = Number.isInteger(requested)
        ? requested
        : Math.max(1, Number(current.row || 1) + Number(payload?.delta || 0));
      const col = Math.max(0, Number(current.col) || 0);
      if (!Number.isInteger(row) || row < 1) {
        throw new Error('不能切换到表头之前');
      }
      if (typeof sheet.setActiveCell === 'function') {
        sheet.setActiveCell(row, col);
      } else {
        sheet._activeRowIndex = row;
        sheet._activeColIndex = col;
      }
      try {
        if (typeof sheet.showCell === 'function') sheet.showCell(row, col);
      } catch (_error) {}
      return {
        ok: true,
        sheetId: this.sheetId(sheet),
        sheetIndex,
        rowIndex: row,
        rowNumber: row + 1,
        colIndex: col
      };
    }

    async openNativeVideo(payload = {}) {
      const {
        spread,
        sheet,
        sheetIndex
      } = this.targetContext(payload);
      if (sheetIndex !== Number(this.pageWindow.spread?._activeSheetIndex)) {
        throw new Error('只能在当前 Sheet 打开原生视频播放器');
      }
      const row = Number(payload.row);
      const col = Number(payload.col);
      if (!Number.isInteger(row) || !Number.isInteger(col) || row < 1 || col < 0) {
        throw new Error('视频单元格坐标无效');
      }

      if (typeof sheet.setActiveCell === 'function') {
        sheet.setActiveCell(row, col);
      } else {
        sheet._activeRowIndex = row;
        sheet._activeColIndex = col;
      }
      try {
        sheet.showCell?.(row, col);
      } catch (_error) {}

      const document = this.pageWindow.document;
      if (!document?.querySelectorAll) {
        return {
          ok: true, opened: false, selected: true,
          sheetId: this.sheetId(sheet), sheetIndex, row, col
        };
      }

      const win = this.pageWindow;
      const wait = (ms) => new Promise((resolve) => {
        (win.setTimeout || setTimeout)(resolve, ms);
      });
      const visibleVideos = () => [...document.querySelectorAll('video')]
        .filter((video) => {
          const rect = video.getBoundingClientRect?.();
          return rect && rect.width > 80 && rect.height > 45;
        });
      const existingVideos = new Map(
        visibleVideos().map((video) => [
          video,
          String(video.currentSrc || video.src || '')
        ])
      );
      const comparableUrl = (value) => {
        const source = String(value || '');
        if (!source) return { raw: '', path: '' };
        try {
          const url = new URL(source, win.location.href);
          return {
            raw: url.href,
            path: `${url.origin}${url.pathname}`
          };
        } catch (_error) {
          return { raw: source, path: source.split(/[?#]/, 1)[0] };
        }
      };
      const expectedUrl = comparableUrl(payload.url);
      const expectedToken = String(payload.fileToken || '').trim();
      const matchesTarget = (video) => {
        const source = comparableUrl(video.currentSrc || video.src || '');
        return Boolean(
          (
            expectedUrl.raw
            && (
              source.raw === expectedUrl.raw
              || source.path === expectedUrl.path
            )
          )
          || (expectedToken && source.raw.includes(expectedToken))
        );
      };
      const waitForPlayer = async (attempts = 40) => {
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          await wait(120);
          const openedVideos = visibleVideos().filter((video) => (
            !existingVideos.has(video)
            || existingVideos.get(video)
              !== String(video.currentSrc || video.src || '')
          ));
          const opened = openedVideos.find(matchesTarget) || (
            openedVideos.length === 1 ? openedVideos[0] : null
          );
          if (opened) return true;
        }
        return false;
      };

      const getCellRectInViewport = () => {
        let host = null;
        try { host = spread.getHost?.() || spread._host || sheet.getHost?.(); } catch (_e) {}
        let cellRect = null;
        try { cellRect = sheet.getCellRect?.(row, col); } catch (_e) {}
        if (!cellRect || !host?.getBoundingClientRect) return null;
        const hostRect = host.getBoundingClientRect();
        return {
          host,
          left: hostRect.left + Number(cellRect.x || 0),
          top: hostRect.top + Number(cellRect.y || 0),
          width: Number(cellRect.width || 0),
          height: Number(cellRect.height || 0)
        };
      };

      const findCanvas = () => {
        let host = null;
        try { host = spread.getHost?.() || spread._host || sheet.getHost?.(); } catch (_e) {}
        if (!host) return null;
        if (host.tagName === 'CANVAS') return host;
        return host.querySelector?.('canvas') || host;
      };

      const focusSpread = () => {
        const target = findCanvas();
        if (!target) return;
        try {
          target.focus?.();
        } catch (_e) {}
        try {
          const parent = target.closest?.('[tabindex], .spreadsheet, [class*="sheet" i], [class*="spread" i]');
          parent?.focus?.();
        } catch (_e) {}
        try { win.focus?.(); } catch (_e) {}
      };

      const makeEventInit = (target, clientX, clientY, extra = {}) => {
        const rect = target.getBoundingClientRect?.() || { left: 0, top: 0 };
        const offsetX = clientX - rect.left;
        const offsetY = clientY - rect.top;
        return {
          bubbles: true, cancelable: true, view: win,
          clientX, clientY, offsetX, offsetY,
          layerX: offsetX, layerY: offsetY,
          pageX: clientX, pageY: clientY,
          screenX: clientX, screenY: clientY,
          x: clientX, y: clientY,
          movementX: 0, movementY: 0,
          button: 0, buttons: 0, detail: 1,
          pointerId: 1, pointerType: 'mouse', isPrimary: true,
          pressure: 0, tangentialPressure: 0,
          tiltX: 0, tiltY: 0, twist: 0,
          ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
          relatedTarget: null,
          ...extra
        };
      };

      const fire = (target, type, Ctor, init) => {
        try { target.dispatchEvent(new Ctor(type, init)); } catch (_e) {}
      };

      const dispatchKey = (target, key, code, extra = {}) => {
        const K = win.KeyboardEvent;
        if (!K || !target?.dispatchEvent) return;
        const init = {
          bubbles: true, cancelable: true, view: win,
          key, code, keyCode: extra.keyCode || 0, which: extra.keyCode || 0,
          ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
          ...extra
        };
        fire(target, 'keydown', K, init);
        fire(target, 'keypress', K, init);
        if (key === 'Enter' || key === ' ') {
          fire(target, 'keyup', K, { ...init });
          return;
        }
        fire(target, 'keyup', K, { ...init });
      };

      const getCanvasPoint = (cx, cy) => {
        const canvas = findCanvas();
        if (!canvas) return null;
        const canvasRect = canvas.getBoundingClientRect();
        return {
          target: canvas,
          localX: cx - canvasRect.left,
          localY: cy - canvasRect.top,
          clientX: cx,
          clientY: cy
        };
      };

      const hoverAt = async (cx, cy) => {
        const canvas = findCanvas();
        const pt = getCanvasPoint(cx, cy);
        if (!canvas || !pt) return;
        const M = win.MouseEvent, P = win.PointerEvent || M;
        const init = makeEventInit(canvas, cx, cy);
        fire(canvas, 'pointerover', P, { ...init, buttons: 0 });
        fire(canvas, 'mouseover', M, init);
        fire(canvas, 'pointerenter', P, { ...init, buttons: 0 });
        fire(canvas, 'mouseenter', M, init);
        fire(canvas, 'pointermove', P, { ...init, buttons: 0 });
        fire(canvas, 'mousemove', M, init);
        const over = elementAt(cx, cy);
        if (over && over !== canvas) {
          fire(over, 'pointerover', P, { ...makeEventInit(over, cx, cy), buttons: 0 });
          fire(over, 'mouseover', M, makeEventInit(over, cx, cy));
          fire(over, 'pointermove', P, { ...makeEventInit(over, cx, cy), buttons: 0 });
          fire(over, 'mousemove', M, makeEventInit(over, cx, cy));
        }
      };

      const pressAt = (cx, cy, detail = 1) => {
        const canvas = findCanvas();
        const pt = getCanvasPoint(cx, cy);
        if (!canvas || !pt) return;
        const M = win.MouseEvent, P = win.PointerEvent || M;
        const downInit = makeEventInit(canvas, cx, cy, { buttons: 1, detail });
        const upInit = makeEventInit(canvas, cx, cy, { buttons: 0, detail });
        fire(canvas, 'pointerdown', P, downInit);
        fire(canvas, 'mousedown', M, downInit);
        fire(canvas, 'pointerup', P, { ...upInit, detail });
        fire(canvas, 'mouseup', M, { ...upInit, detail });
        fire(canvas, 'click', M, { ...upInit, detail });
        const over = elementAt(cx, cy);
        if (over && over !== canvas) {
          const oi = makeEventInit(over, cx, cy);
          fire(over, 'pointerdown', P, { ...oi, buttons: 1, detail });
          fire(over, 'mousedown', M, { ...oi, buttons: 1, detail });
          fire(over, 'pointerup', P, { ...oi, buttons: 0, detail });
          fire(over, 'mouseup', M, { ...oi, buttons: 0, detail });
          fire(over, 'click', M, { ...oi, buttons: 0, detail });
          try { over.click?.(); } catch (_e) {}
        }
      };

      const singleClickAt = async (cx, cy) => {
        await hoverAt(cx, cy);
        pressAt(cx, cy, 1);
        return true;
      };

      const doubleClickAt = async (cx, cy) => {
        await hoverAt(cx, cy);
        pressAt(cx, cy, 1);
        await wait(80);
        pressAt(cx, cy, 2);
        const canvas = findCanvas();
        if (canvas) {
          const M = win.MouseEvent;
          fire(canvas, 'dblclick', M, makeEventInit(canvas, cx, cy, { buttons: 0, detail: 2 }));
        }
        const over = elementAt(cx, cy);
        if (over && over !== canvas) {
          const M = win.MouseEvent;
          fire(over, 'dblclick', M, makeEventInit(over, cx, cy, { buttons: 0, detail: 2 }));
        }
        return true;
      };

      const elementAt = (cx, cy) => {
        try { return document.elementFromPoint(cx, cy); } catch (_e) { return null; }
      };

      const tryClick = async (cx, cy, dbl) => {
        focusSpread();
        if (dbl) await doubleClickAt(cx, cy);
        else await singleClickAt(cx, cy);
        return waitForPlayer(dbl ? 8 : 5);
      };

      const findOverlayAttachment = () => {
        const selectors = [
          '[class*="attachment-preview" i]',
          '[class*="attachment-popover" i]',
          '[class*="cell-overlay" i]',
          '[class*="cell-hover" i]',
          '[class*="media-icon" i]',
          '[class*="file-icon" i]',
          '[class*="play-icon" i]',
          '[class*="attachment-item" i] button',
          '[class*="attachment-item" i] [role="button"]',
          '[class*="thumbnail" i]',
          '[data-testid*="attachment" i]',
          '[data-testid*="media" i]',
          '[data-type="attachment"]',
          '[data-type="video"]',
          '[data-kind="video"]',
          'button[class*="play" i]',
          '[class*="preview-trigger" i]',
          '[class*="float" i][class*="attach" i]',
        ];
        const cell = getCellRectInViewport();
        if (!cell) return null;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          for (const el of els) {
            try {
              const r = el.getBoundingClientRect();
              if (r.width < 4 || r.height < 4) continue;
              if (r.left > cell.left + cell.width + 50) continue;
              if (r.right < cell.left - 50) continue;
              if (r.top > cell.top + cell.height + 200) continue;
              if (r.bottom < cell.top - 200) continue;
              return el;
            } catch (_e) {}
          }
        }
        return null;
      };

      await wait(300);
      focusSpread();

      const cellInfo = getCellRectInViewport();
      const overlay = findOverlayAttachment();
      if (overlay) {
        try {
          const r = overlay.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          overlay.click?.();
          if (await waitForPlayer(5)) {
            return { ok: true, opened: true, selected: true, sheetId: this.sheetId(sheet), sheetIndex, row, col };
          }
          await hoverAt(cx, cy);
          pressAt(cx, cy, 1);
          if (await waitForPlayer(5)) {
            return { ok: true, opened: true, selected: true, sheetId: this.sheetId(sheet), sheetIndex, row, col };
          }
        } catch (_e) {}
      }

      if (cellInfo) {
        const { left, top, width, height } = cellInfo;
        const points = [
          { x: left + Math.min(18, width * 0.12), y: top + height / 2 },
          { x: left + width / 2, y: top + height / 2 },
          { x: left + width * 0.25, y: top + height / 2 },
          { x: left + 6, y: top + 6 },
          { x: left + Math.min(width - 4, 8), y: top + height - 4 },
        ];

        for (const pt of points) {
          if (pt.x < 0 || pt.y < 0) continue;
          if (await tryClick(pt.x, pt.y, false)) {
            return { ok: true, opened: true, selected: true, sheetId: this.sheetId(sheet), sheetIndex, row, col };
          }
          const ov = findOverlayAttachment();
          if (ov) {
            const r = ov.getBoundingClientRect();
            ov.click?.();
            if (await waitForPlayer(4)) {
              return { ok: true, opened: true, selected: true, sheetId: this.sheetId(sheet), sheetIndex, row, col };
            }
          }
          await wait(80);
        }

        const keyTargets = [findCanvas(), document.body, document.documentElement];
        for (const target of keyTargets) {
          if (!target) continue;
          dispatchKey(target, 'Enter', 'Enter', { keyCode: 13 });
          if (await waitForPlayer(5)) {
            return { ok: true, opened: true, selected: true, sheetId: this.sheetId(sheet), sheetIndex, row, col };
          }
          await wait(50);
        }

        for (const target of keyTargets) {
          if (!target) continue;
          dispatchKey(target, 'F2', 'F2', { keyCode: 113 });
          await wait(100);
        }
        await wait(200);

        for (const pt of points) {
          if (pt.x < 0 || pt.y < 0) continue;
          if (await tryClick(pt.x, pt.y, true)) {
            return { ok: true, opened: true, selected: true, sheetId: this.sheetId(sheet), sheetIndex, row, col };
          }
          await wait(80);
        }

        for (const target of keyTargets) {
          if (!target) continue;
          dispatchKey(target, ' ', 'Space', { keyCode: 32 });
          if (await waitForPlayer(4)) {
            return { ok: true, opened: true, selected: true, sheetId: this.sheetId(sheet), sheetIndex, row, col };
          }
        }
      }

      if (await waitForPlayer()) {
        return { ok: true, opened: true, selected: true, sheetId: this.sheetId(sheet), sheetIndex, row, col };
      }
      throw new Error('已定位视频单元格，但飞书未打开原生播放器；请双击该单元格后重试');
    }

    async resolveAttachmentUrl(payload) {
      const fileToken = String(payload?.fileToken || '').trim();
      if (!fileToken || fileToken.length > 512 || /[\s"'<>`]/.test(fileToken)) {
        throw new Error('附件 fileToken 无效');
      }
      if (typeof this.pageWindow.fetch !== 'function') {
        throw new Error('当前飞书页面不支持附件地址解析');
      }

      const requestUrl = `${this.pageWindow.location.origin}/space/api/box/stream/download/all/${encodeURIComponent(fileToken)}/`;
      const response = await this.pageWindow.fetch(requestUrl, {
        method: 'GET',
        credentials: 'include',
        redirect: 'follow'
      });

      const finalUrl = String(response.url || '');
      const contentType = response.headers?.get?.('content-type') || '';
      const contentRange = response.headers?.get?.('content-range') || '';
      const acceptRanges = response.headers?.get?.('accept-ranges') || '';
      try { response.body?.cancel?.(); } catch (_e) {}

      if (!response.ok) {
        throw new Error(`附件请求失败（HTTP ${response.status}）`);
      }
      if (!/^https?:\/\//i.test(finalUrl)) {
        throw new Error('飞书未返回可播放的附件地址');
      }
      const isMediaContent = /video|audio|application\/octet-stream|binary/i.test(contentType)
        || /bytes/i.test(acceptRanges);
      if (/text\/html|application\/json/i.test(contentType) && !isMediaContent) {
        throw new Error(`附件接口返回了不可播放的内容（${contentType}）`);
      }
      return {
        ok: true,
        url: finalUrl,
        requestUrl,
        redirected: Boolean(response.redirected || finalUrl !== requestUrl),
        status: response.status,
        contentType,
        contentRange,
        acceptRanges,
        streamable: isMediaContent || finalUrl !== requestUrl
      };
    }

    async writeCell(payload) {
      if (payload?.expectedTableKey) {
        const expectedPath = String(payload.expectedTableKey).split('::')[0];
        if (new URL(this.pageWindow.location.href).pathname !== expectedPath) {
          throw new Error('当前文档已切换，请重新读取目标表格后再回写');
        }
      }
      const requestedSheetId = String(payload?.sheetId || '').trim();
      const requestedSheetIndex = Number(payload?.sheetIndex);
      const activeSheetIndex = Number(this.pageWindow.spread?._activeSheetIndex);
      if (
        !requestedSheetId
        && Number.isInteger(requestedSheetIndex)
        && requestedSheetIndex !== activeSheetIndex
      ) {
        throw new Error('跨 Sheet 写入缺少稳定 sheetId，已阻止写入');
      }
      const {
        spread,
        sheet,
        sheetIndex,
        dataModel
      } = this.targetContext(payload);
      const row = Number(payload?.row);
      const col = Number(payload?.col);
      const value = String(payload?.value ?? '');
      if (!Number.isInteger(row) || !Number.isInteger(col) || row < 1 || col < 0) {
        throw new Error('写入坐标无效');
      }
      if (
        !Object.prototype.hasOwnProperty.call(payload || {}, 'expectedHeader')
        || !Object.prototype.hasOwnProperty.call(payload || {}, 'expectedValue')
      ) {
        throw new Error('写回缺少原值或表头校验，已阻止不安全写入');
      }
      const actualHeader = this.readHeaderCell(sheet, dataModel, col);
      if (actualHeader !== String(payload.expectedHeader ?? '')) {
        throw new Error('目标列的表头已变化，请重新读取当前行');
      }

      const currentFormula = this.readFormula(sheet, dataModel, row, col);
      if (currentFormula) {
        throw new Error('目标单元格包含公式，已阻止覆盖公式');
      }
      const beforeCell = this.inspectCell(sheet, dataModel, row, col);
      const before = payload.valueType === 'date'
        ? beforeCell.rawValue
        : beforeCell.value;
      const dependencies = payload.expectedDependencies ?? [];
      if (!Array.isArray(dependencies)) throw new Error('评审依据校验参数无效');
      for (const dependency of dependencies) {
        if (!Number.isInteger(dependency?.index) || dependency.index < 0
          || typeof dependency.header !== 'string' || typeof dependency.baseline !== 'string') {
          throw new Error('评审依据校验参数无效');
        }
        const header = this.readHeaderCell(sheet, dataModel, dependency.index);
        const source = this.inspectCell(sheet, dataModel, row, dependency.index);
        if (header !== dependency.header || !writeValuesEquivalent(source.value, dependency.baseline)) {
          throw new Error(`评审依据「${dependency.header}」已变化，请核对后再提交此列`);
        }
      }
      if (writeValuesEquivalent(before, value)) {
        return {
          ok: true,
          committed: false,
          verified: true,
          unchanged: true,
          sheetId: this.sheetId(sheet),
          sheetIndex,
          row,
          col,
          previousValue: before,
          actualValue: before
        };
      }
      if (!writeValuesEquivalent(before, payload.expectedValue)) {
        throw new Error('目标单元格已被其他操作修改，请重新读取当前行');
      }

      if (payload.dropdownSelection === true) {
        const rule = this.readDropdownRule(sheet, dataModel, row, col);
        if (!rule || rule.multiple) {
          throw new Error('下拉规则已变化或不是单选，请重新读取当前行');
        }
        if (!rule.options.includes(value) && !(value === '' && rule.allowBlank)) {
          throw new Error('所选内容已不在飞书下拉列表中，请重新读取当前行');
        }
      }

      let commandManager = null;
      try {
        commandManager = typeof spread.commandManager === 'function'
          ? spread.commandManager()
          : spread.commandManager;
      } catch (_error) {}
      if (!commandManager?.execute) {
        throw new Error('飞书原生写入命令尚未就绪');
      }

      const sid = this.sheetId(sheet);
      const sname = this.sheetName(sheet);
      const preserveText = !['number', 'boolean', 'date'].includes(
        payload.valueType
      );
      const command = {
        cmd: 'editCell',
        sheetId: sid,
        sheetName: sname,
        row,
        col,
        newValue: value || null,
        autoFormat: !preserveText,
        dontParseNumber: preserveText
      };
      if (!value) command.newSegmentArray = [];
      let commandResult;
      try {
        commandResult = commandManager.execute(command);
        if (commandResult && typeof commandResult.then === 'function') {
          commandResult = await commandResult;
        }
      } catch (error) {
        throw new Error(`飞书单元格写入失败：${error.message || '未知错误'}`);
      }
      if (commandResult === false) {
        throw new Error('飞书拒绝了单元格写入命令');
      }

      const wait = (ms) => new Promise((resolve) => {
        (this.pageWindow.setTimeout || setTimeout)(resolve, ms);
      });
      const deadline = Date.now() + 5000;
      const comparableValue = () => {
        const cell = this.inspectCell(sheet, dataModel, row, col);
        return payload.valueType === 'date' ? cell.rawValue : cell.value;
      };
      let actualValue = comparableValue();
      while (!writeValuesEquivalent(actualValue, value) && Date.now() < deadline) {
        await wait(80);
        actualValue = comparableValue();
      }
      if (!writeValuesEquivalent(actualValue, value)) {
        return {
          ok: false,
          committed: true,
          verified: false,
          error: '飞书已经修改单元格，但回读结果与目标值不一致；请立即检查该单元格',
          sheetId: sid,
          sheetIndex,
          row,
          col,
          previousValue: before,
          actualValue
        };
      }
      return {
        ok: true,
        committed: true,
        verified: true,
        sheetId: sid,
        sheetIndex,
        row,
        col,
        previousValue: before,
        actualValue
      };
    }

    bindSelectionChanged(callback) {
      const eventName = this.pageWindow.GC?.Spread?.Sheets?.Events?.SelectionChanged;
      if (!eventName) return;
      const sheets = this.pageWindow.spread?.sheets || [];
      sheets.forEach((sheet) => {
        if (!sheet?.bind || this.boundSheets.has(sheet)) return;
        sheet.bind(eventName, callback);
        this.boundSheets.add(sheet);
      });
    }
  }

  window[ADAPTER_KEY] = new FeishuSheetPageAdapter();
  window.__gtMapperFeishuSheetAdapterV4 = window[ADAPTER_KEY];
  window.__gtMapperFeishuSheetAdapterClassV4 = FeishuSheetPageAdapter;
  window.__gtMapperFeishuSheetAdapterClassV3 = FeishuSheetPageAdapter;
  window.__gtMapperFeishuSheetAdapterClassV2 = FeishuSheetPageAdapter;
})();
