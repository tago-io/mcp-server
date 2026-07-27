import { invalidParamError } from "../../utils/tool-errors";

const EXPIRE_EXAMPLE = '{ "run_user_id": "61f00000000000000c900001", "expire_time": "1 hour" }';

const MAX_EXPIRE_MINUTES = 120;

const DEFAULT_EXPIRE_TIME = "1 hour";

/**
 * Conservatively parses the platform's relative-duration forms this tool
 * permits: "N minute(s)" and "N hour(s)" only. Days, weeks, months, years,
 * the literal "never" (any casing), and anything unparseable are rejected:
 * unparseable input is NEVER passed through to the login route, because the
 * platform accepts "never" and has no per-token revocation endpoint.
 *
 * Returns the normalized duration string to send on the wire.
 */
function clampExpireTime(rawInput: string | undefined): string {
  if (rawInput === undefined) {
    return DEFAULT_EXPIRE_TIME;
  }

  const normalized = rawInput.trim().toLowerCase();

  if (normalized === "never") {
    throw invalidParamError(
      "expire_time",
      'a non-expiring token ("never") is refused because minted login tokens cannot be revoked individually; supply a duration at most 2 hours (deactivate or delete the user to kill an existing token)',
      EXPIRE_EXAMPLE
    );
  }

  const match = normalized.match(/^(\d+)\s+(minute|minutes|hour|hours)$/);
  if (!match) {
    throw invalidParamError(
      "expire_time",
      'only relative minute or hour durations are accepted (e.g. "30 minutes", "1 hour", "2 hours"); days, months, years, "never", and any other form are refused',
      EXPIRE_EXAMPLE
    );
  }

  const quantity = Number(match[1]);
  const unit = match[2];
  const minutes = unit.startsWith("hour") ? quantity * 60 : quantity;

  if (minutes <= 0) {
    throw invalidParamError("expire_time", "the duration must be greater than zero", EXPIRE_EXAMPLE);
  }
  if (minutes > MAX_EXPIRE_MINUTES) {
    throw invalidParamError(
      "expire_time",
      `the minted token cannot outlive the 2-hour ceiling (requested ${minutes} minutes); minted login tokens cannot be revoked individually, so the expiry is clamped hard`,
      EXPIRE_EXAMPLE
    );
  }

  return normalized;
}

export { clampExpireTime, DEFAULT_EXPIRE_TIME, EXPIRE_EXAMPLE, MAX_EXPIRE_MINUTES };
