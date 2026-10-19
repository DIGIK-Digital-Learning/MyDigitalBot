// O endpoint legado do Teams é este host, não qualquer domínio de Traffic Manager.
const TRUSTED_HOST_SUFFIXES = [".botframework.com", ".teams.microsoft.com"];

export function isTrustedTeamsServiceUrl(value) {
  if (typeof value !== "string" || value !== value.trim()) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username && !url.password &&
      !url.port && !url.search && !url.hash &&
      (url.hostname === "smba.trafficmanager.net" ||
        TRUSTED_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix)))
    );
  } catch {
    return false;
  }
}
