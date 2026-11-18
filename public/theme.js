(function () {
  var key = 'stellog.theme';

  function current() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(key, theme);
    } catch (e) {}
    document.querySelectorAll('[data-theme-value]').forEach(function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-theme-value') === theme ? 'true' : 'false');
    });
    var next = theme === 'light' ? 'dark' : 'light';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.setAttribute('aria-label', next === 'light' ? 'Switch to light theme' : 'Switch to dark theme');
    });
  }

  document.querySelectorAll('[data-theme-value]').forEach(function (button) {
    button.addEventListener('click', function () {
      apply(button.getAttribute('data-theme-value'));
    });
  });

  document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
    button.addEventListener('click', function () {
      apply(current() === 'light' ? 'dark' : 'light');
    });
  });

  apply(current());
})();
