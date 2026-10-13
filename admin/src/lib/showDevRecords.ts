/** Owner toggle: synthetic/UAT rows hidden by default in normal business views. */

const KEY = 'okang.showDevRecords';

export function loadShowDevRecords(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function saveShowDevRecords(show: boolean) {
  try {
    localStorage.setItem(KEY, show ? '1' : '0');
  } catch {
    /* ignore */
  }
}
