import { test as setup } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

/** The dark theme is a stored choice (localStorage "theme"), read by a pre-paint
 *  script — the OS preference alone doesn't select it. Copy the e2e session and
 *  add that choice, so every page in the "dark" project opens dark. */
setup("store the dark theme choice", async ({ baseURL }) => {
  const state = JSON.parse(readFileSync("e2e/.auth/state.json", "utf8"));
  const origin = new URL(baseURL ?? "http://localhost:3000").origin;
  state.origins = [{ origin, localStorage: [{ name: "theme", value: "dark" }] }];
  writeFileSync("e2e/.auth/state-dark.json", JSON.stringify(state));
});
