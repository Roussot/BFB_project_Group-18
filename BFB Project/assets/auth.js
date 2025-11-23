// assets/auth.js - backend-backed auth helper
// Exposes AUTH, renderAuthNav, requireRole
// Depends on UsersAPI from assets/api.js

var AUTH = (function () {
  // We no longer use localStorage as a user DB, only to remember who is logged in
  var keys = {
    current: 'currentUserId'
  };

  // In-memory cache of users loaded from the backend
  var usersCache = [];

  // ---- Internal helpers ----

  function _loadUsers() {
    // Just return the cache; it is populated asynchronously on load
    return Array.isArray(usersCache) ? usersCache : [];
  }

  function _setUsers(list) {
    usersCache = Array.isArray(list) ? list : [];
  }

  // Preload users from backend as soon as this file runs
  (function preloadUsersFromAPI() {
    if (typeof UsersAPI === 'undefined' || !UsersAPI.getAll) {
      console.error('AUTH: UsersAPI is not available. Make sure api.js is loaded before auth.js');
      return;
    }

    UsersAPI.getAll()
      .then(function (users) {
        _setUsers(users || []);
      })
      .catch(function (err) {
        console.error('AUTH: Failed to preload users from API', err);
      });
  })();

  function currentUser() {
    var id = localStorage.getItem(keys.current);
    if (!id) return null;

    var list = _loadUsers();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(id)) {
        return list[i];
      }
    }
    return null;
  }

  function currentRole() {
    var u = currentUser();
    return u && u.role ? u.role : null;
  }

  // ---- Public auth functions ----

  // Note: This still looks synchronous from the caller's perspective,
  // but underneath it uses users loaded from the backend.
  function register(opts) {
    opts = opts || {};
    var name = (opts.name || '').trim();
    var email = (opts.email || '').trim().toLowerCase();
    var password = opts.password || '';
    var role = opts.role || '';

    if (!name || !email || !password || !role) {
      throw new Error('All fields are required.');
    }

    var users = _loadUsers();

    // Check if email already exists in cache
    for (var i = 0; i < users.length; i++) {
      if ((users[i].email || '').trim().toLowerCase() === email) {
        throw new Error('Email already registered.');
      }
    }

    // Build payload for backend
    var payload = {
      name: name,
      email: email,
      password: password,
      role: role
    };

    // Fire-and-forget backend call: this will persist the new user in the real DB.
    // We optimistically push a temporary user into the cache so UX feels instant.
    if (typeof UsersAPI !== 'undefined' && UsersAPI.create) {
      UsersAPI.create(payload)
        .then(function (createdUser) {
          // Backend should return the created user with an id
          if (createdUser && createdUser.id) {
            users.push(createdUser);
            _setUsers(users);
            localStorage.setItem(keys.current, createdUser.id);
          } else {
            console.warn('AUTH.register: API did not return a user with id');
          }
        })
        .catch(function (err) {
          console.error('AUTH.register: Failed to create user via API', err);
        });
    } else {
      console.error('AUTH.register: UsersAPI.create is not available');
    }

    // We don't know the final id yet, but for existing UI we just return a placeholder.
    // The real current user will be set when API returns above.
    return null;
  }

  function login(email, password) {
    email = (email || '').trim().toLowerCase();
    password = password || '';

    var users = _loadUsers();
    if (!users.length) {
      console.warn('AUTH.login: user cache is empty; backend may not have loaded yet.');
    }

    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      var uEmail = (u.email || '').trim().toLowerCase();
      if (uEmail === email && u.password === password) {
        localStorage.setItem(keys.current, u.id);
        return u;
      }
    }

    throw new Error('Invalid email or password.');
  }

  function logout() {
    localStorage.removeItem(keys.current);
  }

  // Public API
  return {
    keys: keys,
    _loadUsers: _loadUsers,   // still exposed for compatibility
    _setUsers: _setUsers,
    currentUser: currentUser,
    currentRole: currentRole,
    register: register,
    login: login,
    logout: logout
  };
})();

// ---- Navigation helpers (unchanged logic) ----

function renderAuthNav() {
  var u = AUTH.currentUser();
  var role = u && u.role ? u.role : null;

  var loginL       = document.getElementById('navLogin');
  var registerL    = document.getElementById('navRegister');
  var logoutL      = document.getElementById('navLogout');
  var uploadL      = document.getElementById('navUpload');
  var logisticsL   = document.getElementById('navLogistics');
  var marketplaceL = document.getElementById('navMarketplace');
  var userName     = document.getElementById('navUserName');

  if (loginL)    loginL.style.display    = u ? 'none' : '';
  if (registerL) registerL.style.display = u ? 'none' : '';
  if (logoutL)   logoutL.style.display   = u ? '' : 'none';
  if (userName)  userName.textContent    = u ? u.name : '';

  // Keep Upload and Logistics links visible; pages enforce role behavior
  if (uploadL)    uploadL.style.display    = '';
  if (logisticsL) logisticsL.style.display = '';

  if (logoutL) {
    logoutL.onclick = function (e) {
      e.preventDefault();
      AUTH.logout();
      location.href = 'index.html';
    };
  }

  if (loginL) {
    loginL.addEventListener('click', function (ev) {
      var href = loginL.getAttribute('href') || 'login.html';
      location.href = href;
    });
  }
  if (registerL) {
    registerL.addEventListener('click', function (ev) {
      var href = registerL.getAttribute('href') || 'register.html';
      location.href = href;
    });
  }
}

function requireRole(roles) {
  var role = AUTH.currentRole();
  var allowed = Array.isArray(roles) ? roles : [roles];
  if (!role || allowed.indexOf(role) === -1) {
    var back = encodeURIComponent(location.pathname + location.search);
    location.href = 'login.html?next=' + back;
  }
}
