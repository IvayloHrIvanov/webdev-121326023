import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { describe, it } from 'node:test';
import { expect } from 'chai';

const themeScript = await readFile(new URL('../public/theme.js', import.meta.url), 'utf8');

function createPage(storage) {
  const button = {
    attributes: {},
    listeners: {},
    addEventListener(event, listener) {
      this.listeners[event] = listener;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };
  const documentListeners = {};
  const document = {
    documentElement: { dataset: {} },
    querySelector() {
      return button;
    },
    addEventListener(event, listener) {
      documentListeners[event] = listener;
    }
  };
  const localStorage = {
    getItem(key) {
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      storage.set(key, value);
    }
  };

  vm.runInNewContext(themeScript, { document, localStorage });

  return {
    button,
    document,
    onDOMContentLoaded: () => documentListeners.DOMContentLoaded(),
    click: () => button.listeners.click()
  };
}

describe('Theme preference persistence', () => {
  it('updates the toggle and restores the saved choice across pages', () => {
    const storage = new Map();
    const loginPage = createPage(storage);
    loginPage.onDOMContentLoaded();

    expect(loginPage.button.attributes['aria-label']).to.equal('Switch to light mode');
    expect(loginPage.button.attributes['aria-pressed']).to.equal('true');

    loginPage.click();
    expect(loginPage.document.documentElement.dataset.theme).to.equal('light');
    expect(loginPage.button.attributes['aria-label']).to.equal('Switch to dark mode');
    expect(storage.get('study-groups-theme')).to.equal('light');

    const sessionsPage = createPage(storage);
    expect(sessionsPage.document.documentElement.dataset.theme).to.equal('light');
    sessionsPage.onDOMContentLoaded();
    expect(sessionsPage.button.attributes['aria-pressed']).to.equal('false');

    sessionsPage.click();
    expect(sessionsPage.document.documentElement.dataset.theme).to.equal('dark');
    expect(sessionsPage.button.attributes['aria-label']).to.equal('Switch to light mode');
    expect(storage.get('study-groups-theme')).to.equal('dark');
  });
});
