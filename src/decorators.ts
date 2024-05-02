import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import OmitBy from 'lodash.omitby';
import isNil from 'lodash.isnil';
import { Container } from 'typedi';
import { IEntity } from './common';
import MongoLoader from './MongoLoader';
import { INested, calculateNestedProjection, processNestedResponse } from './utils';

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
      type: option.type.name,
      isArray: option.isArray || false
    };
    const parameterTypes: any[] = Reflect.getOwnMetadata('design:paramtypes', target, propertyName);
    for (const type of parameterTypes) {
      Modules[target.constructor.name][q][propertyName].input.push(type.name);
    }
    const method = descriptor.value!;
    descriptor.value = async function (...args) {
      for (let i = 0; i < parameterTypes.length; i++) {
        const type = parameterTypes[i];
        if (typeof type === 'function' && type.prototype !== undefined && typeof args[i] === 'object') {
          const init = plainToInstance(type, args[i] || {}, { exposeUnsetFields: false });
          const errors = await validate(init);
          if (errors.length > 0) {
            throw errors;
          }
          args[i] = OmitBy(init, isNil);
        }
      }
      const nestedProject: INested = calculateNestedProjection(this.ctx.project, option.type.name);
      this.ctx.project = nestedProject.project;
      let toReturn = await method.apply(this, args);
      if(nestedProject.nested){
        const loader = Container.get(MongoLoader);
        await processNestedResponse(toReturn, nestedProject.nested, option.isArray, loader);
      }
      return toReturn;
    };
  };
}

export const query = (option: IOption) => serveType('query', option);
export const mutation = (option: IOption) => serveType('mutation', option);
