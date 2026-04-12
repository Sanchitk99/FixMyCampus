import fs from "fs";
import dotenv from "dotenv";

const rootEnvPath = new URL("../.env", import.meta.url).pathname;
const exampleEnvPath = new URL("../.env.example", import.meta.url).pathname;

export function loadEnv() {
  if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath });
    return;
  }

  if (fs.existsSync(exampleEnvPath)) {
    dotenv.config({ path: exampleEnvPath });
  }
}
