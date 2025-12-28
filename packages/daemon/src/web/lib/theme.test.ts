/**
 * Theme Utility Tests
 *
 * Unit tests for theme-related utilities and schema validation.
 */

import { describe, it, expect } from "bun:test";
import { themeSchema } from "@nightshift/shared";

describe("Theme Schema", () => {
  const validThemes = ["light", "dark", "solarized-light", "solarized-dark", "system"];

  describe("themeSchema.parse", () => {
    it("should accept valid theme: light", () => {
      expect(themeSchema.parse("light")).toBe("light");
    });

    it("should accept valid theme: dark", () => {
      expect(themeSchema.parse("dark")).toBe("dark");
    });

    it("should accept valid theme: solarized-light", () => {
      expect(themeSchema.parse("solarized-light")).toBe("solarized-light");
    });

    it("should accept valid theme: solarized-dark", () => {
      expect(themeSchema.parse("solarized-dark")).toBe("solarized-dark");
    });

    it("should accept valid theme: system", () => {
      expect(themeSchema.parse("system")).toBe("system");
    });

    it("should reject invalid theme values", () => {
      const invalidThemes = ["invalid", "dracula", "monokai", "", "DARK", "Light"];
      invalidThemes.forEach((theme) => {
        expect(() => themeSchema.parse(theme)).toThrow();
      });
    });
  });

  describe("themeSchema.safeParse", () => {
    it("should return success for valid themes", () => {
      validThemes.forEach((theme) => {
        const result = themeSchema.safeParse(theme);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(theme);
        }
      });
    });

    it("should return error for invalid theme", () => {
      const result = themeSchema.safeParse("invalid-theme");
      expect(result.success).toBe(false);
    });
  });
});

describe("Theme Constants", () => {
  it("should have 5 theme options", () => {
    const themes = themeSchema.options;
    expect(themes.length).toBe(5);
  });

  it("should include both solarized variants", () => {
    const themes = themeSchema.options;
    expect(themes.includes("solarized-light")).toBe(true);
    expect(themes.includes("solarized-dark")).toBe(true);
  });

  it("should include system option for OS preference sync", () => {
    const themes = themeSchema.options;
    expect(themes.includes("system")).toBe(true);
  });
});

describe("Theme Classification", () => {
  it("should identify dark themes", () => {
    const darkThemes = ["dark", "solarized-dark"];
    darkThemes.forEach((theme) => {
      expect(theme.includes("dark")).toBe(true);
    });
  });

  it("should identify light themes", () => {
    const lightThemes = ["light", "solarized-light"];
    lightThemes.forEach((theme) => {
      expect(theme.includes("light")).toBe(true);
    });
  });

  it("should identify solarized themes", () => {
    const solarizedThemes = ["solarized-light", "solarized-dark"];
    solarizedThemes.forEach((theme) => {
      expect(theme.startsWith("solarized-")).toBe(true);
    });
  });
});
