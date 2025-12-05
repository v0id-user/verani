import { defineConfig } from "@nyron/cli/config"

export default defineConfig({
  repo: "v0id-user/verani",
  projects: {
    verani: {
      tagPrefix: "v",
      path: ".",
    },
  },
  autoChangelog: true,
  onPushReminder: true,
})
