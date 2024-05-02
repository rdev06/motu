import { CreateIndexesOptions, IndexSpecification, ObjectId, Long } from 'mongodb';
import { ValidateBy, buildMessage, ValidationOptions } from 'class-validator';
import { Service } from 'typedi';
import { Transform } from 'class-transformer';
import Omit from 'lodash.omit';
import { ISchemaConverters } from 'class-validator-jsonschema/build/defaultConverters';


const AdditionalInputTypes = {
  ToMongoId: {
    name: 'ToMongoId',
    description: 'A mongo id',
    type: 'string'
  },
  ToMongoLong: {
    name: 'ToMongoLong',
    description: 'An long integer value',
    type: 'number'
  }
}

export const additionalConverters = (): ISchemaConverters => {
  const toReturn: ISchemaConverters = {};
  for (const key in AdditionalInputTypes) {
    toReturn[key] = Omit(AdditionalInputTypes[key], ['name'])
  }
  return toReturn;
}


export class HttpException extends Error {
  status: number;
  meta: any;
  constructor(message: string, status: number, meta?: any) {
    super(message);
    this.status = status;
    this.meta = meta;
  }
}

export class NotFoundException extends HttpException {
  constructor(message: string) {
    super(message, 404);
  }
}
@Service()
export class Ctx {
  headers: Record<string, string>;
  _headers: Record<string, string | string[]>;
  status: number;
  set(key: string, value: string){
    this._headers[key] = value
  }
  project: null | Record<string, any>;
  [K: string]: any;
}

export type useGuardFn = (ctx: Ctx) => boolean | Promise<boolean>;

async function handleGuard(fns: useGuardFn[], original: Function, self: object & { ctx: Ctx }, args: any[]) {
  // Needs to be done in series and not parallel
  for (const fn of fns) {
    const isValid = await fn(self.ctx);
    if (!isValid) {
      throw new HttpException('UnAuthorised!', 401);
    }
  }
  return original.apply(self, args);
}

export function UseGuard(fns: useGuardFn | useGuardFn[]) {
  if (!Array.isArray(fns)) {
    fns = [fns];
  }
  return function (classRef: any, propertyKey?: string, descriptor?: TypedPropertyDescriptor<any>): any {
    if (descriptor) {
      const original = descriptor.value;
      descriptor.value = function (...args: any[]) {
        return handleGuard(fns, original, this, args);
      };
      return descriptor;
    }
    const methods = Object.getOwnPropertyNames(classRef.prototype);
    for (const method of methods) {
      if (method === 'constructor') continue;
      const original = classRef.prototype[method];
      classRef.prototype[method] = function (...args: any[]) {
        return handleGuard(fns, original, this, args);
      };
    }
  };
}

export type IBsonType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'int' | 'long' | 'double' | 'decimal';

export type IEntity = {
  name: string;
  version: string;
  relation?: Record<string, any>;
  default?: Record<string, any>;
  hidden?: string[];
  indexes?: { keys: IndexSpecification; option?: CreateIndexesOptions }[];
  schema: {
    bsonType: IBsonType;
    additionalProperties?: boolean;
    title?: string;
    description?: string;
    required: string[];
    properties?: { [k: string]: any };
    items?: {
      bsonType: IBsonType;
      [k: string]: any;
    };
  };
};

export const GeneralResponse: IEntity = {
  name: 'GeneralResponse',
  version: '1.0.0',
  schema: {
    title: 'This is general Response Schema',
    bsonType: 'object',
    required: ['message'],
    properties: {
      message: {
        bsonType: 'string'
      },
      refId: {
        bsonType: 'string'
      }
    }
  }
};

export const outputSchema: Record<string, IEntity> = { GeneralResponse };

export function mapEntity(entities: IEntity[]) {
  for (const enty of entities) {
    outputSchema[enty.name] = enty;
  }
}

export function ToMongoId(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    ValidateBy(
      {
        name: AdditionalInputTypes.ToMongoId.name,
        validator: {
          validate: (value: string | ObjectId) => ObjectId.isValid(value),
          defaultMessage: buildMessage((eachPrefix) => eachPrefix + '$property must be a mongodb id', validationOptions)
        }
      },
      validationOptions
    )(object, propertyName);
    return Transform(({ value }) => ObjectId.createFromHexString(value), { toClassOnly: true })(object, propertyName);
  };
}

export function ToMongoLong(unsigned = true, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    ValidateBy(
      {
        name: AdditionalInputTypes.ToMongoLong.name,
        validator: {
          validate: (value: number) => !isNaN(value),
          defaultMessage: buildMessage((eachPrefix) => eachPrefix + '$property must be a number', validationOptions)
        }
      },
      validationOptions
    )(object, propertyName);
    return Transform(({ value }) => Long.fromNumber(value, unsigned), { toClassOnly: true })(object, propertyName);
  };
}

export function isObjectEmpty(object: Record<string, any>) {
  if (!object) return false;
  return !Object.keys(object).length;
}
