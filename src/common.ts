import { CreateIndexesOptions, IndexSpecification, ObjectId, Long } from 'mongodb';
import { ValidateBy, buildMessage, ValidationOptions, validate as cvValidate, ValidationArguments, ValidateNested } from 'class-validator';
import { Service } from 'typedi';
import { Transform, Type, plainToInstance } from 'class-transformer';
import { ISchemaConverters } from 'class-validator-jsonschema/build/defaultConverters';
import { JSONSchema } from 'class-validator-jsonschema';

export const AdditionalInputTypes: ISchemaConverters = {
  ToMongoId: {
    description: 'A mongo id',
    type: 'string'
  },
  ToMongoLong: {
    description: 'An long integer value',
    type: 'number'
  },
  OneOf: (meta) => ({
    description: 'Any one of these two inputs is valid',
    oneOf: meta.constraints.map((e) => e.name)
  })
};

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
  set(key: string, value: string) {
    this._headers[key] = value;
  }
  project: null | Record<string, any>;
  [K: string]: any;
}

export type useGuardFn = (ctx: Ctx, args: any[]) => boolean | Promise<boolean>;

async function handleGuard(fns: useGuardFn[], original: Function, self: object & { ctx: Ctx }, args: any[]) {
  // Needs to be done in series and not parallel
  for (const fn of fns) {
    const isValid = await fn(self.ctx, args);
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
        name: 'ToMongoId',
        validator: {
          validate: (value: string | ObjectId) => ObjectId.isValid(value),
          defaultMessage: buildMessage((eachPrefix) => eachPrefix + '$property must be a mongodb id', validationOptions)
        }
      },
      validationOptions
    )(object, propertyName);
    return Transform(
      ({ value }) => (Array.isArray(value) ? value.map((v) => ObjectId.createFromHexString(v)) : ObjectId.createFromHexString(value)),
      { toClassOnly: true }
    )(object, propertyName);
  };
}

export function ToMongoLong(unsigned = true, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    ValidateBy(
      {
        name: 'ToMongoLong',
        validator: {
          validate: (value: number) => !isNaN(value),
          defaultMessage: buildMessage((eachPrefix) => eachPrefix + '$property must be a number', validationOptions)
        }
      },
      validationOptions
    )(object, propertyName);
    return Transform(({ value }) => (Array.isArray(value) ? value.map((v) => Long.fromNumber(v, unsigned)) : Long.fromNumber(value, unsigned)), {
      toClassOnly: true
    })(object, propertyName);
  };
}

export function OneOf(instanceOf: { new (...args: any[]) }[], validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    async function validate(value: any, validationArguments: ValidationArguments): Promise<boolean> {
      let isValid = false;
      for (const ins of validationArguments.constraints) {
        if (isValid) break;
        const init = plainToInstance(ins, value, { exposeUnsetFields: false });
        const errors = await cvValidate(init);
        isValid = !errors.length;
      }
      return isValid;
    }
    return ValidateBy(
      {
        name: 'OneOf',
        constraints: instanceOf,
        validator: {
          validate,
          defaultMessage: buildMessage((eachPrefix) => eachPrefix + '$property must be a mongodb id', validationOptions)
        }
      },
      validationOptions
    )(object, propertyName);
  };
}

export function ValidateInstaneOf(instance: new (...args: any[]) => any, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    Type(() => instance, { keepDiscriminatorProperty: true })(object, propertyName);
    return ValidateNested(validationOptions)(object, propertyName);
  };
}

export function isObjectEmpty(object: Record<string, any>) {
  if (!object) return false;
  return !Object.keys(object).length;
}

export const JsonSchema = JSONSchema;
