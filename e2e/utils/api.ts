export const API_BASE_URL = `${(process.env.E2E_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "")}/api`;
export const E2E_DEV_LOGIN_EMAIL =
  process.env.E2E_EXPECTED_DEV_LOGIN_EMAIL ??
  process.env.AUTH_DEV_LOGIN_EMAIL ??
  "e2e.github.user@example.com";
export const E2E_DEV_LOGIN_USERNAME =
  process.env.E2E_EXPECTED_DEV_LOGIN_USERNAME ??
  process.env.AUTH_DEV_LOGIN_USERNAME ??
  "e2e-github-user";
export const E2E_DEV_LOGIN_FIRST_NAME =
  process.env.E2E_EXPECTED_DEV_LOGIN_FIRST_NAME ??
  process.env.AUTH_DEV_LOGIN_FIRST_NAME ??
  "E2E";
export const E2E_DEV_LOGIN_LAST_NAME =
  process.env.E2E_EXPECTED_DEV_LOGIN_LAST_NAME ??
  process.env.AUTH_DEV_LOGIN_LAST_NAME ??
  "GitHub";

type TokenResponse = {
  access_token?: unknown;
};

type CurrentUserResponse = {
  email?: unknown;
  username?: unknown;
};

export function e2eDevDisplayName() {
  return `${E2E_DEV_LOGIN_FIRST_NAME} ${E2E_DEV_LOGIN_LAST_NAME}`;
}

export async function requestDevAuthToken() {
  const response = await fetch(`${API_BASE_URL}/auth/github/callback`);

  if (!response.ok) {
    throw new Error(`Dev auth callback failed with status ${response.status}`);
  }

  const data = (await response.json()) as TokenResponse;
  if (typeof data.access_token !== "string") {
    throw new Error("Dev auth callback did not return an access token");
  }

  return data.access_token;
}

async function assertE2EDevAccount(token: string) {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Dev account lookup failed with status ${response.status}`);
  }

  const user = (await response.json()) as CurrentUserResponse;
  if (
    user.email !== E2E_DEV_LOGIN_EMAIL ||
    user.username !== E2E_DEV_LOGIN_USERNAME
  ) {
    throw new Error(
      [
        "Refusing to delete a non-E2E dev auth account.",
        `Expected ${E2E_DEV_LOGIN_EMAIL} / ${E2E_DEV_LOGIN_USERNAME},`,
        `got ${String(user.email)} / ${String(user.username)}.`,
        "Start the backend with the documented AUTH_DEV_LOGIN_* E2E values.",
      ].join(" "),
    );
  }
}

export async function deleteCurrentTestAccount() {
  const token = await requestDevAuthToken();
  await assertE2EDevAccount(token);

  const response = await fetch(`${API_BASE_URL}/user/delete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: "account_and_datasets" }),
  });

  if (!response.ok) {
    throw new Error(
      `Test account deletion failed with status ${response.status}`,
    );
  }
}
