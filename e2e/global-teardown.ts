import fs from "fs";
import path from "path";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:8000";

async function e2eTeardown(): Promise<void> {
  let data;
  try {
    data = await fs.promises.readFile(
      path.resolve(__dirname, ".auth/state.json"),
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  const token = JSON.parse(data).token;

  const response = await fetch(`${API_BASE_URL}/api/user/delete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(
      `Setup breakdown failed with status code: ${response.status}`,
    );
  }

  await fs.promises.unlink(path.resolve(__dirname, ".auth/state.json"));
}

export default e2eTeardown;
