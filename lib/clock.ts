/**
 * Local wall clock in Vienna as "YYYY-MM-DDTHH:MM", which is the format the
 * upstream speaks and the one the whole app passes around. Server side this
 * matters because the function runs on a machine set to UTC.
 */
export function nowInVienna(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .replace(" ", "T");
}
