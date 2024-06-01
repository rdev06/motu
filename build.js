import fs from 'fs/promises';

await fs.rm('dist', {force: true, recursive: true}).catch(console.error)