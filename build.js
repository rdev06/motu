import fs from 'fs/promises';

fs.rm('dist', {force: true, recursive: true}).catch(console.error)