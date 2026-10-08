export function fillLoginForm(username, password) {
  const TEXT_TYPES = ['text', 'email', 'tel', ''];
  const USERNAME_HINT = /user|login|e-?mail|identifiant|courriel|account|compte|phone|tel/i;

  const isVisible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      && !element.disabled && !element.readOnly;
  };
  const isTextInput = (element) => TEXT_TYPES.includes((element.getAttribute('type') ?? '').toLowerCase());
  const describe = (element) => [element.name, element.id, element.autocomplete, element.placeholder, element.getAttribute('aria-label')].join(' ');

  const setValue = (element, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    element.focus();
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const inputs = [...document.querySelectorAll('input')].filter(isVisible);
  const passwordField = inputs.find((element) => element.type === 'password') ?? null;
  const textFields = inputs.filter(isTextInput);

  let usernameField = null;
  if (passwordField) {
    const scope = passwordField.form ? textFields.filter((element) => element.form === passwordField.form) : textFields;
    const before = scope.filter((element) => element.compareDocumentPosition(passwordField) & Node.DOCUMENT_POSITION_FOLLOWING);
    usernameField = before.at(-1) ?? null;
  } else {
    usernameField = textFields.find((element) => element.autocomplete === 'username')
      ?? textFields.find((element) => USERNAME_HINT.test(describe(element)))
      ?? (textFields.includes(document.activeElement) ? document.activeElement : null);
  }

  let filled = 0;
  if (usernameField && username) {
    setValue(usernameField, username);
    filled += 1;
  }
  if (passwordField && password) {
    setValue(passwordField, password);
    filled += 1;
  }
  return { filled, usernameFilled: Boolean(usernameField && username), passwordFilled: Boolean(passwordField && password) };
}
