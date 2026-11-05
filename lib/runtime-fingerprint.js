import fs from 'node:fs';
import path from 'node:path';

/**
 * 获取系统平台与架构指纹，例如 'darwin-arm64', 'linux-x64'
 */
export function getPlatformArch() {
  return `${process.platform}-${process.arch}`;
}

/**
 * 从文本声明中分析 Node 主版本与置信度
 *
 * @param {string | null} rawDeclared
 * @param {string} [platform]
 * @returns {{ confidence: 'exact' | 'multi' | 'missing', major: number | null, bucket: string }}
 */
export function parseNodeVersion(rawDeclared, platform = getPlatformArch()) {
  if (!rawDeclared || typeof rawDeclared !== 'string') {
    return {
      confidence: 'missing',
      major: null,
      bucket: 'unknown'
    };
  }

  const trimmed = rawDeclared.trim().replace(/^[vV]/, '');
  if (!trimmed) {
    return {
      confidence: 'missing',
      major: null,
      bucket: 'unknown'
    };
  }

  // 多版本或宽松范围检测: ||, *, latest, 纯 >= 范围
  const isMulti =
    trimmed.includes('||') ||
    trimmed.includes('*') ||
    trimmed.toLowerCase() === 'latest' ||
    (/^\s*>=\s*\d+/.test(trimmed) && !trimmed.includes('<'));

  if (isMulti) {
    return {
      confidence: 'multi',
      major: null,
      bucket: `${platform}-node-multi`
    };
  }

  // 单一确定主版本匹配，如 '20', '20.11.1', '^20.0.0', '~20.10.0', '24.19.0', '=20'
  const match = trimmed.match(/^[\^~=]?\s*(\d+)/);
  if (match) {
    const major = parseInt(match[1], 10);
    return {
      confidence: 'exact',
      major,
      bucket: `${platform}-node${major}`
    };
  }

  return {
    confidence: 'multi',
    major: null,
    bucket: `${platform}-node-multi`
  };
}

/**
 * 提取目标项目的运行环境指纹 (Runtime Fingerprint)
 * 优先级链: .nvmrc > .node-version > engines.node > .tool-versions > mise.toml
 *
 * @param {string} projectDir 项目所在绝对目录
 * @param {Record<string, any>} [pkgJson] 可选 package.json 对象
 * @returns {import('./types.js').RuntimeFingerprint}
 */
export function extractFingerprint(projectDir, pkgJson = null) {
  const platform = getPlatformArch();

  let declared = null;
  let source = 'none';

  // 1. .nvmrc
  const nvmrcPath = path.join(projectDir, '.nvmrc');
  if (fs.existsSync(nvmrcPath)) {
    try {
      const content = fs.readFileSync(nvmrcPath, 'utf8').trim().split(/\r?\n/)[0].trim();
      if (content) {
        declared = content.replace(/^[vV]/, '');
        source = '.nvmrc';
      }
    } catch {}
  }

  // 2. .node-version
  if (!declared) {
    const nodeVersionPath = path.join(projectDir, '.node-version');
    if (fs.existsSync(nodeVersionPath)) {
      try {
        const content = fs.readFileSync(nodeVersionPath, 'utf8').trim().split(/\r?\n/)[0].trim();
        if (content) {
          declared = content.replace(/^[vV]/, '');
          source = '.node-version';
        }
      } catch {}
    }
  }

  // 3. package.json 中的 engines.node
  if (!declared) {
    let pkg = pkgJson;
    if (!pkg) {
      const pkgPath = path.join(projectDir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        } catch {}
      }
    }
    if (pkg && pkg.engines && typeof pkg.engines.node === 'string' && pkg.engines.node.trim()) {
      declared = pkg.engines.node.trim();
      source = 'engines.node';
    }
  }

  // 4. .tool-versions 中的 nodejs 行
  if (!declared) {
    const toolVersionsPath = path.join(projectDir, '.tool-versions');
    if (fs.existsSync(toolVersionsPath)) {
      try {
        const lines = fs.readFileSync(toolVersionsPath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          const m = line.trim().match(/^nodejs\s+([^\s#]+)/);
          if (m && m[1]) {
            declared = m[1].replace(/^[vV]/, '');
            source = '.tool-versions';
            break;
          }
        }
      } catch {}
    }
  }

  const { confidence, major, bucket } = parseNodeVersion(declared, platform);

  return {
    declared,
    source,
    confidence,
    bucket,
    platform,
    major,
    note: confidence === 'missing' ? '未声明 Node 版本规范' : null
  };
}
