import { getMetadataStorage, IsOptional } from 'class-validator';
import { Filter } from 'mongodb';
import { IEntity, ToDate, ToMongoId } from './common';

export type Type<T = any> = new (...args: any[]) => T;

export function GetShallowClass<T>(classRef: Type<T>): { class: Type<T>; keys: Set<string> } {
  abstract class ShallowClass extends (classRef as any) {}
  const validationMetas = getMetadataStorage().getTargetValidationMetadatas(ShallowClass, ShallowClass.name, true, false);
  const keys = new Set(validationMetas?.map((meta) => meta.propertyName));
  return { class: ShallowClass as Type<T>, keys };
}

export function inheritMetaValidators(fromRef: Type, toRef: Function, toInherit: (key: string) => boolean) {
  const MetaStorage = getMetadataStorage();
  const validationMetas = MetaStorage.getTargetValidationMetadatas(fromRef, fromRef.name, true, false);
  validationMetas.forEach((meta) => {
    if (toInherit(meta.propertyName)) {
      MetaStorage.addValidationMetadata({ ...meta, target: toRef });
    }
  });
}

export function PartialType<T>(classRef: Type<T>): Type<Partial<T>> {
  const shallow = GetShallowClass(classRef);

  shallow.keys.forEach((k: string) => {
    IsOptional()(shallow.class.prototype, k);
  });

  return shallow.class as Type<Partial<T>>;
}

export function PickPartialType<T, K extends keyof T>(classRef: Type<T>, picks: readonly K[]): Type<T & Partial<Pick<T, K>>> {
  const shallow = GetShallowClass(classRef);

  picks.forEach((k) => {
    IsOptional()(shallow.class.prototype, k as string);
  });

  return shallow.class as Type<T & Partial<Pick<T, K>>> ;
}

export function PickType<T, K extends keyof T>(classRef: Type<T>, picks: readonly K[]): Type<Pick<T, (typeof picks)[number]>> {
  abstract class PickTypeClass {}
  const toInherit = (key: string): boolean => {
    return picks.includes(key as K);
  };
  inheritMetaValidators(classRef, PickTypeClass, toInherit);
  return PickTypeClass as Type<Pick<T, (typeof picks)[number]>>;
}

export function OmitType<T, K extends keyof T>(classRef: Type<T>, omits: readonly K[]): Type<Omit<T, (typeof omits)[number]>> {
  abstract class OmitTypeClass {}
  const toInherit = (key: string): boolean => {
    return !omits.includes(key as K);
  };
  inheritMetaValidators(classRef, OmitTypeClass, toInherit);
  return OmitTypeClass as Type<Omit<T, (typeof omits)[number]>>;
}

export function IntersectionType<A, B>(classARef: Type<A>, classBRef: Type<B>): Type<A & B> {
  abstract class IntersectionTypeClass extends (classARef as any) {}
  const toInherit = () => true;
  inheritMetaValidators(classBRef, IntersectionTypeClass, toInherit);
  return IntersectionTypeClass as Type<A & B>;
}
export function filterQueryClass<T>(entity: IEntity): Type<Filter<T>> {
  abstract class FindQueryClass {}
  const keys = new Set(['_id', ...Object.keys(entity.schema.properties)]);
  for (const k of keys) {
    Object.defineProperty(FindQueryClass.prototype, k, {writable: true})
    const thisField = entity.schema.properties[k];
    if(thisField.bsonType === 'objectId' || (thisField.bsonType === 'array' && thisField.items.bsonType === 'objectId')){
      ToMongoId({each: thisField.bsonType === 'array'})(FindQueryClass.prototype, k);
    }
    if(thisField.bsonType === 'date' || (thisField.bsonType === 'array' && thisField.items.bsonType === 'objectId')){
      ToDate({each: thisField.bsonType === 'array'})(FindQueryClass.prototype, k);
    }
  }
  return FindQueryClass as Type<Filter<T>>;
}