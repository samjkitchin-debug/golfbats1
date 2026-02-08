import type { NextConfig } from "next";
import { execSync } from "child_process";

function getAppVersion(): string {
  try {
    const count = execSync("git rev-list --count HEAD", { encoding: "utf-8" }).trim();
    return `0.1.${count}`;
  } catch {
    return "0.1.0";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: getAppVersion(),
  },
};

export default nextConfig;
