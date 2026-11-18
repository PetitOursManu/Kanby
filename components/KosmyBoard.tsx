/**
 * "Se connecter avec Kosmy Board" UI pieces, shared by the login and profile pages.
 */

const BUTTON_CLASS =
  "btn-secondary h-10 w-full";

/** Message for a `kosmy_error` code returned by the Kosmy Board sign-in routes. */
export function kosmyErrorMessage(t: (key: string) => string, code: string): string {
  const key = `kosmy.error.${code}`;
  const msg = t(key);
  return msg === key ? t("kosmy.error.generic") : msg;
}

/** Sign-in button: a plain link, the route handler redirects to the Board. */
export function KosmyBoardButton({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className={BUTTON_CLASS}>
      <KosmyMark />
      {label}
    </a>
  );
}

/** Same look, as the submit button of a form (account linking). */
export function KosmyBoardSubmit({ label }: { label: string }) {
  return (
    <button type="submit" className={BUTTON_CLASS}>
      <KosmyMark />
      {label}
    </button>
  );
}

/** Small four-tile mark (a board of spaces), drawn inline to match Kanby's line icons. */
function KosmyMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <rect x="1" y="1" width="6" height="6" rx="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" opacity="0.55" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" opacity="0.55" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
    </svg>
  );
}
