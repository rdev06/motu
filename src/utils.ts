import MongoLoader, { IProject } from './MongoLoader';
import { Ctx, isObjectEmpty, outputSchema } from './common';

function flatObjectKeys(input = {}, keys = ''): IProject {
  const toReturn = {};
  for (const key in input) {
    let newKey = keys + '.' + key;
    const value = input[key];
    if (typeof value === 'object') {
      Object.assign(toReturn, flatObjectKeys(value, newKey));
    } else {
      newKey = newKey.slice(1);
      if (typeof value === 'number') {
        toReturn[newKey] = value > 0 ? 1 : 0;
      } else if (typeof value === 'boolean') {
        toReturn[newKey] = value;
      } else if (typeof value === 'string') {
        toReturn[value] = '$' + newKey;
      } else throw `${typeof value} is not acceptable for projection parameter`;
    }
  }
  return toReturn;
}

export interface INested {
  project: Record<string, string | number | boolean>;
  nested?: {
    [k: string]: {
      relation: string;
      projection: string | number | boolean | Record<string, any>;
    };
  };
}

/**
 * Here we have to work in such a way that for those things which have relation then
 * Need to to capture their further projection but if they dont have relation then
 * Need to convert them into 'key.property': 1 regardless of how deep they are
 * */
export function calculateNestedProjection(project: Ctx['project'], entityName: string): INested {
  const entitySchema = outputSchema[entityName];
  if (entitySchema.hidden?.length) {
    if (isObjectEmpty(project)) {
      for (const f of entitySchema.hidden) {
        project[f] = 0;
      }
    } else {
      for (const f of entitySchema.hidden) {
        delete project[f];
      }
    }
  }
  if (!entitySchema.relation || !['array', 'object'].includes(entitySchema.schema.bsonType)) {
    return { project };
  }

  const nested: INested['nested'] = {};

  for (const K in project) {
    if (typeof project[K] === 'object') {
      if (entitySchema.relation[K]) {
        nested[K] = {
          relation: entitySchema.relation[K],
          projection: project[K]
        };
        project[K] = 1;
      } else {
        const toMap = flatObjectKeys(project[K]);
        delete project[K];
        Object.assign(project, toMap);
      }
    }
  }

  return { project, nested: !isObjectEmpty(nested) && nested };
}

export async function processNestedResponse(
  data: Record<string, any> | Record<string, any>[],
  nested: INested['nested'],
  isArray: boolean,
  loader: MongoLoader
) {
  if (isArray) {
    isArray = false;
    await Promise.all(data.map((d: Record<string, any>) => processNestedResponse(d, nested, false, loader)));
  }
  for (const K in nested) {
    if (data[K]) {
      const newNestedProject = calculateNestedProjection(nested[K].projection as Record<string, any>, nested[K].relation);
      const nestedData = await loader.load(data[K], nested[K].relation, K, newNestedProject.project);
      data[K] = nestedData;
      if (newNestedProject.nested) {
        return processNestedResponse(nestedData, newNestedProject.nested, Array.isArray(nestedData), loader);
      }
    }
  }
}

export function filterNil(data: object){
  if(Array.isArray(data)){
    return data.map(e => filterNil(e))
  }
  for (const k in data) {
    let value = data[k];
    if(Array.isArray(value)){
      value = filterNil(value);
      continue;
    }
    if(value === null || value === undefined || value === ''){
      delete data[k]
    }
  }
  return data;
}
