import fs from 'fs/promises';

let paths = ['dist'];
const cwd = process.cwd().split('/').at(-1);
if(cwd != 'motu'){
    paths = paths.concat(['src', 'tsconfig.json'])
}

paths.forEach(e => fs.rm(e, {force: true, recursive: true}).catch(console.error));