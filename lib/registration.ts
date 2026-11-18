/** Public sign-up is on unless ALLOW_REGISTRATION=false (admins can still create accounts). */
export function registrationAllowed(): boolean {
  return (process.env.ALLOW_REGISTRATION ?? "true").toLowerCase() !== "false";
}
