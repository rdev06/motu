import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Container } from 'typedi';
import { GeneralResponse, HttpException, IEntity } from './common';
import MongoLoader from './MongoLoader';
import { INested, calculateNestedProjection, extractArgsNameFromFn, filterNil, processNestedResponse } from './utils';

export interface IOption {
  description?: string;
  type?: IEntity;
  isArray?: boolean;
}

export const Modules: Record<
  string,
  Record<'query' | 'mutation' | 'subscription', Record<string, Pick<IOption, 'description' | 'isArray'> & { input: any[]; type: string }>>
> = {};

function serveType(q: 'query' | 'mutation', option: IOption) {
  return function (target: any, propertyName: string, descriptor: TypedPropertyDescriptor<any>) {
    if (!Modules[target.constructor.name]) Modules[target.constructor.name] = { query: {}, mutation: {}, subscription: {} };
    Modules[target.constructor.name][q][propertyName] = {
      input: [],
      description: option.description,
      type: option.type?.name || GeneralResponse.name,
      isArray: option.isArray || false
    };
    const args = extractArgsNameFromFn(target[propertyName]);
    const parameterTypes: any[] = Reflect.getOwnMetadata('design:paramtypes', target, propertyName);
    for (let i = 0; i < parameterTypes.length; i++) {
      Modules[target.constructor.name][q][propertyName].input.push({name: args[i], type: parameterTypes[i].name});
    }
    const method = descriptor.value!;
    descriptor.value = async function (...args) {
      for (let i = 0; i < parameterTypes.length; i++) {
        const type = parameterTypes[i];
        if (!args[i]) {
          if (['String', 'Number', 'Boolean', 'Date', 'Array'].includes(type.name)) {
            args[i] = type();
          } else if (type.name === 'ID'){
            //@ts-ignore
            args[i] = ID()
          }else {
            args[i] = {};
          }
        }
        const init = type.name === 'ObjectId' ? new type(args[i]) : plainToInstance(type, args[i], { exposeUnsetFields: false });
        const typeOf = typeof init;
        if (typeOf === 'string' && init === '[object Object]') {
          throw new HttpException(`You sent an object as an argument at index ${i} but ${type.name} is required. Kindle refer to api docs`, 400, {
            meta: init
          });
        }
        if (typeOf === 'object') {
          const errors = await validate(init);
          if (errors.length > 0) {
            throw errors;
          }
        }
        args[i] = filterNil(init);
      }
      const nestedProject: INested = calculateNestedProjection(this.ctx.project, option.type.name);
      this.ctx.project = nestedProject.project;
      let toReturn = await method.apply(this, args);
      if (nestedProject.nested) {
        const loader = Container.get(MongoLoader);
        await processNestedResponse(toReturn, nestedProject.nested, option.isArray, loader);
      }
      return toReturn;
    };
  };
}

export const query = (option: IOption) => serveType('query', option);
export const mutation = (option: IOption) => serveType('mutation', option);
