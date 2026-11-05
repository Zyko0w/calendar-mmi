// Copie shared/core.js dans les deux apps (le bundler mobile et Tauri ne lisent pas hors de leur dossier).
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
for (const dest of ['desktop/web/core.js', 'mobile/src/core.js']) {
  copyFileSync(root + 'shared/core.js', root + dest);
  console.log('core.js →', dest);
}
