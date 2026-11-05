import fs from 'node:fs';
import path from 'node:path';

/**
 * 提取项目的依赖事实清单与锁文件信息
 *
 * @param {string} projectDir 项目所在绝对目录
 * @param {Record<string, any>} [pkgJson] 可选 package.json 对象
 * @returns {{
 *   lockfileType: 'npm' | 'pnpm' | 'yarn' | 'none',
 *   hasLockfile: boolean,
 *   lockfileSupported: boolean,
 *   dependencies: import('./types.js').ProjectDependencyItem[],
 *   depCounts: { prod: number, dev: number, optional: number, total: number },
 *   isEmpty: boolean
 * }}
 */
export function extractDependencyFacts(projectDir, pkgJson = null) {
  let pkg = pkgJson;
  if (!pkg) {
    const pkgPath = path.join(projectDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      } catch {}
    }
  }
  pkg = pkg || {};

  // 1. 探测锁文件类型
  const npmLockPath = path.join(projectDir, 'package-lock.json');
  const pnpmLockPath = path.join(projectDir, 'pnpm-lock.yaml');
  const yarnLockPath = path.join(projectDir, 'yarn.lock');

  let lockfileType = 'none';
  let hasLockfile = false;
  let lockfileSupported = false;
  let npmLockData = null;

  if (fs.existsSync(npmLockPath)) {
    hasLockfile = true;
    lockfileType = 'npm';
    lockfileSupported = true;
    try {
      npmLockData = JSON.parse(fs.readFileSync(npmLockPath, 'utf8'));
    } catch (e) {
      // 锁文件解析失败时依然视为 npm lock 但无法解析精确版本
      npmLockData = null;
    }
  } else if (fs.existsSync(pnpmLockPath)) {
    hasLockfile = true;
    lockfileType = 'pnpm';
    lockfileSupported = false; // V1 明确标记不盲目猜测
  } else if (fs.existsSync(yarnLockPath)) {
    hasLockfile = true;
    lockfileType = 'yarn';
    lockfileSupported = false; // V1 明确标记不盲目猜测
  }

  // 2. 收集声明的直接依赖项
  const rawProd = pkg.dependencies || {};
  const rawDev = pkg.devDependencies || {};
  const rawOpt = pkg.optionalDependencies || {};
  const rawPeer = pkg.peerDependencies || {};

  const items = [];
  const seen = new Set();

  function addDep(name, range, kind, declaredOnly = false) {
    if (seen.has(name)) return;
    seen.add(name);

    let resolved = null;
    let exact = false;

    if (lockfileSupported && npmLockData) {
      // package-lock v2/v3: packages["node_modules/" + name]
      const pkgKey = 'node_modules/' + name;
      if (npmLockData.packages && npmLockData.packages[pkgKey] && npmLockData.packages[pkgKey].version) {
        resolved = npmLockData.packages[pkgKey].version;
        exact = true;
      } else if (npmLockData.dependencies && npmLockData.dependencies[name] && npmLockData.dependencies[name].version) {
        // package-lock v1 fallback
        resolved = npmLockData.dependencies[name].version;
        exact = true;
      }
    }

    items.push({
      name,
      kind,
      range: String(range || '*'),
      resolved,
      exact,
      declaredOnly
    });
  }

  // 按 prod -> dev -> optional -> peer 顺序解析
  for (const [name, range] of Object.entries(rawProd)) {
    addDep(name, range, 'prod', false);
  }
  for (const [name, range] of Object.entries(rawDev)) {
    addDep(name, range, 'dev', false);
  }
  for (const [name, range] of Object.entries(rawOpt)) {
    addDep(name, range, 'optional', false);
  }
  for (const [name, range] of Object.entries(rawPeer)) {
    addDep(name, range, 'peer', true);
  }

  const prodCount = Object.keys(rawProd).length;
  const devCount = Object.keys(rawDev).length;
  const optCount = Object.keys(rawOpt).length;
  const total = prodCount + devCount + optCount;

  return {
    lockfileType,
    hasLockfile,
    lockfileSupported,
    dependencies: items,
    depCounts: {
      prod: prodCount,
      dev: devCount,
      optional: optCount,
      total
    },
    isEmpty: total === 0
  };
}
