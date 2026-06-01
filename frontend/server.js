/**
 * ╔══════════════════════════════════════════════════════╗
 *  ⚡ AuraJS — server.js
 *  Serveur adapté pour Vercel
 * ╚══════════════════════════════════════════════════════╝
 */
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname);

const MIME = {
  '.aura' : 'text/html',
  '.html' : 'text/html',
  '.js'   : 'application/javascript',
  '.css'  : 'text/css',
  '.json' : 'application/json',
  '.png'  : 'image/png',
  '.jpg'  : 'image/jpeg',
  '.jpeg' : 'image/jpeg',
  '.svg'  : 'image/svg+xml',
  '.ico'  : 'image/x-icon',
  '.woff' : 'font/woff',
  '.woff2': 'font/woff2',
};

// ── Trouve un fichier en tenant compte de la casse (Linux/Vercel)
function findFile(filePath) {
  if (fs.existsSync(filePath)) return filePath;
  const dir  = path.dirname(filePath);
  const base = path.basename(filePath);
  try {
    const files = fs.readdirSync(dir);
    const found = files.find(f => f.toLowerCase() === base.toLowerCase());
    if (found) return path.join(dir, found);
  } catch {}
  return null;
}

// ── Résout un include et retourne le contenu du fichier
function resolveIncludePath(includePath, baseDir) {
  const candidates = [
    path.resolve(baseDir, includePath),
    path.join(ROOT, includePath),
    path.join(ROOT, 'src', 'includes', path.basename(includePath)),
    path.join(ROOT, 'src', 'includes', includePath),
    path.join(ROOT, 'components', path.basename(includePath)),
  ];
  for (const c of candidates) {
    const found = findFile(c);
    if (found) return found;
  }
  return null;
}

// ── Résout les includes récursivement
function resolveIncludes(content, baseDir) {
  return content.replace(/include\s*['"]([^'"]+)['"]/g, (match, includePath) => {
    const found = resolveIncludePath(includePath, baseDir);
    if (found) {
      const includeContent = fs.readFileSync(found, 'utf-8');
      return resolveIncludes(includeContent, path.dirname(found));
    }
    console.warn(`[AuraJS] Include introuvable : ${includePath} (depuis ${baseDir})`);
    return `<!-- include introuvable : ${includePath} -->`;
  });
}

// ── Remplace les blocs <aura> qui contiennent UNIQUEMENT des includes
// par leur contenu résolu (sans la balise <aura>)
// Les blocs <aura> avec du vrai code Aura sont laissés intacts
function resolveAuraIncludeBlocks(content, baseDir) {
  return content.replace(/<aura>([\s\S]*?)<\/aura>/gi, (match, inner) => {
    const trimmed = inner.trim();
    // Ce bloc contient uniquement des includes → on les résout et on retire <aura>
    if (/^(include\s*['"][^'"]+['"]\s*)+$/.test(trimmed)) {
      return resolveIncludes(trimmed, baseDir);
    }
    // Ce bloc contient du vrai code Aura → on laisse intact
    // mais on résout quand même les includes dedans s'il y en a
    const resolved = resolveIncludes(trimmed, baseDir);
    return `<aura>${resolved}</aura>`;
  });
}

// ── Résout les includes hors des blocs <aura> (dans le body directement)
function resolveLooseIncludes(content, baseDir) {
  // Remplace les includes qui ne sont pas dans un bloc <aura>
  // On fait ça en traitant le contenu hors des balises <aura>
  const parts = content.split(/(<aura>[\s\S]*?<\/aura>)/gi);
  return parts.map((part, i) => {
    // Les parties impaires sont les blocs <aura> → ne pas toucher
    if (part.match(/^<aura>/i)) return part;
    // Les parties paires sont hors <aura> → résoudre les includes
    return resolveIncludes(part, baseDir);
  }).join('');
}

// ── Corrige les chemins assets relatifs (src, href pour css/js/images)
function fixAssetPaths(content, requestPath) {
  const dir = path.posix.dirname(requestPath);
  if (dir === '/' || dir === '.') return content;

  return content
    .replace(/src="([^"]+)"/g, (match, src) => {
      if (src.startsWith('/') || src.startsWith('http') || src.startsWith('data:')) return match;
      return `src="${path.posix.normalize(path.posix.join(dir, src))}"`;
    })
    .replace(/href="([^"#][^"]*\.(css|woff|woff2|ico|png|jpg|jpeg|svg))"/g, (match, href) => {
      if (href.startsWith('/') || href.startsWith('http')) return match;
      return `href="${path.posix.normalize(path.posix.join(dir, href))}"`;
    });
}

// ── Corrige les liens .aura relatifs
function fixAuraLinks(content, requestPath) {
  const dir = path.posix.dirname(requestPath);

  return content.replace(/href="([^"#/][^"]*\.aura[^"]*)"/g, (match, href) => {
    if (href.startsWith('/') || href.startsWith('http')) return match;
    const absolute = path.posix.normalize(path.posix.join(dir, href));
    return `href="${absolute}"`;
  });
}

// ── Injecte le flag avant aura.js
function injectFlag(content) {
  if (content.includes('__AURA_SERVER_RENDERED__')) return content;
  const flag = '<script>window.__AURA_SERVER_RENDERED__=true;</script>';
  const auraScriptRegex = /(<script[^>]+aura\.js[^>]*>)/i;
  if (auraScriptRegex.test(content)) return content.replace(auraScriptRegex, flag + '$1');
  if (content.includes('</head>')) return content.replace('</head>', flag + '</head>');
  return flag + content;
}

// ── Handler Vercel
module.exports = (req, res) => {
  let urlPath = req.url.split('?')[0];

  if (urlPath === '/' || urlPath === '') urlPath = '/index.aura';

  let filePath = findFile(path.join(ROOT, urlPath));

  // Fallbacks
  if (!filePath) {
    const fallbacks = [
      path.join(ROOT, 'pages', path.basename(urlPath)),
      path.join(ROOT, urlPath.replace(/^\//, '') + '.aura'),
      path.join(ROOT, '404.aura'),
    ];
    for (const f of fallbacks) {
      const found = findFile(f);
      if (found) { filePath = found; break; }
    }
  }

  const ext  = filePath ? (path.extname(filePath) || '.aura') : '.aura';
  const mime = MIME[ext] || 'text/plain';

  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html><body style="background:#06030a;color:#e02020;font-family:monospace;padding:3rem;text-align:center">
        <h1 style="font-size:5rem">404</h1>
        <p>Fichier introuvable : ${urlPath}</p>
        <a href="/" style="color:#a78bfa">← Accueil</a>
      </body></html>
    `);
    return;
  }

  try {
    if (ext === '.aura') {
      const baseDir = path.dirname(filePath);
      let content = fs.readFileSync(filePath, 'utf-8');

      // 1. Résoudre les blocs <aura> contenant des includes → retire les balises <aura>
      content = resolveAuraIncludeBlocks(content, baseDir);

      // 2. Résoudre les includes hors des blocs <aura>
      content = resolveLooseIncludes(content, baseDir);

      // 3. Corriger les chemins assets relatifs
      content = fixAssetPaths(content, urlPath);

      // 4. Corriger les liens .aura relatifs
      content = fixAuraLinks(content, urlPath);

      // 5. Injecter le flag
      content = injectFlag(content);

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(content);

    } else {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': mime + (mime.startsWith('text') ? '; charset=utf-8' : ''),
        'Cache-Control': 'no-cache',
      });
      res.end(content);
    }

  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>500 Erreur serveur</h1><pre>${e.message}</pre>`);
  }
};