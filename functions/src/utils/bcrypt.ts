import { spawn, spawnSync } from 'child_process';

const PYTHON_CANDIDATES = ['python3', 'python'];
let cachedPythonBinary: string | null = null;

const resolvePythonBinary = (): string => {
  if (cachedPythonBinary) {
    return cachedPythonBinary;
  }

  for (const candidate of PYTHON_CANDIDATES) {
    try {
      const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
      if (result.error === undefined && result.status === 0) {
        cachedPythonBinary = candidate;
        return candidate;
      }
    } catch (_error) {
      // Ignore and try next candidate.
    }
  }

  throw new Error('Python interpreter not found for bcrypt operations.');
};

const runPythonScript = (script: string, args: string[]): Promise<string> => {
  return new Promise((resolve, reject) => {
    let pythonBinary: string;
    try {
      pythonBinary = resolvePythonBinary();
    } catch (error) {
      reject(error);
      return;
    }

    const child = spawn(pythonBinary, ['-c', script, ...args]);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Python process exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });
};

export const hashBcrypt = async (value: string, cost: number): Promise<string> => {
  if (!Number.isInteger(cost) || cost < 4 || cost > 31) {
    throw new Error('Invalid bcrypt cost parameter.');
  }
  const script = (
    "import crypt, sys;\n"
    + "rounds = int(sys.argv[2]);\n"
    + "salt = crypt.mksalt(crypt.METHOD_BLOWFISH, rounds=rounds);\n"
    + "print(crypt.crypt(sys.argv[1], salt), end='')\n"
  );
  return runPythonScript(script, [value, String(cost)]);
};

export const compareBcrypt = async (value: string, hash: string): Promise<boolean> => {
  if (typeof hash !== 'string' || hash.length === 0) {
    return false;
  }
  const script = (
    "import crypt, sys;\n"
    + "print(crypt.crypt(sys.argv[1], sys.argv[2]), end='')\n"
  );
  try {
    const result = await runPythonScript(script, [value, hash]);
    return result === hash;
  } catch (_error) {
    return false;
  }
};
