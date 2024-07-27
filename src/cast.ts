import { Double, Long, ObjectId } from 'mongodb';

export function castDate(value: any) {
  if (typeof value !== 'object') {
    if (typeof value === 'string' && value.startsWith('$')) {
      return value;
    }
    return new Date(value);
  }
  if (Array.isArray(value)) {
    throw new Error('Date field can not be array');
  }

  for (const k in value) {
    value[k] = castDate(value[k]);
  }
  return value;
}

export function castObjectId(value: string) {
  return Array.isArray(value) ? value.map((v) => ObjectId.createFromHexString(v)) : ObjectId.createFromHexString(value);
}

export function castDouble(value: number){
  return Array.isArray(value) ? value.map((v) => new Double(v)) : new Double(value)
}
export function castLong(value: number, unsigned: boolean){
  return Array.isArray(value) ? value.map((v) => Long.fromNumber(v, unsigned)) : Long.fromNumber(value, unsigned);
}