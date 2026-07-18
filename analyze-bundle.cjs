const fs = require('fs');
const html = fs.readFileSync('bundle-report.html', 'utf8');

const start = html.indexOf('const data = ') + 'const data = '.length;
let depth = 0, i = start, end = -1;
for (; i < html.length; i++) {
  if (html[i] === '{') depth++;
  else if (html[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const data = JSON.parse(html.substring(start, end));

// nodeParts: uid -> { renderedLength, gzipLength, brotliLength, metaUid }
// nodeMetas: uid -> { id (full path), imported, importedBy, ... }
// tree uid references link to nodeParts

const parts = data.nodeParts;   // uid -> sizes
const metas = data.nodeMetas;   // uid -> { id: full module path }

// Build uid -> name from metas
const uidToName = {};
Object.entries(metas || {}).forEach(([uid, meta]) => {
  uidToName[uid] = meta.id || uid;
});

// Collect all leaf nodes with uid from the tree
const flat = [];
function walk(node) {
  if (node.uid !== undefined) {
    const part = parts[node.uid];
    if (part && part.renderedLength > 0) {
      flat.push({
        name: uidToName[part.metaUid] || node.name || node.uid,
        renderedLength: part.renderedLength,
        gzipLength: part.gzipLength || 0,
      });
    }
  }
  if (node.children) node.children.forEach(walk);
}
walk(data.tree);

flat.sort((a, b) => b.renderedLength - a.renderedLength);

function shorten(name) {
  return name
    .replace(/.*node_modules[/\\]/, '')
    .replace(/.*imoflex_corrige[/\\]src[/\\]/, 'src/')
    .replace(/\u0000/, '');
}

const totalRendered = flat.reduce((s, x) => s + x.renderedLength, 0);
const totalGzip = flat.reduce((s, x) => s + x.gzipLength, 0);

console.log('\n=== TOP 30 HEAVIEST MODULES (rendered) ===');
flat.slice(0, 30).forEach(x => {
  const kb = (x.renderedLength / 1024).toFixed(1);
  const gz = (x.gzipLength / 1024).toFixed(1);
  const pct = ((x.renderedLength / totalRendered) * 100).toFixed(1);
  console.log(`${kb.padStart(8)} KB  (gz:${gz.padStart(6)} KB) ${pct.padStart(5)}%  ${shorten(x.name)}`);
});

console.log('\n=== BY PACKAGE (aggregated, rendered size) ===');
const pkgs = {};
flat.forEach(x => {
  const m = x.name.match(/node_modules[/\\]([^/\\]+)/);
  const isSrc = /imoflex_corrige[/\\]src/.test(x.name) || /\u0000/.test(x.name) === false && !x.name.includes('node_modules');
  const pkg = m ? m[1] : (x.name.includes('/src/') || x.name.includes('\\src\\') ? '[app code]' : '[vite/polyfill]');
  pkgs[pkg] = (pkgs[pkg] || 0) + x.renderedLength;
});
Object.entries(pkgs).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([pkg, sz]) => {
  const pct = ((sz / totalRendered) * 100).toFixed(1);
  console.log(`${(sz / 1024).toFixed(1).padStart(8)} KB  ${pct.padStart(5)}%  ${pkg}`);
});

console.log('\n--- Summary ---');
console.log('Total modules:', flat.length);
console.log('Total rendered:', (totalRendered / 1024).toFixed(0) + ' KB');
console.log('Total gzip:    ', (totalGzip / 1024).toFixed(0) + ' KB');
