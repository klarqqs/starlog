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
  }

  document.querySelectorAll('[data-theme-value]').forEach(function (button) {
    button.addEventListener('click', function () {
      apply(button.getAttribute('data-theme-value'));
    });
  });

  apply(current());
})();
