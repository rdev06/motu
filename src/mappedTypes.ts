import { IsOptional } from 'class-validator';

import { getMetadataStorage } from 'class-validator';

export type Type<T = any> = new (...args: any[]) => T;


export function GetShallowClass<T>(classRef: Type<T>):{class: Type<T>, keys: Set<string>}{
    abstract class ShallowClass extends (classRef as any){};
    const validationMetas = getMetadataStorage().getTargetValidationMetadatas(
        ShallowClass,
        ShallowClass.name,
        true,
        false
      );
      const keys = new Set(validationMetas?.map((meta) => meta.propertyName));
    return {class: ShallowClass as Type<T>, keys}
}


export function inheritMetaValidators(fromRef: Type, toRef: Function, toInherit: (key: string) => boolean){
    const MetaStorage = getMetadataStorage();
    const validationMetas = MetaStorage.getTargetValidationMetadatas(
        fromRef,
        fromRef.name,
        true,
        false
      )
      validationMetas.forEach(meta => {
        if(toInherit(meta.propertyName)){
            MetaStorage.addValidationMetadata({...meta, target: toRef})
        }
    })
}

export function PartialType<T>(classRef: Type<T>): Type<Partial<T>> {
  const shallow = GetShallowClass(classRef);

  shallow.keys.forEach((k: string) => {
    IsOptional()(shallow.class.prototype, k);
  });

  return shallow.class as Type<Partial<T>>;
}

export function PickType<T, K extends keyof T>(
  classRef: Type<T>,
  picks: readonly K[]
): Type<Pick<T, (typeof picks)[number]>> {
  abstract class PickTypeClass{};
  const toInherit = (key: string): boolean => {
    return picks.includes(key as K)
  }
  inheritMetaValidators(classRef, PickTypeClass, toInherit);
  return PickTypeClass as Type<Pick<T, (typeof picks)[number]>>;
}

export function OmitType<T, K extends keyof T>(
    classRef: Type<T>,
    omits: readonly K[]
  ): Type<Omit<T, (typeof omits)[number]>> {
    abstract class OmitTypeClass{};
    const toInherit = (key: string): boolean => {
        return !omits.includes(key as K)
      }
    inheritMetaValidators(classRef, OmitTypeClass, toInherit);
    return OmitTypeClass as Type<Omit<T, (typeof omits)[number]>>;
  }


export function IntersectionType<A, B>(
  classARef: Type<A>,
  classBRef: Type<B>
): Type<A & B> {
  abstract class IntersectionTypeClass extends (classARef as any){};
  const toInherit = () => true;
  inheritMetaValidators(classBRef, IntersectionTypeClass, toInherit);
  return IntersectionTypeClass as Type<A & B>;
}