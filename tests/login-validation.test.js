import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { describe, it } from 'node:test';
import { expect } from 'chai';

const loginHtml = await readFile(new URL('../public/login.html', import.meta.url), 'utf8');
const inlineScript = loginHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];

function createLoginPage() {
  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        attributes: {},
        listeners: {},
        value: '',
        innerText: '',
        addEventListener(event, listener) {
          this.listeners[event] = listener;
        },
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        removeAttribute(name) {
          delete this.attributes[name];
        },
        querySelector() {
          return getElement('register-submit');
        },
        focus() {
          this.focused = true;
        }
      });
    }
    return elements.get(id);
  };
  let fetchCalled = false;
  const document = { getElementById: getElement };
  const window = { location: { search: '', href: '' } };

  vm.runInNewContext(inlineScript, {
    document,
    window,
    URLSearchParams,
    fetch: async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({ success: true }) };
    }
  });

  return {
    getElement,
    getFetchCalled: () => fetchCalled
  };
}

describe('Login and registration field validation', () => {
  it('shows red field errors for missing or invalid sign-in credentials without submitting', async () => {
    const page = createLoginPage();
    const email = page.getElement('email');
    const password = page.getElement('password');
    const submit = page.getElement('login-form').listeners.submit;

    await submit({ preventDefault() {} });
    expect(page.getElement('email-error').innerText).to.equal('Please enter your email.');
    expect(page.getElement('password-error').innerText).to.equal('Please enter your password.');
    expect(email.attributes['aria-invalid']).to.equal('true');
    expect(page.getFetchCalled()).to.equal(false);

    email.value = 'not-an-email';
    password.value = 'some-password';
    await submit({ preventDefault() {} });
    expect(page.getElement('email-error').innerText).to.equal('Please enter a valid email address.');
    expect(page.getFetchCalled()).to.equal(false);
  });

  it('validates required registration fields and accepts a one-character password', async () => {
    const page = createLoginPage();
    const email = page.getElement('register-email');
    const password = page.getElement('register-password');
    const submit = page.getElement('register-form').listeners.submit;

    await submit({ preventDefault() {}, currentTarget: page.getElement('register-form') });
    expect(page.getElement('register-email-error').innerText).to.equal('Please enter your email.');
    expect(page.getElement('register-password-error').innerText).to.equal('Please enter a password.');
    expect(page.getFetchCalled()).to.equal(false);

    email.value = 'student@example.com';
    password.value = '';
    await submit({ preventDefault() {}, currentTarget: page.getElement('register-form') });
    expect(page.getElement('register-password-error').innerText).to.equal('Please enter a password.');
    expect(page.getFetchCalled()).to.equal(false);

    password.value = 'x'.repeat(129);
    await submit({ preventDefault() {}, currentTarget: page.getElement('register-form') });
    expect(page.getElement('register-password-error').innerText)
      .to.equal('Password must be no more than 128 characters.');
    expect(page.getFetchCalled()).to.equal(false);

    password.value = '!';
    await submit({ preventDefault() {}, currentTarget: page.getElement('register-form') });
    expect(page.getFetchCalled()).to.equal(true);
  });
});
