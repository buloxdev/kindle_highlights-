import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const AMAZON_EMAIL_SERVICE = "kindle_highlights.amazon.email";
const AMAZON_PASSWORD_SERVICE = "kindle_highlights.amazon.password";
const WEEKLY_EMAIL_TO_SERVICE = "kindle_highlights.weekly_email.to";
const DEFAULT_ACCOUNT = process.env.KINDLE_KEYCHAIN_ACCOUNT || "default";

export async function readKeychainSecret(service, account = DEFAULT_ACCOUNT) {
  if (process.platform !== "darwin") return null;

  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-s",
      service,
      "-a",
      account,
      "-w"
    ]);
    const value = stdout.trim();
    return value || null;
  } catch {
    return null;
  }
}

export async function resolveAmazonCredentials() {
  const envEmail = process.env.AMAZON_EMAIL?.trim() || null;
  const envPassword = process.env.AMAZON_PASSWORD?.trim() || null;

  const keychainEmail = await readKeychainSecret(AMAZON_EMAIL_SERVICE);
  const keychainPassword = await readKeychainSecret(AMAZON_PASSWORD_SERVICE);

  const email = envEmail || keychainEmail;
  const password = envPassword || keychainPassword;

  let source = "none";
  if (envEmail && envPassword) source = "env";
  else if (keychainEmail && keychainPassword) source = "keychain";
  else if ((envEmail && keychainPassword) || (keychainEmail && envPassword)) source = "mixed";

  return {
    email,
    password,
    source,
    emailService: AMAZON_EMAIL_SERVICE,
    passwordService: AMAZON_PASSWORD_SERVICE,
    account: DEFAULT_ACCOUNT
  };
}

export async function resolveWeeklyEmailRecipient(explicitRecipient = null) {
  const provided = typeof explicitRecipient === "string" ? explicitRecipient.trim() : "";
  const envWeekly = process.env.WEEKLY_HIGHLIGHT_EMAIL?.trim() || null;
  const envAmazon = process.env.AMAZON_EMAIL?.trim() || null;

  const keychainWeekly = await readKeychainSecret(WEEKLY_EMAIL_TO_SERVICE);
  const keychainAmazon = await readKeychainSecret(AMAZON_EMAIL_SERVICE);

  const recipient = provided || envWeekly || envAmazon || keychainWeekly || keychainAmazon;

  let source = "none";
  if (provided) source = "cli";
  else if (envWeekly) source = "env:weekly";
  else if (envAmazon) source = "env:amazon";
  else if (keychainWeekly) source = "keychain:weekly";
  else if (keychainAmazon) source = "keychain:amazon";

  return {
    recipient,
    source,
    weeklyService: WEEKLY_EMAIL_TO_SERVICE,
    amazonEmailService: AMAZON_EMAIL_SERVICE,
    account: DEFAULT_ACCOUNT
  };
}
