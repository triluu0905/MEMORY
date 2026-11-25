/*
 * Prototype-only browser authentication.
 *
 * This keeps accounts and sessions in browser storage so the supplied static
 * HTML prototype can run without a server. Do not use it for production:
 * passwords in browser storage are not secure and must be replaced by a
 * server-side identity provider before real user data is stored.
 */
(function (window) {
  'use strict';

  var ACCOUNTS_KEY = 'memory.lab.auth.accounts.v1';
  var SESSION_KEY = 'memory.lab.auth.session.v1';
  var DEMO_ACCOUNT = {
    name: 'Demo Memory',
    email: 'demo@memory.lab',
    password: 'memory123',
    lab: ''
  };

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function readJSON(storage, key, fallback) {
    try {
      var value = storage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJSON(storage, key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function accounts() {
    var value = readJSON(window.localStorage, ACCOUNTS_KEY, []);
    if (!Array.isArray(value)) value = [];
    if (!value.some(function (account) { return account.email === DEMO_ACCOUNT.email; })) {
      value.push(copy(DEMO_ACCOUNT));
      writeJSON(window.localStorage, ACCOUNTS_KEY, value);
    }
    return value;
  }

  function publicAccount(account) {
    return {
      name: account.name,
      email: account.email,
      lab: account.lab || ''
    };
  }

  function setSession(account, remember) {
    var storage = remember ? window.localStorage : window.sessionStorage;
    window.localStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
    return writeJSON(storage, SESSION_KEY, publicAccount(account));
  }

  function activeSession() {
    var session = readJSON(window.sessionStorage, SESSION_KEY, null) ||
      readJSON(window.localStorage, SESSION_KEY, null);
    return session && session.email ? session : null;
  }

  function replaceAccount(updated) {
    var value = accounts();
    var index = value.findIndex(function (account) { return account.email === updated.email; });
    if (index < 0) return false;
    value[index] = updated;
    return writeJSON(window.localStorage, ACCOUNTS_KEY, value);
  }

  window.MemoryAuth = {
    session: function () {
      var session = activeSession();
      return session ? copy(session) : null;
    },

    register: function (input) {
      input = input || {};
      var name = String(input.name || '').trim();
      var email = normalizeEmail(input.email);
      var password = String(input.pass || '');

      if (!name) return { ok: false, field: 'name', msg: 'Vui lòng nhập họ và tên.' };
      if (!validEmail(email)) return { ok: false, field: 'email', msg: 'Email chưa hợp lệ.' };
      if (password.length < 8) return { ok: false, field: 'password', msg: 'Mật khẩu cần ít nhất 8 ký tự.' };

      var value = accounts();
      if (value.some(function (account) { return account.email === email; })) {
        return { ok: false, field: 'email', msg: 'Email này đã có tài khoản. Hãy đăng nhập.' };
      }

      var account = { name: name, email: email, password: password, lab: '' };
      value.push(account);
      if (!writeJSON(window.localStorage, ACCOUNTS_KEY, value) || !setSession(account, true)) {
        return { ok: false, field: 'email', msg: 'Trình duyệt không thể lưu tài khoản.' };
      }
      return { ok: true, user: publicAccount(account) };
    },

    login: function (emailInput, passwordInput, remember) {
      var email = normalizeEmail(emailInput);
      var password = String(passwordInput || '');
      if (!validEmail(email)) return { ok: false, field: 'id', msg: 'Nhập email hợp lệ để đăng nhập.' };

      var account = accounts().find(function (candidate) { return candidate.email === email; });
      if (!account || account.password !== password) {
        return { ok: false, field: 'password', msg: 'Email hoặc mật khẩu không đúng.' };
      }
      if (!setSession(account, !!remember)) {
        return { ok: false, field: 'id', msg: 'Trình duyệt không thể lưu phiên đăng nhập.' };
      }
      return { ok: true, user: publicAccount(account) };
    },

    update: function (changes) {
      var session = activeSession();
      if (!session) return { ok: false, msg: 'Phiên đăng nhập đã hết hạn.' };

      var value = accounts();
      var account = value.find(function (candidate) { return candidate.email === session.email; });
      if (!account) return { ok: false, msg: 'Không tìm thấy tài khoản.' };

      changes = changes || {};
      if (typeof changes.name === 'string' && changes.name.trim()) account.name = changes.name.trim();
      if (typeof changes.lab === 'string') account.lab = changes.lab.trim();
      if (!replaceAccount(account) || !setSession(account, window.localStorage.getItem(SESSION_KEY) !== null)) {
        return { ok: false, msg: 'Không thể lưu thay đổi tài khoản.' };
      }
      return { ok: true, user: publicAccount(account) };
    },

    logout: function () {
      window.localStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(SESSION_KEY);
    }
  };
}(window));
