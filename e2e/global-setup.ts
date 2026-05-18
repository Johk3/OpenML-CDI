import fs from "fs";
import path from "path";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:8000";

async function e2eSetup(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/auth/github/callback`);

  if (!response.ok) {
    throw new Error(`Setup failed with status code: ${response.status}`);
  }

  const data = await response.json();

  await fs.promises.mkdir(path.resolve(__dirname, ".auth/"), {
    recursive: true,
  });

  await fs.promises.writeFile(
    path.resolve(__dirname, ".auth/state.json"),
    JSON.stringify({ token: data.access_token }),
  );
}

export default e2eSetup;
