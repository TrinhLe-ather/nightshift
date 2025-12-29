const path = require(
  `bun-pty/rust-pty/target/release/${
    process.platform === "win32"
      ? "rust_pty.dll"
      : process.platform === "linux" && process.arch === "x64"
        ? "librust_pty.so"
        : process.platform === "darwin" && process.arch === "x64"
          ? "librust_pty.dylib"
          : process.platform === "darwin" && process.arch === "arm64"
            ? "librust_pty_arm64.dylib"
            : process.platform === "linux" && process.arch === "arm64"
              ? "librust_pty_arm64.so"
              : ""
  }`,
);

process.env.BUN_PTY_LIB = path;
