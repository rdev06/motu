import { IEntity, GeneralResponse } from './common';
import fs from 'fs';

const TypeBsonMap = {
  objectId: 'ObjectId',
  string: 'string',
  bool: 'boolean',
  int: 'number',
  long: 'number',
  decimal: 'number',
  number: 'number',
  double: 'number',
  date: 'Date'
};
const space = '  ';
const tab = (ind: number): string => Array(ind).fill(space).join('');

export function Generate(schema: any, idx = 0) {
  const ind = tab(idx);
  const isFound = TypeBsonMap[schema.bsonType];
  if (isFound) return isFound;
  let Gen = '';
  if (schema.bsonType === 'object') {
    for (const key in schema.properties) {
      if (key === '_id') continue;
      const bsonType = schema.properties[key].bsonType;
      let type;
      if (bsonType === 'object') {
        switch (true) {
          case !!schema.properties[key].oneOf:
          case !!schema.properties[key].anyOf:
            type = schema.properties[key].oneOf.map((schema) => Generate({ bsonType, ...schema })).join(' | ');
            break;
          case !!schema.properties[key].allOf:
            type = schema.properties[key].oneOf.map((schema) => Generate({ bsonType, ...schema })).join(' & ');
            break;

          default:
            type = Generate(schema.properties[key], idx + 1);
            break;
        }
      } else if (bsonType === 'array') {
        type = Generate(schema.properties[key].items, idx + 1) + '[]';
      } else {
        type = TypeBsonMap[bsonType];
        if (type === TypeBsonMap['string'] && schema.properties[key].enum) {
          type = schema.properties[key].enum.map((e) => `'${e}'`).join(' | ');
        }
      }
      Gen += `${space + ind + key}${!schema.required?.includes(key) ? '?' : ''}: ${type};\n`;
    }
    if (!schema.hasOwnProperty('additionalProperties') || schema.additionalProperties) {
      Gen += space + ind + '[K: string]: any;\n';
    }
  }
  return '{\n' + Gen + ind + '}';
}

export function SchemaTypeGenerator(toGenerate: IEntity[], fileLocation?: string): string | void {
  const schemas: IEntity[] = [GeneralResponse, ...toGenerate];
  const Types = schemas.map((e: IEntity) => `export interface I${e.name} ${Generate(e.schema)}`);
  const toWrite = `//***** This is auto generated types ***//
import type { ObjectId } from 'mongodb';

${Types.join('\n')}
// *** Please do not touch unless you know what you are doing ***//
`;
  if (fileLocation) {
    return fs.writeFileSync(fileLocation, toWrite);
  }
  return toWrite;
}
