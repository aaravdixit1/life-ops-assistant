#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const backendDir = path.join(rootDir, "backend");
const frontendDir = path.join(rootDir, "frontend");

const mode = process.argv[2] || "all";

// Color helpers
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;
const magenta = (text) => `\x1b[35m${text}\x1b[0m`;
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;

function getPythonPath() {
  const venvPython = path.join(backendDir, ".venv", "bin", "python");
  try {
    execSync(`"${venvPython}" --version`, { stdio: "ignore" });
    return venvPython;
  } catch {
    return "python3";
  }
}

function getUvicornPath() {
  const venvUvicorn = path.join(backendDir, ".venv", "bin", "uvicorn");
  try {
    execSync(`"${venvUvicorn}" --version`, { stdio: "ignore" });
    return venvUvicorn;
  } catch {
    return "uvicorn";
  }
}

function getPytestPath() {
  const venvPytest = path.join(backendDir, ".venv", "bin", "pytest");
  try {
    execSync(`"${venvPytest}" --version`, { stdio: "ignore" });
    return venvPytest;
  } catch {
    return "pytest";
  }
}

function stopPorts() {
  console.log(yellow("Checking and clearing ports 8000, 3000, 3001..."));
  try {
    const pids = execSync("lsof -ti :8000 :3000 :3001 2>/dev/null || true")
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean);
    if (pids.length > 0) {
      console.log(yellow(`Stopping stale processes: ${pids.join(", ")}`));
      execSync(`kill -9 ${pids.join(" ")} 2>/dev/null || true`);
      console.log(green("Ports cleared!"));
    } else {
      console.log(green("No stale processes found."));
    }
  } catch (err) {
    console.error(red("Error clearing ports:"), err.message);
  }
}

function ensureDatabase() {
  try {
    const running = execSync('docker ps --filter "name=lifeops_postgres" --format "{{.Names}}" 2>/dev/null')
      .toString()
      .trim();
    if (!running.includes("lifeops_postgres")) {
      console.log(yellow("Starting PostgreSQL container via docker compose..."));
      execSync("docker compose up -d", { cwd: rootDir, stdio: "inherit" });
      console.log(green("PostgreSQL is running!"));
    } else {
      console.log(green("PostgreSQL container is already healthy."));
    }
  } catch {
    console.log(yellow("Docker check skipped (Docker may not be running). Proceeding..."));
  }
}

function ensureFrontendDependencies() {
  const frontendNodeModules = path.join(frontendDir, "node_modules");
  if (!fs.existsSync(frontendNodeModules)) {
    console.log(yellow("Installing frontend dependencies (node_modules missing)..."));
    execSync("npm install", { cwd: frontendDir, stdio: "inherit" });
    console.log(green("Frontend dependencies installed successfully.\n"));
  }
}

function runSetup() {
  console.log(bold(green("\n⚙️  Bootstrapping Life-Ops Assistant (Full-Stack Setup)...\n")));

  const envPath = path.join(rootDir, ".env");
  const envExamplePath = path.join(rootDir, ".env.example");
  if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log(green("• Created .env from .env.example"));
  } else {
    console.log(green("• .env already present"));
  }

  ensureDatabase();

  const venvDir = path.join(backendDir, ".venv");
  if (!fs.existsSync(venvDir)) {
    console.log(yellow("• Creating Python virtual environment in backend/.venv..."));
    execSync("python3 -m venv .venv", { cwd: backendDir, stdio: "inherit" });
  }
  const pyBin = getPythonPath();
  console.log(yellow("• Installing backend Python dependencies..."));
  execSync(`"${pyBin}" -m pip install -r requirements.txt`, { cwd: backendDir, stdio: "inherit" });

  console.log(yellow("• Initializing PostgreSQL schema extensions..."));
  execSync(
    `"${pyBin}" -c "import asyncio; from app.db import init_db; asyncio.run(init_db())"`,
    { cwd: backendDir, stdio: "inherit", env: { ...process.env, PYTHONPATH: "." } }
  );

  console.log(yellow("• Installing frontend npm dependencies..."));
  execSync("npm install", { cwd: frontendDir, stdio: "inherit" });

  console.log(bold(green("\n✅ Setup complete! Run `npm run dev` (or `./run.sh`), then open http://localhost:3000/setup\n")));
}

function runCanvasLogin() {
  console.log(bold(cyan("\n🎓 Launching Canvas SSO login helper (Playwright)...\n")));
  const pyBin = getPythonPath();
  const child = spawn(pyBin, ["-m", "app.services.canvas_pw", "--login"], {
    cwd: backendDir,
    stdio: "inherit",
    env: { ...process.env, PYTHONPATH: "." },
  });
  child.on("exit", (code) => process.exit(code || 0));
}

function runTests() {
  console.log(bold(cyan("\n🧪 Running Backend + Frontend Test Suites...\n")));
  const pytestBin = getPytestPath();
  execSync(`"${pytestBin}" -q`, {
    cwd: backendDir,
    stdio: "inherit",
    env: { ...process.env, PYTHONPATH: "." },
  });
  execSync("npm test", { cwd: frontendDir, stdio: "inherit" });
  console.log(bold(green("\n✅ All backend and frontend tests passed!\n")));
}

function runBuild() {
  console.log(bold(magenta("\n📦 Building Next.js Frontend Production Bundle...\n")));
  ensureFrontendDependencies();
  execSync("npm run build", { cwd: frontendDir, stdio: "inherit" });
}

function runDemo() {
  console.log(bold(green("\n🚀 Starting Life-Ops Assistant in Standalone DEMO Mode...\n")));
  console.log(yellow("• Zero backend required (no Docker, no Python, no database, no keys)"));
  console.log(yellow("• Running fictional student persona: Alex Chen"));
  console.log(yellow("• All network calls strictly guarded in-browser\n"));

  ensureFrontendDependencies();

  const child = spawn("npm", ["run", "dev:demo"], {
    cwd: frontendDir,
    stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_DEMO_MODE: "true" },
  });

  child.on("exit", (code) => process.exit(code || 0));
}

function runBackendOnly() {
  console.log(bold(cyan("\n⚡ Starting FastAPI Backend on http://127.0.0.1:8000...\n")));
  const uvicornBin = getUvicornPath();
  const child = spawn(
    uvicornBin,
    ["app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"],
    {
      cwd: backendDir,
      stdio: "inherit",
      env: { ...process.env, PYTHONPATH: "." },
    }
  );

  child.on("exit", (code) => process.exit(code || 0));
}

function runFrontendOnly() {
  console.log(bold(magenta("\n💻 Starting Next.js Frontend on http://localhost:3000...\n")));
  ensureFrontendDependencies();
  const child = spawn("npm", ["run", "dev"], {
    cwd: frontendDir,
    stdio: "inherit",
  });

  child.on("exit", (code) => process.exit(code || 0));
}

function runAll() {
  console.log(bold(green("\n🚀 Starting Full-Stack Life-Ops Assistant (Regular Mode)...\n")));

  ensureDatabase();
  ensureFrontendDependencies();

  const uvicornBin = getUvicornPath();
  console.log(cyan("Starting backend on http://127.0.0.1:8000..."));
  const backend = spawn(
    uvicornBin,
    ["app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"],
    {
      cwd: backendDir,
      env: { ...process.env, PYTHONPATH: "." },
    }
  );

  backend.stdout.on("data", (data) => {
    process.stdout.write(`${cyan("[backend]")} ${data}`);
  });
  backend.stderr.on("data", (data) => {
    process.stderr.write(`${cyan("[backend]")} ${data}`);
  });

  console.log(magenta("Starting frontend on http://localhost:3000..."));
  const frontend = spawn("npm", ["run", "dev"], {
    cwd: frontendDir,
    env: process.env,
  });

  frontend.stdout.on("data", (data) => {
    process.stdout.write(`${magenta("[frontend]")} ${data}`);
  });
  frontend.stderr.on("data", (data) => {
    process.stderr.write(`${magenta("[frontend]")} ${data}`);
  });

  const cleanup = () => {
    console.log(yellow("\nShutting down backend and frontend..."));
    backend.kill("SIGTERM");
    frontend.kill("SIGTERM");
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

// Route command
switch (mode) {
  case "setup":
    runSetup();
    break;
  case "demo":
    runDemo();
    break;
  case "backend":
    runBackendOnly();
    break;
  case "frontend":
    runFrontendOnly();
    break;
  case "db":
    ensureDatabase();
    break;
  case "stop":
    stopPorts();
    break;
  case "canvas-login":
    runCanvasLogin();
    break;
  case "test":
    runTests();
    break;
  case "build":
    runBuild();
    break;
  case "all":
  case "dev":
  default:
    runAll();
    break;
}
