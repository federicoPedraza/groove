import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const SETUP_SCRIPT = readFileSync(
  resolve(ROOT, "scripts/setup-linux-fast"),
  "utf-8",
);
const CI_WORKFLOW = readFileSync(
  resolve(ROOT, ".github/workflows/build-desktop.yml"),
  "utf-8",
);
const CHECK_SCRIPT = readFileSync(
  resolve(ROOT, "scripts/check-linux-deps"),
  "utf-8",
);

interface LinuxDep {
  name: string;
  description: string;
  runtime_so: string;
  pkg_config: string;
  packages: Record<string, string | null>;
  notes?: string;
}

interface LinuxDeps {
  required_libraries: LinuxDep[];
  build_toolchains: {
    packages: Record<string, string[]>;
  };
  supported_package_managers: string[];
}

const DEPS: LinuxDeps = JSON.parse(
  readFileSync(resolve(ROOT, "scripts/linux-deps.json"), "utf-8"),
);

describe("linux-deps.json (source of truth)", () => {
  it("has at least 5 required libraries", () => {
    expect(DEPS.required_libraries.length).toBeGreaterThanOrEqual(5);
  });

  it("lists all supported package managers", () => {
    expect(DEPS.supported_package_managers).toEqual(
      expect.arrayContaining(["apt", "pacman", "dnf", "zypper"]),
    );
  });

  for (const lib of DEPS.required_libraries) {
    describe(`library: ${lib.name}`, () => {
      it("has a runtime_so defined", () => {
        expect(lib.runtime_so).toBeTruthy();
      });

      it("has a pkg_config name defined", () => {
        expect(lib.pkg_config).toBeTruthy();
      });

      it("has an apt package", () => {
        expect(lib.packages.apt).toBeTruthy();
      });

      for (const pm of DEPS.supported_package_managers) {
        it(`has a ${pm} entry (package or null with notes)`, () => {
          expect(pm in lib.packages).toBe(true);
          if (lib.packages[pm] === null) {
            expect(lib.notes).toBeTruthy();
          }
        });
      }
    });
  }

  for (const pm of DEPS.supported_package_managers) {
    it(`has build toolchain packages for ${pm}`, () => {
      expect(DEPS.build_toolchains.packages[pm]).toBeDefined();
      expect(DEPS.build_toolchains.packages[pm].length).toBeGreaterThan(0);
    });
  }
});

describe("setup-linux-fast reads from linux-deps.json", () => {
  it("references linux-deps.json", () => {
    expect(SETUP_SCRIPT).toContain("linux-deps.json");
  });

  it("uses read_packages_for to get packages dynamically", () => {
    expect(SETUP_SCRIPT).toContain("read_packages_for");
  });

  it("does not hardcode apt package lists", () => {
    // The script should NOT contain hardcoded apt package arrays anymore.
    // It reads them from linux-deps.json via read_packages_for.
    expect(SETUP_SCRIPT).not.toMatch(/apt_packages=\(/);
    expect(SETUP_SCRIPT).not.toMatch(/pacman_packages=\(/);
    expect(SETUP_SCRIPT).not.toMatch(/dnf_packages=\(/);
  });

  for (const pm of DEPS.supported_package_managers) {
    it(`supports ${pm} package manager`, () => {
      expect(SETUP_SCRIPT).toContain(`${pm})`);
    });
  }

  it("runs verify_system_deps after install", () => {
    expect(SETUP_SCRIPT).toContain("verify_system_deps");
    expect(SETUP_SCRIPT).toContain("check-linux-deps");
  });
});

describe("CI workflow reads from linux-deps.json", () => {
  it("reads packages from linux-deps.json instead of hardcoding", () => {
    expect(CI_WORKFLOW).toContain("linux-deps.json");
  });

  it("runs check-linux-deps verification step", () => {
    expect(CI_WORKFLOW).toContain("check-linux-deps");
  });

  it("tests setup on multiple distros", () => {
    expect(CI_WORKFLOW).toContain("ubuntu");
    expect(CI_WORKFLOW).toContain("archlinux");
    expect(CI_WORKFLOW).toContain("fedora");
  });
});

describe("check-linux-deps validation script", () => {
  it("reads from linux-deps.json", () => {
    expect(CHECK_SCRIPT).toContain("linux-deps.json");
  });

  it("checks ldconfig for runtime .so files", () => {
    expect(CHECK_SCRIPT).toContain("ldconfig");
  });

  it("checks pkg-config as fallback", () => {
    expect(CHECK_SCRIPT).toContain("pkg-config");
  });

  it("provides distro-specific install hints on failure", () => {
    expect(CHECK_SCRIPT).toContain("pacman");
    expect(CHECK_SCRIPT).toContain("dnf");
    expect(CHECK_SCRIPT).toContain("apt");
  });
});

describe("script structure", () => {
  it("setup script uses set -euo pipefail", () => {
    expect(SETUP_SCRIPT).toContain("set -euo pipefail");
  });

  it("check script uses set -euo pipefail", () => {
    expect(CHECK_SCRIPT).toContain("set -euo pipefail");
  });

  it("setup script detects package manager before installing", () => {
    expect(SETUP_SCRIPT).toContain("detect_package_manager");
  });

  it("setup script handles missing sudo gracefully", () => {
    expect(SETUP_SCRIPT).toMatch(/need root or sudo.*skipping/);
  });
});
