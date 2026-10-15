// Lighthouse CI (npm run lighthouse): mide velocidad, accesibilidad y buenas prácticas de las tres apps.
// Solo avisa (warn): no frena la publicación. Los informes quedan en .lighthouseci/
// Para correrlo en otro computador con Chromium propio: CHROME_PATH=/ruta/al/chromium npm run lighthouse
const fs = require('node:fs');
const chromePath = process.env.CHROME_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const avisar = minimo => ['warn', { minScore: minimo }];

module.exports = {
  ci: {
    collect: {
      staticDistDir: '.',
      url: ['/equipos/index.html', '/entregas/index.html', '/evidencias/index.html'],
      numberOfRuns: 1,
      chromePath,
      settings: {
        chromeFlags: '--no-sandbox --disable-dev-shm-usage --headless=new',
        preset: 'desktop',
        skipAudits: ['is-on-https', 'redirects-http', 'uses-http2']
      }
    },
    assert: {
      assertions: {
        'categories:performance': avisar(0.8),
        'categories:accessibility': avisar(0.95),
        'categories:best-practices': avisar(0.9),
        'categories:seo': 'off'
      }
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' }
  }
};
