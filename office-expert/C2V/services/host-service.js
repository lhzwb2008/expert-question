(() => {
  'use strict';

  const GLOBAL_KEY = '__cyleHostServiceV1';
  const root = globalThis.__cyleServicesV1 || (
    globalThis.__cyleServicesV1 = {}
  );
  if (globalThis[GLOBAL_KEY]) {
    root.host = globalThis[GLOBAL_KEY];
    return;
  }

  function send(message) {
    const runtime = globalThis.chrome?.runtime;
    if (!runtime?.sendMessage) {
      return Promise.reject(new Error('Cyle Host Runtime 不可用'));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };
      try {
        const possiblePromise = runtime.sendMessage(message, (response) => {
          const error = runtime.lastError;
          if (error) finish(reject, new Error(error.message));
          else finish(resolve, response);
        });
        if (possiblePromise?.then) {
          possiblePromise.then(
            (response) => finish(resolve, response),
            (error) => finish(reject, error)
          );
        }
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  async function request(type, payload = {}) {
    const response = await send({ type, payload });
    if (response?.ok === false) {
      throw new Error(response.error || `${type} 请求失败`);
    }
    return response;
  }

  const service = Object.freeze({
    apiVersion: 1,
    send,
    request,
    readActiveRow: () => request('READ_ACTIVE_ROW'),
    readRowByKey: (payload) => request('READ_SHEET_ROW_BY_KEY', payload),
    questionNavigation: (payload) => request('READ_QUESTION_NAVIGATION', payload),
    selectRow: (payload) => request('SELECT_ROW', payload),
    resolveAttachment: (fileToken) => request('RESOLVE_ATTACHMENT_URL', {
      fileToken
    }),
    detectVideoMetadata: (url) => request('DETECT_VIDEO_FPS', { url }),
    nativeVideoCommand: (type, payload) => request(type, payload)
  });

  root.host = service;
  root.HostService = service;
  globalThis[GLOBAL_KEY] = service;
})();
