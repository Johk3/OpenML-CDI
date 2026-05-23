import fs from "fs";
import path from "path";
import { deleteCurrentTestAccount } from "./utils/api";

async function e2eTeardown(): Promise<void> {
  await deleteCurrentTestAccount();

  try {
    await fs.promises.unlink(path.resolve(__dirname, ".auth/state.json"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

export default e2eTeardown;
