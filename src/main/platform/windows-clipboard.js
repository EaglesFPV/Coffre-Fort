'use strict';

const CF_UNICODETEXT = 13;
const GMEM_MOVEABLE = 0x0002;
const OPEN_RETRIES = 20;
const OPEN_RETRY_MS = 25;
const EXCLUSION_FORMATS = Object.freeze([
  'ExcludeClipboardContentFromMonitorProcessing',
  'CanIncludeInClipboardHistory',
  'CanUploadToCloudClipboard',
]);

let win32 = null;

function bindings() {
  if (win32) return win32;
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  win32 = {
    OpenClipboard: user32.func('int __stdcall OpenClipboard(intptr hwnd)'),
    CloseClipboard: user32.func('int __stdcall CloseClipboard()'),
    EmptyClipboard: user32.func('int __stdcall EmptyClipboard()'),
    SetClipboardData: user32.func('intptr __stdcall SetClipboardData(uint32 format, intptr handle)'),
    RegisterClipboardFormatW: user32.func('uint32 __stdcall RegisterClipboardFormatW(str16 name)'),
    GetClipboardSequenceNumber: user32.func('uint32 __stdcall GetClipboardSequenceNumber()'),
    GlobalAlloc: kernel32.func('intptr __stdcall GlobalAlloc(uint32 flags, size_t bytes)'),
    GlobalLock: kernel32.func('intptr __stdcall GlobalLock(intptr handle)'),
    GlobalUnlock: kernel32.func('int __stdcall GlobalUnlock(intptr handle)'),
    GlobalFree: kernel32.func('intptr __stdcall GlobalFree(intptr handle)'),
    RtlMoveMemory: kernel32.func('void __stdcall RtlMoveMemory(intptr dest, const uint8_t *src, size_t length)'),
  };
  return win32;
}

function busyWait(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until);
}

function withClipboard(hwnd, action) {
  const api = bindings();
  let opened = false;
  for (let attempt = 0; attempt < OPEN_RETRIES && !opened; attempt++) {
    opened = Boolean(api.OpenClipboard(hwnd));
    if (!opened) busyWait(OPEN_RETRY_MS);
  }
  if (!opened) throw new Error('le presse-papiers est occupé par un autre programme');
  try {
    return action(api);
  } finally {
    api.CloseClipboard();
  }
}

function setData(api, format, bytes) {
  const handle = api.GlobalAlloc(GMEM_MOVEABLE, bytes.length);
  if (!handle) throw new Error('mémoire insuffisante');
  const pointer = api.GlobalLock(handle);
  if (!pointer) {
    api.GlobalFree(handle);
    throw new Error('mémoire insuffisante');
  }
  try {
    api.RtlMoveMemory(pointer, bytes, bytes.length);
  } finally {
    api.GlobalUnlock(handle);
  }
  if (!api.SetClipboardData(format, handle)) {
    api.GlobalFree(handle);
    throw new Error('écriture dans le presse-papiers refusée');
  }
}

function writeSecret(hwnd, text) {
  const payload = Buffer.from(`${text}\0`, 'utf16le');
  try {
    withClipboard(hwnd, (api) => {
      if (!api.EmptyClipboard()) throw new Error('impossible de vider le presse-papiers');
      try {
        for (const name of EXCLUSION_FORMATS) setData(api, api.RegisterClipboardFormatW(name), Buffer.alloc(4));
        setData(api, CF_UNICODETEXT, payload);
      } catch (error) {
        api.EmptyClipboard();
        throw error;
      }
    });
  } finally {
    payload.fill(0);
  }
  return bindings().GetClipboardSequenceNumber();
}

function clearIfUnchanged(hwnd, sequence) {
  if (bindings().GetClipboardSequenceNumber() !== sequence) return false;
  withClipboard(hwnd, (api) => api.EmptyClipboard());
  return true;
}

module.exports = { writeSecret, clearIfUnchanged };
