/**
 * ╔══════════════════════════════════════════════════════╗
 *  AuraJS — aura-run.js
 *  Serveur local pour fichiers .aura
 *  Usage : node aura-run.js
 * ╚══════════════════════════════════════════════════════╝
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = process.cwd();
const API_BACKEND = 'http://localhost:5000';

// ── Types MIME
const MIME = {
    '.aura': 'text/html',
    '.html': 'text/html',
    '.js'  : 'application/javascript',
    '.css' : 'text/css',
    '.json': 'application/json',
    '.png' : 'image/png',
    '.jpg' : 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg' : 'image/svg+xml',
    '.ico' : 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
};

// ── Couleurs terminal
const green  = (t) => `\x1b[32m${t}\x1b[0m`;
const red    = (t) => `\x1b[31m${t}\x1b[0m`;
const purple = (t) => `\x1b[35m${t}\x1b[0m`;
const dim    = (t) => `\x1b[2m${t}\x1b[0m`;
const bold   = (t) => `\x1b[1m${t}\x1b[0m`;

// ── Clients SSE pour Live Reload
const sseClients = [];

// ── Observateur de fichiers pour Live Reload
let watchTimeout;
try {
    fs.watch(ROOT, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        if (filename.includes('.git') || filename.includes('storage') || filename.includes('node_modules')) {
            return;
        }
        clearTimeout(watchTimeout);
        watchTimeout = setTimeout(() => {
            sseClients.forEach(client => {
                try { client.write('data: reload\n\n'); } catch (e) {}
            });
        }, 100);
    });
} catch (e) {
    console.log(`${red('[ERROR]')} Impossible d'initialiser fs.watch : ${e.message}`);
}

// ── Serveur
const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];

    // Endpoint Live Reload
    if (urlPath === '/__live-reload') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        res.write('\n');
        sseClients.push(res);
        req.on('close', () => {
            const index = sseClients.indexOf(res);
            if (index !== -1) sseClients.splice(index, 1);
        });
        return;
    }

    // Dynamic Bundler pour le moteur AuraJS (sans node_modules)
    if (urlPath === '/aura/index.js' || urlPath === '/index.js') {
        const files = [
            'variables/constants.js', 'variables/scopeManager.js',
            'errors/errorHandler.js', 'errors/runtimeErrors.js', 'errors/syntaxErrors.js',
            'core/context.js',
            'security/sanitizer.js',
            'events/eventBus.js',
            'reactivity/reactiveBindings.js', 'reactivity/domDirectives.js',
            'reactivity/domUpdater.js', 'reactivity/reactiveStore.js',
            'includes/includeLoader.js',
            'http/httpClient.js',
            'components/componentScope.js', 'components/slotRenderer.js',
            'components/componentLifecycle.js',
            'utils/mathUtils.js', 'utils/stringUtils.js', 'utils/logger.js', 'utils/templateUtils.js',
            'arrays/arrayManager.js', 'arrays/arrayMethods.js', 'arrays/arrayUtils.js',
            'memory/memoryStorage.js', 'memory/cacheManager.js', 'memory/garbageCollector.js',
            'loops/loopControl.js', 'loops/forLoop.js', 'loops/whileLoop.js',
            'conditions/booleanLogic.js', 'conditions/comparison.js', 'conditions/ifHandler.js',
            'variables/variableManager.js', 'functions/paramsHandler.js', 'functions/returnHandler.js',
            'functions/functionManager.js', 'core/tokenizer.js', 'core/parser.js',
            'core/componentSystem.js', 'core/renderer.js', 'core/executor.js',
            'core/interpreter.js', 'index.js'
        ];

        let merged = files.map(f => {
            try { return fs.readFileSync(path.join(ROOT, 'aura', f), 'utf-8'); } catch(e) { return ''; }
        }).join('\n\n');

        // Imports require (une ou plusieurs lignes) — les classes restent dans le même IIFE
        merged = merged.replace(
            /^[ \t]*(?:const|let|var)\s+[\w{},\s]+\s*=\s*typeof\s+require\s*!==\s*['"]undefined['"]\s*\?[\s\S]*?;\s*\n/gm,
            ''
        );

        // Désactive les branches Node : if (module) / if (require) → if (false)
        // Le else { window.AuraEngine… } de index.js s'exécute dans le navigateur
        merged = merged.replace(/typeof\s+module\s*!==\s*['"]undefined['"]/g, 'false');
        merged = merged.replace(/typeof\s+require\s*!==\s*['"]undefined['"]/g, 'false');

        merged = `(function() {\n${merged}\n})();`;

        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(merged);
        console.log(`  [200] GET \x1b[35m${req.url}\x1b[0m (Dynamic AuraJS Engine)`);
        return;
    }

    // Proxy API → backend (évite CORS en dev : même origine localhost:3000)
    if (urlPath.startsWith('/api/')) {
        const proxy = http.request(
            { hostname: 'localhost', port: 5000, path: req.url, method: req.method, headers: req.headers },
            (proxyRes) => {
                res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
                proxyRes.pipe(res);
            }
        );
        proxy.on('error', () => {
            res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: 'Backend indisponible — lancer le serveur sur le port 5000' }));
            console.log(`  [502] ${req.method} ${urlPath} (proxy → ${API_BACKEND})`);
        });
        req.pipe(proxy);
        return;
    }

    // / → index.aura
    if (urlPath === '/' || urlPath === '') urlPath = 'index.aura';

    // Résolution du fichier
    let filePath = path.join(ROOT, urlPath);

    // Fallbacks
    if (!fs.existsSync(filePath)) {
        const fallbacks = [
            path.join(ROOT, 'src', 'views', path.basename(urlPath)),
            path.join(ROOT, 'src', 'views', urlPath.replace('/', '') + '.aura'),
            path.join(ROOT, 'pages', path.basename(urlPath)),
            path.join(ROOT, urlPath.replace('/', '') + '.aura'),
            path.join(ROOT, 'src', 'views', '404.aura'),
            path.join(ROOT, '404.aura'),
        ];
        filePath = fallbacks.find(f => fs.existsSync(f)) || filePath;
    }

    const ext  = path.extname(filePath) || '.aura';
    const mime = MIME[ext] || 'text/plain';

    // Fichier introuvable
    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
            <html><body style="background:#0c0c0e;color:#ef4444;font-family:monospace;padding:3rem;text-align:center">
                <h1 style="font-size:5rem;margin:0">404</h1>
                <p>Fichier introuvable : ${urlPath}</p>
                <a href="/" style="color:#a78bfa">Retour</a>
            </body></html>
        `);
        console.log(`  [404] ${urlPath}`);
        return;
    }

    // Servir le fichier
    try {
        let content = fs.readFileSync(filePath);

        if (ext === '.aura' || ext === '.html') {
            let htmlStr = content.toString('utf-8');
            const injectScript = `
<!-- AuraJS Dev Tools -->
<script>
(function() {
  /* ── LIVE RELOAD ── */
  let es;
  function connect() {
    es = new EventSource('/__live-reload');
    es.onmessage = function(e) {
      if (e.data === 'reload') window.location.reload();
    };
    es.onerror = function() {
      es.close();
      setTimeout(connect, 1000);
    };
  }
  connect();
})();
</script>
`;
            if (htmlStr.includes('</head>')) {
                htmlStr = htmlStr.replace('</head>', `${injectScript}</head>`);
            } else if (htmlStr.includes('</body>')) {
                htmlStr = htmlStr.replace('</body>', `${injectScript}</body>`);
            } else {
                htmlStr += injectScript;
            }
            content = Buffer.from(htmlStr, 'utf-8');
        }

        res.writeHead(200, {
            'Content-Type': mime + (mime.startsWith('text') ? '; charset=utf-8' : ''),
            'Cache-Control': 'no-cache',
        });
        res.end(content);
        console.log(`  [200] ${req.method} ${purple(req.url)}`);
    } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>500 Erreur serveur</h1><pre>${e.message}</pre>`);
        console.log(`  [500] ${req.url} — ${e.message}`);
    }
});

// ── Démarrage
server.listen(PORT, () => {
    console.log('');
    console.log(purple(bold('  AuraJS — Serveur de développement')));
    console.log('');
    console.log(`  Local :   ${bold(`http://localhost:${PORT}`)}`);
    console.log(`  Racine :  ${dim(ROOT)}`);
    console.log('');
    console.log(dim('  Ctrl+C pour arrêter le serveur\n'));
});

process.on('SIGINT', () => {
    console.log('\n  Serveur arrêté.\n');
    process.exit(0);
});