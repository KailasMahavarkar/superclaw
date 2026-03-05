/**
 * Container runtime abstraction for NanoClaw.
 * All runtime-specific logic lives here so swapping runtimes means changing one file.
 */
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import { logger } from './logger.js';

/** The container runtime binary name. */
export const CONTAINER_RUNTIME_BIN = 'docker';
const RUNTIME_INFO_TIMEOUT_MS = 10000;
const WINDOWS_RUNTIME_START_TIMEOUT_MS = 120000;
const WINDOWS_RUNTIME_POLL_INTERVAL_MS = 2000;

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function assertRuntimeReachable(): void {
  execSync(`${CONTAINER_RUNTIME_BIN} info`, {
    stdio: 'pipe',
    timeout: RUNTIME_INFO_TIMEOUT_MS,
  });
}

function getDockerDesktopPathWindows(): string | null {
  const candidates = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    'C:\\Program Files',
    'C:\\Program Files (x86)',
  ]
    .filter((base): base is string => !!base)
    .map((base) => path.join(base, 'Docker', 'Docker', 'Docker Desktop.exe'));

  for (const exePath of candidates) {
    if (fs.existsSync(exePath)) return exePath;
  }
  return null;
}

function tryStartDockerDesktopWindows(): boolean {
  if (process.platform !== 'win32') return false;

  const dockerDesktopPath = getDockerDesktopPathWindows();
  if (!dockerDesktopPath) {
    logger.warn('Docker Desktop executable not found for auto-start');
    return false;
  }

  try {
    const proc = spawn(dockerDesktopPath, [], {
      detached: true,
      stdio: 'ignore',
    });
    proc.unref();
    logger.info({ dockerDesktopPath }, 'Started Docker Desktop');
    return true;
  } catch (err) {
    logger.warn({ err, dockerDesktopPath }, 'Failed to start Docker Desktop');
    return false;
  }
}

function waitForRuntimeReady(timeoutMs: number, pollIntervalMs: number): boolean {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      assertRuntimeReachable();
      return true;
    } catch {
      sleepMs(pollIntervalMs);
    }
  }
  return false;
}

/** Returns CLI args for a readonly bind mount. */
export function readonlyMountArgs(
  hostPath: string,
  containerPath: string,
): string[] {
  return ['-v', `${hostPath}:${containerPath}:ro`];
}

/** Returns the shell command to stop a container by name. */
export function stopContainer(name: string): string {
  return `${CONTAINER_RUNTIME_BIN} stop ${name}`;
}

/** Ensure the container runtime is running, starting it if needed. */
export function ensureContainerRuntimeRunning(): void {
  try {
    assertRuntimeReachable();
    logger.debug('Container runtime already running');
    return;
  } catch (err) {
    logger.error({ err }, 'Failed to reach container runtime');
    const attemptedAutoStart = tryStartDockerDesktopWindows();
    if (attemptedAutoStart) {
      logger.info('Waiting for Docker Desktop to become ready');
      if (
        waitForRuntimeReady(
          WINDOWS_RUNTIME_START_TIMEOUT_MS,
          WINDOWS_RUNTIME_POLL_INTERVAL_MS,
        )
      ) {
        logger.info('Container runtime became ready after Docker Desktop start');
        return;
      }
      logger.error(
        'Docker Desktop started but container runtime was not ready in time',
      );
    }

    console.error(
      '\n╔════════════════════════════════════════════════════════════════╗',
    );
    console.error(
      '║  FATAL: Container runtime failed to start                      ║',
    );
    console.error(
      '║                                                                ║',
    );
    console.error(
      '║  Agents cannot run without a container runtime. To fix:        ║',
    );
    console.error(
      '║  1. Ensure Docker is installed and running                     ║',
    );
    console.error(
      '║  2. Run: docker info                                           ║',
    );
    console.error(
      '║  3. Restart NanoClaw                                           ║',
    );
    console.error(
      '╚════════════════════════════════════════════════════════════════╝\n',
    );
    throw new Error('Container runtime is required but failed to start');
  }
}

/** Kill orphaned NanoClaw containers from previous runs. */
export function cleanupOrphans(): void {
  try {
    const output = execSync(
      `${CONTAINER_RUNTIME_BIN} ps --filter name=nanoclaw- --format '{{.Names}}'`,
      { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' },
    );
    const orphans = output.trim().split('\n').filter(Boolean);
    for (const name of orphans) {
      try {
        execSync(stopContainer(name), { stdio: 'pipe' });
      } catch {
        /* already stopped */
      }
    }
    if (orphans.length > 0) {
      logger.info(
        { count: orphans.length, names: orphans },
        'Stopped orphaned containers',
      );
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to clean up orphaned containers');
  }
}
